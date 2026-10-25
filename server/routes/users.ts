import { Router } from "express";
import { db, usersTable, categoriesTable, workerCategoriesTable, userSubscriptionsTable, subscriptionPlansTable, servicesTable, adminUserBlocksTable, kycDocumentsTable } from "../db";
import { eq, and, ilike, count, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, invalidateUserCache } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { getOnlineUserSet } from "../lib/socketio";
import { pauseWorkerAlertQueue, resumeWorkerQueue } from "../lib/service-motor";
import {
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserStatusParams,
  UpdateUserStatusBody,
  GetNearbyWorkersQueryParams,
  UpdateWorkerAvailabilityParams,
  UpdateWorkerAvailabilityBody,
  ListUsersQueryParams,
} from "../zod";

const router = Router();

router.get("/users", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const query = ListUsersQueryParams.safeParse(req.query);
  const role = query.success ? query.data.role : undefined;
  const status = query.success ? query.data.status : undefined;
  const page = query.success ? (query.data.page ?? 1) : 1;
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, role as "client" | "worker" | "admin"));
  if (status) conditions.push(eq(usersTable.status, status as "active" | "blocked" | "pending"));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [users, totalResult] = await Promise.all([
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      rut: sql<string | null>`(
        SELECT ${kycDocumentsTable.rut}
        FROM ${kycDocumentsTable}
        WHERE ${kycDocumentsTable.userId} = ${usersTable.id}
        ORDER BY ${kycDocumentsTable.createdAt} DESC
        LIMIT 1
      )`,
      role: usersTable.role,
      status: usersTable.status,
      phone: usersTable.phone,
      avatarUrl: usersTable.avatarUrl,
      bio: usersTable.bio,
      skills: usersTable.skills,
      rating: usersTable.rating,
      totalReviews: usersTable.totalReviews,
      isAvailable: usersTable.isAvailable,
      lat: usersTable.lat,
      lng: usersTable.lng,
      suspendedUntil: usersTable.suspendedUntil,
      suspensionCount: usersTable.suspensionCount,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(whereClause).limit(limit).offset(offset),
    db.select({ count: count() }).from(usersTable).where(whereClause),
  ]);

  res.json({ users, total: totalResult[0]?.count ?? 0, page, limit });
});

router.get("/users/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    phone: usersTable.phone,
    avatarUrl: usersTable.avatarUrl,
    bio: usersTable.bio,
    skills: usersTable.skills,
    rating: usersTable.rating,
    totalReviews: usersTable.totalReviews,
    isAvailable: usersTable.isAvailable,
    serviceRadius: usersTable.serviceRadius,
    presentationVideoUrl: usersTable.presentationVideoUrl,
    visitFee: usersTable.visitFee,
    lat: usersTable.lat,
    lng: usersTable.lng,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, params.data.id)).limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Adjuntar plan de suscripción activo (para badge Pro/Pro+)
  const [activeSub] = await db
    .select({ planCode: userSubscriptionsTable.planCode })
    .from(userSubscriptionsTable)
    .where(
      and(
        eq(userSubscriptionsTable.userId, params.data.id),
        sql`${userSubscriptionsTable.status} IN ('active','trialing')`
      )
    )
    .orderBy(sql`created_at DESC`)
    .limit(1);

  res.json({ ...user, subscriptionPlan: activeSub?.planCode ?? null });
});

router.patch("/users/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (req.userId !== params.data.id && req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Un experto con trabajo asignado en curso no puede borrar su tarifa de
  // visita técnica ni sus datos de transferencia: son la base del cargo por
  // cancelación tardía de ese trabajo.
  const clearsPayoutData =
    (parsed.data.visitFee !== undefined && (parsed.data.visitFee == null || parsed.data.visitFee <= 0)) ||
    (parsed.data.payoutBankName !== undefined && !parsed.data.payoutBankName?.trim()) ||
    (parsed.data.payoutBankAccountType !== undefined && !parsed.data.payoutBankAccountType?.trim()) ||
    (parsed.data.payoutBankAccountNumber !== undefined && !parsed.data.payoutBankAccountNumber?.trim()) ||
    (parsed.data.payoutBankRut !== undefined && !parsed.data.payoutBankRut?.trim());
  if (clearsPayoutData) {
    const [activeJob] = await db.select({ id: servicesTable.id }).from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, params.data.id),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      )).limit(1);
    if (activeJob) {
      res.status(400).json({
        error: "No puedes borrar tu tarifa de visita técnica ni tus datos de transferencia mientras tienes un trabajo en curso.",
      });
      return;
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.bio !== undefined) updateData.bio = parsed.data.bio;
  if (parsed.data.skills !== undefined) updateData.skills = parsed.data.skills;
  if (parsed.data.categoryId !== undefined) updateData.categoryId = parsed.data.categoryId;
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.lat !== undefined) updateData.lat = parsed.data.lat;
  if (parsed.data.lng !== undefined) updateData.lng = parsed.data.lng;
  if (parsed.data.serviceRadius !== undefined) updateData.serviceRadius = parsed.data.serviceRadius;
  if (parsed.data.alertRadiusKm !== undefined) updateData.alertRadiusKm = parsed.data.alertRadiusKm ?? null;
  if (parsed.data.presentationVideoUrl !== undefined) updateData.presentationVideoUrl = parsed.data.presentationVideoUrl;
  if (parsed.data.visitFee !== undefined) updateData.visitFee = parsed.data.visitFee ?? null;
  if (parsed.data.payoutBankName !== undefined) updateData.payoutBankName = parsed.data.payoutBankName ?? null;
  if (parsed.data.payoutBankAccountType !== undefined) updateData.payoutBankAccountType = parsed.data.payoutBankAccountType ?? null;
  if (parsed.data.payoutBankAccountNumber !== undefined) updateData.payoutBankAccountNumber = parsed.data.payoutBankAccountNumber ?? null;
  if (parsed.data.payoutBankRut !== undefined) updateData.payoutBankRut = parsed.data.payoutBankRut ?? null;
  if (parsed.data.payoutDataConsent !== undefined) updateData.payoutDataConsent = parsed.data.payoutDataConsent;

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    phone: usersTable.phone,
    avatarUrl: usersTable.avatarUrl,
    bio: usersTable.bio,
    skills: usersTable.skills,
    rating: usersTable.rating,
    totalReviews: usersTable.totalReviews,
    isAvailable: usersTable.isAvailable,
    serviceRadius: usersTable.serviceRadius,
    alertRadiusKm: usersTable.alertRadiusKm,
    lat: usersTable.lat,
    lng: usersTable.lng,
    presentationVideoUrl: usersTable.presentationVideoUrl,
    visitFee: usersTable.visitFee,
    payoutBankName: usersTable.payoutBankName,
    payoutBankAccountType: usersTable.payoutBankAccountType,
    payoutBankAccountNumber: usersTable.payoutBankAccountNumber,
    payoutBankRut: usersTable.payoutBankRut,
    payoutDataConsent: usersTable.payoutDataConsent,
    createdAt: usersTable.createdAt,
  });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Invalida el cache de auth para que el middleware no use rol/status viejos en
  // peticiones inmediatas tras editar el perfil.
  invalidateUserCache(updated.id);

  res.json(updated);
});

router.patch("/users/:id/status", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateUserStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.status === "blocked") {
    res.status(400).json({ error: "Selecciona una duración mediante el flujo de bloqueo administrativo" });
    return;
  }

  if (parsed.data.status === "active") {
    const [activeBlock] = await db.select({ id: adminUserBlocksTable.id })
      .from(adminUserBlocksTable)
      .where(and(
        eq(adminUserBlocksTable.userId, params.data.id),
        sql`${adminUserBlocksTable.endedAt} IS NULL`,
      ))
      .limit(1);
    if (activeBlock) {
      res.status(400).json({ error: "La cuenta tiene un bloqueo administrativo activo; usa Desbloquear" });
      return;
    }
  }

  const [updated] = await db.update(usersTable).set({ status: parsed.data.status as "active" | "blocked" | "pending" }).where(eq(usersTable.id, params.data.id)).returning({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    phone: usersTable.phone,
    avatarUrl: usersTable.avatarUrl,
    bio: usersTable.bio,
    skills: usersTable.skills,
    rating: usersTable.rating,
    totalReviews: usersTable.totalReviews,
    isAvailable: usersTable.isAvailable,
    lat: usersTable.lat,
    lng: usersTable.lng,
    createdAt: usersTable.createdAt,
  });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  invalidateUserCache(updated.id);
  res.json(updated);
});

// Levantar manualmente una suspensión temporal (sanción por cancelaciones).
// Solo admin. No toca suspension_count (el historial de reincidencia se conserva).
router.post("/users/:id/clear-suspension", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ suspendedUntil: null })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, suspendedUntil: usersTable.suspendedUntil });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  invalidateUserCache(updated.id);
  res.json({ ok: true });
});

// Cache de workers disponibles — se invalida cuando un worker cambia disponibilidad.
// TTL: 30s (balance entre frescura de datos y reducir carga en DB).
interface NearbyWorkersCacheEntry {
  workers: Array<{
    id: number; name: string; avatarUrl: string | null;
    skills: string | null; categoryId: number | null; bio: string | null;
    rating: number | null; totalReviews: number; isAvailable: boolean;
    lat: number | null; lng: number | null;
  }>;
  categoryMap: Record<number, unknown>;
  subsMap: Record<number, string>;
  fetchedAt: number;
}
let nearbyWorkersCache: NearbyWorkersCacheEntry | null = null;
const NEARBY_CACHE_TTL_MS = 30_000;

export function invalidateNearbyWorkersCache(): void {
  nearbyWorkersCache = null;
}

router.get("/workers/nearby", authenticate, async (req, res): Promise<void> => {
  const params = GetNearbyWorkersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { lat, lng, radius = 10, categoryId } = params.data;

  // Refresca el listado base de workers si el caché expiró (30s TTL).
  // La DB se consulta como máximo 1 vez cada 30s para todos los usuarios;
  // el filtro de distancia Haversine se aplica en JS sobre el listado cacheado.
  const now = Date.now();
  if (!nearbyWorkersCache || now - nearbyWorkersCache.fetchedAt > NEARBY_CACHE_TTL_MS) {
    const freshWorkers = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      skills: usersTable.skills,
      categoryId: usersTable.categoryId,
      bio: usersTable.bio,
      rating: usersTable.rating,
      totalReviews: usersTable.totalReviews,
      isAvailable: usersTable.isAvailable,
      lat: usersTable.lat,
      lng: usersTable.lng,
    }).from(usersTable).where(
      and(
        eq(usersTable.role, "worker"),
        eq(usersTable.status, "active"),
        eq(usersTable.isAvailable, true),
      )
    ).limit(200);

    const catIds = [...new Set(freshWorkers.map(w => w.categoryId).filter(Boolean))] as number[];
    const cats = catIds.length > 0
      ? await db.select().from(categoriesTable).where(sql`${categoriesTable.id} IN (${sql.join(catIds.map(id => sql`${id}`), sql`, `)})`)
      : [];
    const freshCategoryMap = Object.fromEntries(cats.map(c => [c.id, c]));

    const wIds = freshWorkers.map(w => w.id);
    const subs = wIds.length > 0
      ? await db
          .select({ userId: userSubscriptionsTable.userId, planCode: userSubscriptionsTable.planCode })
          .from(userSubscriptionsTable)
          .where(and(
            inArray(userSubscriptionsTable.userId, wIds),
            sql`${userSubscriptionsTable.status} IN ('active','trialing')`
          ))
      : [];
    const planRank = (code: string) =>
      code.startsWith("pro_plus") ? 3 : code.startsWith("pro") ? 2 : 1;
    const freshSubsMap: Record<number, string> = {};
    for (const sub of subs) {
      if (!freshSubsMap[sub.userId] || planRank(sub.planCode) > planRank(freshSubsMap[sub.userId])) {
        freshSubsMap[sub.userId] = sub.planCode;
      }
    }

    nearbyWorkersCache = {
      workers: freshWorkers,
      categoryMap: freshCategoryMap,
      subsMap: freshSubsMap,
      fetchedAt: Date.now(),
    };
  }

  const { workers, categoryMap, subsMap } = nearbyWorkersCache;

  const onlineSet = getOnlineUserSet();

  const filtered = workers
    .filter(w => !categoryId || w.categoryId === categoryId)
    .map(w => {
      let distanceKm: number | null = null;
      if (w.lat !== null && w.lng !== null) {
        const R = 6371;
        const dLat = ((w.lat - lat) * Math.PI) / 180;
        const dLng = ((w.lng - lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat * Math.PI) / 180) * Math.cos((w.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      return { ...w, distanceKm };
    })
    .filter(w => w.distanceKm === null || w.distanceKm <= radius)
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .map(w => ({
      ...w,
      category: w.categoryId ? (categoryMap as Record<number, unknown>)[w.categoryId] ?? null : null,
      subscriptionPlan: subsMap[w.id] ?? null,
      isOnline: onlineSet.has(w.id),
    }));

  res.json(filtered);
});

router.patch("/workers/:id/availability", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateWorkerAvailabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (req.userId !== params.data.id && req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateWorkerAvailabilityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.isAvailable) {
    const [worker] = await db.select({
      kycStatus: usersTable.kycStatus,
      suspendedUntil: usersTable.suspendedUntil,
    }).from(usersTable).where(eq(usersTable.id, params.data.id)).limit(1);
    if (!worker || worker.kycStatus !== "approved") {
      res.status(403).json({ error: "Debes verificar tu identidad (KYC) antes de activarte como disponible" });
      return;
    }
    if (worker.suspendedUntil && worker.suspendedUntil > new Date()) {
      res.status(403).json({
        error: `Tu cuenta está suspendida temporalmente hasta el ${worker.suspendedUntil.toLocaleString("es-CL", { timeZone: "America/Santiago" })}.`,
        code: "ACCOUNT_SUSPENDED",
      });
      return;
    }
  }

  const updateData: Record<string, unknown> = { isAvailable: parsed.data.isAvailable };
  if (parsed.data.lat !== undefined) updateData.lat = parsed.data.lat;
  if (parsed.data.lng !== undefined) updateData.lng = parsed.data.lng;

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    phone: usersTable.phone,
    avatarUrl: usersTable.avatarUrl,
    bio: usersTable.bio,
    skills: usersTable.skills,
    rating: usersTable.rating,
    totalReviews: usersTable.totalReviews,
    isAvailable: usersTable.isAvailable,
    lat: usersTable.lat,
    lng: usersTable.lng,
    createdAt: usersTable.createdAt,
  });

  if (!updated) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  // Invalida el caché de workers cercanos para que el próximo request refleje
  // el nuevo estado de disponibilidad/ubicación del worker.
  invalidateNearbyWorkersCache();

  if (updated.role === "worker" || req.userRole === "worker") {
    if (updated.isAvailable) await resumeWorkerQueue(updated.id);
    else await pauseWorkerAlertQueue(updated.id);
  }

  res.json(updated);
});

// GET /api/workers/:id/categories — returns all categories for a worker
router.get("/workers/:id/categories", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const workerId = parseInt(String(req.params.id));
  if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (req.userId !== workerId && req.userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db
    .select({
      id: workerCategoriesTable.id,
      categoryId: workerCategoriesTable.categoryId,
      isPrimary: workerCategoriesTable.isPrimary,
      name: categoriesTable.name,
      icon: categoriesTable.icon,
    })
    .from(workerCategoriesTable)
    .innerJoin(categoriesTable, eq(workerCategoriesTable.categoryId, categoriesTable.id))
    .where(eq(workerCategoriesTable.workerId, workerId));

  res.json(rows);
});

const UpdateWorkerCategoriesBody = z.object({
  categoryIds: z.array(z.number().int().positive()).min(1, "Debes seleccionar al menos una profesión"),
  primaryCategoryId: z.number().int().positive(),
});

// PUT /api/workers/:id/categories — replaces all categories for a worker
router.put("/workers/:id/categories", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const workerId = parseInt(String(req.params.id));
  if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (req.userId !== workerId && req.userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateWorkerCategoriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { categoryIds, primaryCategoryId } = parsed.data;

  if (!categoryIds.includes(primaryCategoryId)) {
    res.status(400).json({ error: "La profesión principal debe estar en la lista" });
    return;
  }

  try {
    const [plan] = await db
      .select({
        planCode: userSubscriptionsTable.planCode,
        features: subscriptionPlansTable.features,
      })
      .from(userSubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(userSubscriptionsTable.planCode, subscriptionPlansTable.code))
      .where(and(
        eq(userSubscriptionsTable.userId, workerId),
        sql`${userSubscriptionsTable.status} IN ('active', 'trialing')`,
      ))
      .orderBy(sql`${userSubscriptionsTable.createdAt} DESC`)
      .limit(1);

    const isPremiumPlan = plan?.planCode === "pro_plus_monthly" || plan?.planCode === "pro_plus_annual";
    const configuredLimit = (plan?.features as Record<string, unknown> | undefined)?.categories;
    const maxCategories = isPremiumPlan
      ? Infinity
      : typeof configuredLimit === "number" && configuredLimit >= 0
        ? configuredLimit
        : 1;

    if (categoryIds.length > maxCategories) {
      res.status(403).json({
        error: `Tu plan permite hasta ${maxCategories} categoría${maxCategories === 1 ? "" : "s"}.`,
      });
      return;
    }

    const rows = await db.transaction(async (tx) => {
      await tx.delete(workerCategoriesTable).where(eq(workerCategoriesTable.workerId, workerId));

      await tx.insert(workerCategoriesTable).values(
        categoryIds.map((cId) => ({ workerId, categoryId: cId, isPrimary: cId === primaryCategoryId }))
      );

      // Keep users.category_id in sync with primary
      await tx.update(usersTable).set({ categoryId: primaryCategoryId }).where(eq(usersTable.id, workerId));

      return tx
        .select({
          id: workerCategoriesTable.id,
          categoryId: workerCategoriesTable.categoryId,
          isPrimary: workerCategoriesTable.isPrimary,
          name: categoriesTable.name,
          icon: categoriesTable.icon,
        })
        .from(workerCategoriesTable)
        .innerJoin(categoriesTable, eq(workerCategoriesTable.categoryId, categoriesTable.id))
        .where(eq(workerCategoriesTable.workerId, workerId));
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar profesiones" });
  }
});

export default router;
