import { Router } from "express";
import { db, usersTable, adminUserBlocksTable, subscriptionPlansTable, userSubscriptionsTable } from "../db";
import { servicesTable, workerCategoriesTable } from "../db/schema";
import { eq, and, count, isNull } from "drizzle-orm";
import { hashPassword, comparePassword, signToken } from "../lib/auth";
import { authenticate, invalidateUserCache } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { RegisterBody, LoginBody } from "../zod";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, password, role, phone, skills, bio, categoryId, categoryIds, lat, lng, platformType } = parsed.data;
  // Normalizar email para evitar duplicados por diferencias de casing
  const email = parsed.data.email.toLowerCase().trim();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const hashed = hashPassword(password);
  const verifyToken = crypto.randomBytes(32).toString("hex");

  const [user] = await db.insert(usersTable).values({
    name,
    email,
    password: hashed,
    role: role as "client" | "worker",
    phone: phone ?? undefined,
    skills: skills ?? undefined,
    bio: bio ?? undefined,
    categoryId: categoryId ?? undefined,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    isAvailable: role === "worker",
    emailVerified: false,
    emailVerifyToken: verifyToken,
    platformType: (platformType ?? "expertos") as "expertos" | "fletes",
  }).returning();

  // Guardar relaciones worker_categories si es trabajador y envió categoryIds
  if (role === "worker" && categoryIds && categoryIds.length > 0) {
    const rows = categoryIds.map((catId, idx) => ({
      workerId: user.id,
      categoryId: catId,
      isPrimary: idx === 0,
    }));
    await db.insert(workerCategoriesTable).values(rows).onConflictDoNothing();
  }

  // Las cuentas nuevas de expertos reciben 15 días de Pro+; las cuentas de
  // cliente conservan su mes de prueba. Al vencer, el cron aplica el plan gratis.
  // No se cobra durante el trial y la ruta de suscripciones lo degrada al plan
  // gratuito correspondiente cuando vence.
  try {
    const trialPlanCode = role === "worker" ? "pro_plus_monthly" : "client_premium_monthly";
    const [trialPlan] = await db
      .select({ code: subscriptionPlansTable.code })
      .from(subscriptionPlansTable)
      .where(and(
        eq(subscriptionPlansTable.code, trialPlanCode),
        eq(subscriptionPlansTable.isActive, true),
      ))
      .limit(1);

    if (trialPlan) {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + (role === "worker" ? 15 : 30));
      await db.insert(userSubscriptionsTable).values({
        userId: user.id,
        planCode: trialPlan.code,
        status: "trialing",
        interval: "monthly",
        pricePaidClp: 0,
        trialEndsAt,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEndsAt,
      });
    } else {
      logger.warn({ userId: user.id, trialPlanCode }, "Trial plan not found for new user");
    }
  } catch (trialErr) {
    logger.error({ err: trialErr, userId: user.id }, "Could not create new-user subscription trial");
  }

  const verifyUrl = `${process.env.APP_URL || "http://localhost:8081"}/verify-email?token=${verifyToken}`;
  import("../lib/email").then(({ emailService }) => {
    emailService.sendEmailVerification(email, name, verifyUrl).catch(() => {});
  });

  res.status(201).json({ needsVerification: true, message: "Cuenta creada. Por favor revisa tu correo para verificar tu cuenta." });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Normalizar email — evita que "User@mail.com" y "user@mail.com" den 401 distinto
  const email = parsed.data.email.toLowerCase().trim();
  const { password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    req.log.warn({ email }, "Login failed — email not found");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.emailVerified) {
    req.log.warn({ userId: user.id, email }, "Login failed — email not verified");
    res.status(403).json({ error: "EMAIL_NOT_VERIFIED", message: "Debes verificar tu correo electrónico antes de iniciar sesión." });
    return;
  }

  const valid = comparePassword(password, user.password);
  if (!valid) {
    req.log.warn({ userId: user.id, email }, "Login failed — wrong password");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const now = new Date();
  const [updatedUser] = await db.update(usersTable).set({
    lastActivityAt: now,
    // La selfie ya no se exige al volver de una inactividad prolongada.
    // Limpiamos el indicador antiguo para que cuentas existentes no queden
    // asociadas al flujo retirado.
    securitySelfieRequired: false,
  }).where(eq(usersTable.id, user.id)).returning();
  invalidateUserCache(user.id);

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  const { password: _p, ...userWithoutPassword } = updatedUser ?? { ...user, lastActivityAt: now, securitySelfieRequired: false };
  const [activeAdminBlock] = user.status === "blocked"
    ? await db.select({ blockedUntil: adminUserBlocksTable.blockedUntil })
      .from(adminUserBlocksTable)
      .where(and(
        eq(adminUserBlocksTable.userId, user.id),
        isNull(adminUserBlocksTable.endedAt),
      ))
      .limit(1)
    : [];

  req.log.info({ userId: user.id, role: user.role }, "Login successful");
  res.json({
    token,
    user: {
      ...userWithoutPassword,
      blockedUntil: activeAdminBlock?.blockedUntil ?? null,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { password: _p, ...userWithoutPassword } = user;

  const activeRole = req.userRole!;
  const originalRole = req.originalRole;

  const baseUser = { ...userWithoutPassword, role: activeRole, ...(originalRole ? { originalRole } : {}) };
  if (user.status === "blocked") {
    const [activeAdminBlock] = await db.select({ blockedUntil: adminUserBlocksTable.blockedUntil })
      .from(adminUserBlocksTable)
      .where(and(
        eq(adminUserBlocksTable.userId, user.id),
        isNull(adminUserBlocksTable.endedAt),
      ))
      .limit(1);
    (baseUser as any).blockedUntil = activeAdminBlock?.blockedUntil ?? null;
  }

  if (user.role === "worker") {
    const [completedResult] = await db
      .select({ count: count() })
      .from(servicesTable)
      .where(and(eq(servicesTable.workerId, user.id), eq(servicesTable.status, "completed")));
    const [cancelledResult] = await db
      .select({ count: count() })
      .from(servicesTable)
      .where(and(eq(servicesTable.workerId, user.id), eq(servicesTable.status, "cancelled")));

    const completedJobs = completedResult?.count ?? 0;
    const cancelledJobs = cancelledResult?.count ?? 0;
    const totalFinished = completedJobs + cancelledJobs;
    const cumplimiento = totalFinished > 0 ? Math.round((completedJobs / totalFinished) * 100) : 100;

    res.json({ ...baseUser, completedJobs, cancelledJobs, cumplimiento });
    return;
  }

  res.json(baseUser);
});

router.post("/auth/switch-role", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { targetRole } = req.body;
  if (!targetRole || typeof targetRole !== "string") {
    res.status(400).json({ error: "targetRole requerido" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  const realRole = req.originalRole || user.role;

  const allowed: Record<string, string[]> = {
    client: ["client", "worker"],
    worker: ["client", "worker"],
    admin:  ["client", "worker", "admin"],
  };
  if (!allowed[realRole]?.includes(targetRole)) {
    res.status(403).json({ error: "Cambio de rol no permitido" });
    return;
  }

  const isRestoringOriginal = targetRole === realRole;
  const newToken = signToken({
    id: user.id,
    email: user.email,
    role: targetRole,
    ...(isRestoringOriginal ? {} : { originalRole: realRole }),
  });

  res.json({ token: newToken });
});

router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token inválido" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.emailVerifyToken, token)).limit(1);
  if (!user) {
    res.status(400).json({ error: "El enlace es inválido o ya fue usado" });
    return;
  }

  await db.update(usersTable).set({ emailVerified: true, emailVerifyToken: null }).where(eq(usersTable.id, user.id));

  const jwtToken = signToken({ id: user.id, email: user.email, role: user.role });
  const { password: _p, ...userWithoutPassword } = user;

  res.json({ token: jwtToken, user: { ...userWithoutPassword, emailVerified: true } });
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email requerido" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
  if (!user || user.emailVerified) {
    res.json({ message: "Si el email existe y no está verificado, recibirás un nuevo enlace." });
    return;
  }

  const verifyToken = crypto.randomBytes(32).toString("hex");
  await db.update(usersTable).set({ emailVerifyToken: verifyToken }).where(eq(usersTable.id, user.id));

  const verifyUrl = `${process.env.APP_URL || "http://localhost:8081"}/verify-email?token=${verifyToken}`;
  import("../lib/email").then(({ emailService }) => {
    emailService.sendEmailVerification(user.email, user.name, verifyUrl).catch(() => {});
  });

  res.json({ message: "Si el email existe y no está verificado, recibirás un nuevo enlace." });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email requerido" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
  if (!user) {
    res.json({ message: "Si el email existe, recibirás un enlace de recuperación." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  await db.update(usersTable).set({ resetToken: token, resetTokenExpires: expires }).where(eq(usersTable.id, user.id));

  const resetUrl = `${process.env.APP_URL || "http://localhost:8081"}/reset-password?token=${token}`;

  import("../lib/email").then(({ emailService }) => {
    emailService.sendPasswordReset(user.email, user.name, resetUrl).catch(() => {});
  });

  res.json({ message: "Si el email existe, recibirás un enlace de recuperación." });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Token y contraseña son requeridos" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, token)).limit(1);
  if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    res.status(400).json({ error: "El enlace es inválido o ha expirado" });
    return;
  }

  const hashed = hashPassword(password);
  await db.update(usersTable).set({ password: hashed, resetToken: null, resetTokenExpires: null }).where(eq(usersTable.id, user.id));

  res.json({ message: "Contraseña actualizada correctamente" });
});

export default router;
