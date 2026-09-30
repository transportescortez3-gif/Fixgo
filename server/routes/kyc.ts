import { Router } from "express";
import { db, usersTable, kycDocumentsTable } from "../db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole, invalidateUserCache } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { createNotification } from "../lib/createNotification";
import { emitToUser } from "../lib/socketio";
import { logger } from "../lib/logger";
import {
  SubmitKycBody,
  RejectKycBody,
  ListKycSubmissionsQueryParams,
  ApproveKycParams,
  RejectKycParams,
} from "../zod";

const router = Router();

router.post("/kyc/submit", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = SubmitKycBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  // users.role conserva el rol de registro; el JWT refleja el perfil activo
  // después de usar Cliente ↔ Experto. KYC debe seguir ese perfil activo.
  if (!user || req.userRole !== "worker") {
    res.status(403).json({ error: "Solo trabajadores pueden enviar KYC" });
    return;
  }

  if (user.kycStatus === "approved") {
    res.status(400).json({ error: "Tu identidad ya fue verificada" });
    return;
  }

  if (user.kycStatus === "pending") {
    res.status(400).json({ error: "Ya tienes una solicitud pendiente de revisión" });
    return;
  }

  const { documentType, rut, fullName, cedulaFrontPath, cedulaBackPath, selfiePath, antecedentesPath } = parsed.data;

  const [kycDoc] = await db.insert(kycDocumentsTable).values({
    userId: req.userId!,
    documentType: documentType as "cedula" | "licencia",
    rut,
    fullName,
    cedulaFrontPath,
    cedulaBackPath,
    selfiePath,
    antecedentesPath,
    status: "pending",
  }).returning();

  await db.update(usersTable).set({ kycStatus: "pending" }).where(eq(usersTable.id, req.userId!));

  res.status(201).json(kycDoc);
});

router.get("/kyc/status", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const [kycDoc] = await db.select()
    .from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, req.userId!))
    .orderBy(desc(kycDocumentsTable.createdAt))
    .limit(1);

  if (!kycDoc) {
    res.json({ id: 0, userId: req.userId!, rut: "", fullName: "", cedulaFrontPath: "", cedulaBackPath: "", selfiePath: "", status: "not_submitted", rejectionReason: null, reviewedBy: null, reviewedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return;
  }

  res.json(kycDoc);
});

router.get("/admin/kyc", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const statusFilter = req.query.status as string | undefined;

  let query = db.select({
    id: kycDocumentsTable.id,
    userId: kycDocumentsTable.userId,
    documentType: kycDocumentsTable.documentType,
    rut: kycDocumentsTable.rut,
    fullName: kycDocumentsTable.fullName,
    cedulaFrontPath: kycDocumentsTable.cedulaFrontPath,
    cedulaBackPath: kycDocumentsTable.cedulaBackPath,
    selfiePath: kycDocumentsTable.selfiePath,
    status: kycDocumentsTable.status,
    rejectionReason: kycDocumentsTable.rejectionReason,
    reviewedAt: kycDocumentsTable.reviewedAt,
    createdAt: kycDocumentsTable.createdAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userPhone: usersTable.phone,
    userCategoryId: usersTable.categoryId,
  })
  .from(kycDocumentsTable)
  .innerJoin(usersTable, eq(kycDocumentsTable.userId, usersTable.id))
  .orderBy(desc(kycDocumentsTable.createdAt))
  .$dynamic();

  if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
    query = query.where(eq(kycDocumentsTable.status, statusFilter as "pending" | "approved" | "rejected"));
  }

  const results = await query;
  res.json(results);
});

router.post("/admin/kyc/:id/approve", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [kycDoc] = await db.select().from(kycDocumentsTable).where(eq(kycDocumentsTable.id, id)).limit(1);
  if (!kycDoc) {
    res.status(404).json({ error: "Documento KYC no encontrado" });
    return;
  }

  const [updated] = await db.update(kycDocumentsTable).set({
    status: "approved",
    reviewedBy: req.userId!,
    reviewedAt: new Date(),
  }).where(eq(kycDocumentsTable.id, id)).returning();

  await db.update(usersTable).set({ kycStatus: "approved" }).where(eq(usersTable.id, kycDoc.userId));
  invalidateUserCache(kycDoc.userId);

  try {
    await createNotification({
      userId: kycDoc.userId,
      title: "Identidad verificada ✅",
      message: "Tu KYC fue aprobado. Ya puedes activarte como disponible y recibir solicitudes.",
      type: "kyc_approved",
      relatedId: kycDoc.id,
    });
    emitToUser(kycDoc.userId, "kyc_updated", { status: "approved" });
  } catch (err) {
    logger.error({ err: (err as Error).message, kycId: id }, "KYC aprobado pero falló la notificación");
  }

  res.json(updated);
});

router.post("/admin/kyc/:id/reject", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const parsed = RejectKycBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [kycDoc] = await db.select().from(kycDocumentsTable).where(eq(kycDocumentsTable.id, id)).limit(1);
  if (!kycDoc) {
    res.status(404).json({ error: "Documento KYC no encontrado" });
    return;
  }

  const [updated] = await db.update(kycDocumentsTable).set({
    status: "rejected",
    rejectionReason: parsed.data.reason,
    reviewedBy: req.userId!,
    reviewedAt: new Date(),
  }).where(eq(kycDocumentsTable.id, id)).returning();

  await db.update(usersTable).set({ kycStatus: "rejected" }).where(eq(usersTable.id, kycDoc.userId));
  invalidateUserCache(kycDoc.userId);

  try {
    await createNotification({
      userId: kycDoc.userId,
      title: "KYC rechazado",
      message: parsed.data.reason
        ? `Tu verificación fue rechazada: ${parsed.data.reason}. Puedes corregir los documentos y reenviar.`
        : "Tu verificación fue rechazada. Puedes corregir los documentos y reenviar.",
      type: "kyc_rejected",
      relatedId: kycDoc.id,
    });
    emitToUser(kycDoc.userId, "kyc_updated", { status: "rejected", reason: parsed.data.reason });
  } catch (err) {
    logger.error({ err: (err as Error).message, kycId: id }, "KYC rechazado pero falló la notificación");
  }

  res.json(updated);
});

export default router;
