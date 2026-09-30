import { Router } from "express";
import {
  db, usersTable, servicesTable, paymentsTable, commissionConfigTable, siteSettingsTable,
  reviewsTable, balanceTransactionsTable, couponsTable, userSubscriptionsTable, subscriptionPlansTable,
  messagesTable, proposalsTable, kycDocumentsTable, notificationsTable,
  supportTicketsTable, ticketResponsesTable, payoutsTable, userFavoritesTable, couponUsesTable,
  adminUserBlocksTable, adminPhoneVerificationsTable,
} from "../db";
import { eq, count, sum, sql, and, gte, or, desc, ilike, inArray, asc, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole, invalidateUserCache } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { UpdateCommissionRateBody, GetRevenueStatsQueryParams } from "../zod";
import { logger } from "../lib/logger";
import { emitToUser } from "../lib/socketio";
import { z } from "zod/v4";
import {
  ADMIN_BLOCK_DURATIONS,
  expireDueAdminBlocks,
  getAdminBlockUntil,
  isAdminBlockDuration,
  refreshAdminBlockExpiryTimer,
  type AdminBlockDuration,
} from "../lib/admin-blocks";

const AdminEditUserBody = z.object({
  role: z.enum(["client", "worker", "admin"]).optional(),
  kycStatus: z.enum(["not_submitted", "pending", "approved", "rejected"]).optional(),
  emailVerified: z.boolean().optional(),
});

const router = Router();
const adminBlocker = alias(usersTable, "admin_blocker");
const adminUnblocker = alias(usersTable, "admin_unblocker");
const phoneVerificationAdmin = alias(usersTable, "phone_verification_admin");

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.trim().replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

const ManualPhoneVerificationBody = z.object({
  reason: z.string().trim().min(10, "La razón debe tener al menos 10 caracteres").max(500),
  confirmed: z.literal(true, { error: "Debes confirmar la verificación manual" }),
});

const AdminBlockBody = z.object({
  duration: z.string().refine(isAdminBlockDuration, "Duración de bloqueo inválida"),
});

const blockDurationLabels: Record<string, string> = {
  "24h": "24 horas",
  "7d": "7 días",
  "30d": "30 días",
  indefinite: "Sin fecha de término",
};

router.get("/admin/blocked-users", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  await expireDueAdminBlocks();

  const blockedUsers = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    avatarUrl: usersTable.avatarUrl,
    blockId: adminUserBlocksTable.id,
    duration: adminUserBlocksTable.duration,
    durationLabel: sql<string>`CASE
      WHEN ${adminUserBlocksTable.duration} = '24h' THEN '24 horas'
      WHEN ${adminUserBlocksTable.duration} = '7d' THEN '7 días'
      WHEN ${adminUserBlocksTable.duration} = '30d' THEN '30 días'
      ELSE 'Sin fecha de término'
    END`,
    blockedAt: adminUserBlocksTable.blockedAt,
    blockedUntil: adminUserBlocksTable.blockedUntil,
    blockedByAdminId: adminUserBlocksTable.blockedByAdminId,
    blockedByAdminName: adminBlocker.name,
  })
    .from(adminUserBlocksTable)
    .innerJoin(usersTable, eq(usersTable.id, adminUserBlocksTable.userId))
    .leftJoin(adminBlocker, eq(adminBlocker.id, adminUserBlocksTable.blockedByAdminId))
    .where(and(
      isNull(adminUserBlocksTable.endedAt),
      eq(usersTable.status, "blocked"),
    ))
    .orderBy(asc(adminUserBlocksTable.blockedAt));

  res.json({ users: blockedUsers });
});

router.post("/admin/users/:id/block", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const parsed = AdminBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Debes seleccionar una duración de bloqueo" });
    return;
  }

  const duration = parsed.data.duration as AdminBlockDuration;
  if (userId === req.userId) {
    res.status(400).json({ error: "No puedes bloquear tu propia cuenta de administrador" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        status: usersTable.status,
      }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

      if (!target) return { kind: "not_found" as const };
      if (target.role === "admin") return { kind: "admin" as const };

      const [activeBlock] = await tx.select({ id: adminUserBlocksTable.id })
        .from(adminUserBlocksTable)
        .where(and(
          eq(adminUserBlocksTable.userId, userId),
          isNull(adminUserBlocksTable.endedAt),
        ))
        .limit(1);

      if (activeBlock) return { kind: "already_blocked" as const };

      const blockedAt = new Date();
      const blockedUntil = getAdminBlockUntil(duration, blockedAt);
      const [block] = await tx.insert(adminUserBlocksTable).values({
        userId,
        blockedByAdminId: req.userId!,
        duration,
        blockedAt,
        blockedUntil,
      }).returning();

      const [updated] = await tx.update(usersTable)
        .set({ status: "blocked", isAvailable: false, updatedAt: blockedAt })
        .where(eq(usersTable.id, userId))
        .returning({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          status: usersTable.status,
        });

      return { kind: "ok" as const, block, user: updated };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    if (result.kind === "admin") {
      res.status(400).json({ error: "Las cuentas de administrador no pueden bloquearse desde este flujo" });
      return;
    }
    if (result.kind === "already_blocked") {
      res.status(409).json({ error: "La cuenta ya está bloqueada" });
      return;
    }

    invalidateUserCache(userId);
    emitToUser(userId, "account_status_updated", {
      status: "blocked",
      blockedUntil: result.block.blockedUntil?.toISOString() ?? null,
      reason: "manual",
    });
    await refreshAdminBlockExpiryTimer();
    res.json({
      ok: true,
      user: result.user,
      block: {
        ...result.block,
        durationLabel: blockDurationLabels[result.block.duration] ?? result.block.duration,
      },
    });
  } catch (error: any) {
    logger.error({ err: error, userId }, "Admin account block failed");
    res.status(500).json({ error: "No se pudo bloquear la cuenta" });
  }
});

router.post("/admin/users/:id/unblock", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        status: usersTable.status,
      }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

      if (!target) return { kind: "not_found" as const };

      const now = new Date();
      await tx.update(adminUserBlocksTable)
        .set({
          endedAt: now,
          endReason: "manual",
          unblockedByAdminId: req.userId!,
        })
        .where(and(
          eq(adminUserBlocksTable.userId, userId),
          isNull(adminUserBlocksTable.endedAt),
        ));

      const [updated] = await tx.update(usersTable)
        .set({ status: "active", isAvailable: false, updatedAt: now })
        .where(eq(usersTable.id, userId))
        .returning({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          status: usersTable.status,
        });

      return { kind: "ok" as const, user: updated };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    invalidateUserCache(userId);
    emitToUser(userId, "account_status_updated", {
      status: "active",
      blockedUntil: null,
      reason: "manual",
    });
    await refreshAdminBlockExpiryTimer();
    res.json({ ok: true, user: result.user });
  } catch (error: any) {
    logger.error({ err: error, userId }, "Admin account unblock failed");
    res.status(500).json({ error: "No se pudo desbloquear la cuenta" });
  }
});

router.get("/admin/users/:id/block-history", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  await expireDueAdminBlocks();

  const history = await db.select({
    id: adminUserBlocksTable.id,
    duration: adminUserBlocksTable.duration,
    durationLabel: sql<string>`CASE
      WHEN ${adminUserBlocksTable.duration} = '24h' THEN '24 horas'
      WHEN ${adminUserBlocksTable.duration} = '7d' THEN '7 días'
      WHEN ${adminUserBlocksTable.duration} = '30d' THEN '30 días'
      ELSE 'Sin fecha de término'
    END`,
    blockedAt: adminUserBlocksTable.blockedAt,
    blockedUntil: adminUserBlocksTable.blockedUntil,
    endedAt: adminUserBlocksTable.endedAt,
    endReason: adminUserBlocksTable.endReason,
    blockedByAdminId: adminUserBlocksTable.blockedByAdminId,
    blockedByAdminName: adminBlocker.name,
    unblockedByAdminId: adminUserBlocksTable.unblockedByAdminId,
    unblockedByAdminName: adminUnblocker.name,
  })
    .from(adminUserBlocksTable)
    .leftJoin(adminBlocker, eq(adminBlocker.id, adminUserBlocksTable.blockedByAdminId))
    .leftJoin(adminUnblocker, eq(adminUnblocker.id, adminUserBlocksTable.unblockedByAdminId))
    .where(eq(adminUserBlocksTable.userId, userId))
    .orderBy(desc(adminUserBlocksTable.blockedAt));

  res.json({ history });
});

router.get("/admin/stats", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [
    totalUsersResult,
    totalWorkersResult,
    totalClientsResult,
    totalServicesResult,
    pendingServicesResult,
    completedServicesResult,
    revenueResult,
    activeWorkersResult,
    newUsersResult,
    newServicesResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "worker")),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "client")),
    db.select({ count: count() }).from(servicesTable),
    db.select({ count: count() }).from(servicesTable).where(eq(servicesTable.status, "pending")),
    db.select({ count: count() }).from(servicesTable).where(eq(servicesTable.status, "completed")),
    db.select({ totalRevenue: sum(paymentsTable.amount), totalCommission: sum(paymentsTable.commissionAmount) }).from(paymentsTable).where(eq(paymentsTable.status, "completed")),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.isAvailable, true)),
    db.select({ count: count() }).from(usersTable).where(gte(usersTable.createdAt, sql`NOW() - INTERVAL '30 days'`)),
    db.select({ count: count() }).from(servicesTable).where(gte(servicesTable.createdAt, sql`NOW() - INTERVAL '30 days'`)),
  ]);

  res.json({
    totalUsers: totalUsersResult[0]?.count ?? 0,
    totalWorkers: totalWorkersResult[0]?.count ?? 0,
    totalClients: totalClientsResult[0]?.count ?? 0,
    totalServices: totalServicesResult[0]?.count ?? 0,
    pendingServices: pendingServicesResult[0]?.count ?? 0,
    completedServices: completedServicesResult[0]?.count ?? 0,
    totalRevenue: parseFloat(String(revenueResult[0]?.totalRevenue ?? 0)),
    totalCommission: parseFloat(String(revenueResult[0]?.totalCommission ?? 0)),
    activeWorkers: activeWorkersResult[0]?.count ?? 0,
    newUsersThisMonth: newUsersResult[0]?.count ?? 0,
    newServicesThisMonth: newServicesResult[0]?.count ?? 0,
  });
});

router.get("/admin/commission", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const configs = await db.select().from(commissionConfigTable).limit(1);
  if (configs.length === 0) {
    const [config] = await db.insert(commissionConfigTable).values({ rate: 0.15 }).returning();
    res.json(config);
    return;
  }
  res.json(configs[0]);
});

router.patch("/admin/commission", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = UpdateCommissionRateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const configs = await db.select().from(commissionConfigTable).limit(1);
  let config;

  if (configs.length === 0) {
    const [created] = await db.insert(commissionConfigTable).values({ rate: parsed.data.rate }).returning();
    config = created;
  } else {
    const [updated] = await db.update(commissionConfigTable).set({ rate: parsed.data.rate }).where(eq(commissionConfigTable.id, configs[0].id)).returning();
    config = updated;
  }

  res.json(config);
});

const VALID_INTERVALS: Record<string, string> = {
  week: "7 days",
  month: "30 days",
  year: "365 days",
};

router.get("/admin/revenue", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const query = GetRevenueStatsQueryParams.safeParse(req.query);
  const period = query.success ? (query.data.period ?? "month") : "month";
  const intervalStr = VALID_INTERVALS[period] || VALID_INTERVALS.month;

  const cutoffDate = new Date();
  if (intervalStr === "7 days") cutoffDate.setDate(cutoffDate.getDate() - 7);
  else if (intervalStr === "365 days") cutoffDate.setDate(cutoffDate.getDate() - 365);
  else cutoffDate.setDate(cutoffDate.getDate() - 30);

  const [totals] = await db.select({
    totalRevenue: sum(paymentsTable.amount),
    totalCommission: sum(paymentsTable.commissionAmount),
    totalWorkerPayouts: sum(paymentsTable.workerAmount),
  }).from(paymentsTable).where(
    and(
      eq(paymentsTable.status, "completed"),
      gte(paymentsTable.createdAt, cutoffDate),
    )
  );

  const byDay = await db.execute(sql`
    SELECT 
      DATE(created_at) as date,
      COALESCE(SUM(amount), 0) as revenue,
      COALESCE(SUM(commission_amount), 0) as commission,
      COALESCE(SUM(worker_amount), 0) as payouts
    FROM payments
    WHERE status = 'completed' AND created_at >= ${cutoffDate}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  res.json({
    period,
    totalRevenue: parseFloat(String(totals?.totalRevenue ?? 0)),
    totalCommission: parseFloat(String(totals?.totalCommission ?? 0)),
    totalWorkerPayouts: parseFloat(String(totals?.totalWorkerPayouts ?? 0)),
    byDay: (byDay as any).rows.map((row: { date: string; revenue: string; commission: string; payouts: string }) => ({
      date: row.date,
      revenue: parseFloat(row.revenue),
      commission: parseFloat(row.commission),
      payouts: parseFloat(row.payouts),
    })),
  });
});

const defaultSiteSettings: Record<string, string> = {
  theme_primary: "#1a8cf8",
  theme_background: "#090b10",
  theme_card: "#111318",
  theme_foreground: "#edf0f5",
  theme_muted_foreground: "#7a8499",
  theme_destructive: "#e03131",
  theme_border: "#1c2030",
  hero_title: "Servicios del hogar",
  hero_highlight: "a un toque de distancia.",
  hero_description: "Conectamos a los mejores profesionales verificados con personas que necesitan resolver problemas en su hogar. Rápido, seguro y con garantía de satisfacción.",
  hero_cta_primary: "Necesito un Profesional",
  hero_cta_secondary: "Quiero ser Profesional",
  stats_services: "10K+",
  stats_services_label: "Servicios completados",
  stats_professionals: "2.5K+",
  stats_professionals_label: "Profesionales activos",
  stats_rating: "4.8",
  stats_rating_label: "Calificación promedio",
  stats_response: "15 min",
  stats_response_label: "Tiempo de respuesta",
  testimonial_1_name: "Carolina M.",
  testimonial_1_role: "Cliente",
  testimonial_1_text: "Necesitaba un electricista urgente y en 20 minutos ya tenía a Carlos en mi casa. Trabajo impecable y precio justo.",
  testimonial_1_rating: "5",
  testimonial_2_name: "Roberto S.",
  testimonial_2_role: "Profesional",
  testimonial_2_text: "Fixgo me permite organizar mis trabajos y recibir pagos seguros. He triplicado mis clientes desde que me uní.",
  testimonial_2_rating: "5",
  testimonial_3_name: "Patricia L.",
  testimonial_3_role: "Cliente",
  testimonial_3_text: "La transparencia en los precios y la calidad de los profesionales es lo que más valoro. Mi plomero habitual ahora lo encuentro aquí.",
  testimonial_3_rating: "5",
  cta_title: "¿Listo para resolver tu problema?",
  cta_description: "Únete a miles de personas que ya confían en Fixgo para mantener su hogar en perfectas condiciones.",
  pro_title: "¿Eres profesional?\nÚnete a Fixgo",
  pro_description: "Accede a cientos de clientes nuevos cada día, gestiona tu agenda, recibe pagos seguros y haz crecer tu negocio con la plataforma líder en servicios del hogar.",
};

let siteSettingsCache: Record<string, string> | null = null;
let warmingPromise: Promise<Record<string, string>> | null = null;

export async function getSiteSettingsFromDb(): Promise<Record<string, string>> {
  if (siteSettingsCache) return siteSettingsCache;
  if (warmingPromise) return warmingPromise;
  warmingPromise = (async () => {
    const settings = await db.select().from(siteSettingsTable);
    const result: Record<string, string> = { ...defaultSiteSettings };
    for (const s of settings) result[s.key] = s.value;
    siteSettingsCache = result;
    warmingPromise = null;
    return result;
  })();
  return warmingPromise;
}

export async function warmSiteSettingsCache(): Promise<void> {
  try {
    await getSiteSettingsFromDb();
  } catch {}
}

router.get("/admin/site-settings", async (_req, res): Promise<void> => {
  const result = await getSiteSettingsFromDb();
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.json(result);
});

router.put("/admin/site-settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: "Body must be an object with key-value pairs" });
    return;
  }

  const entries = Object.entries(body).filter(([k, v]) => typeof k === 'string' && typeof v === 'string');

  if (entries.length > 0) {
    await db.insert(siteSettingsTable)
      .values(entries.map(([key, value]) => ({ key, value })))
      .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: sql`excluded.value` } });
  }

  siteSettingsCache = null;
  const result = await getSiteSettingsFromDb();
  res.json(result);
});

// =====================================================================
//  Detalle completo de un usuario (admin)
// =====================================================================

// Búsqueda ligera de usuarios — para selector en "Otorgar plan"
// IMPORTANTE: debe ir ANTES de /admin/users/:id para evitar conflicto de rutas
router.get("/admin/users/search", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  const results = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(or(
      ilike(usersTable.name, `%${q}%`),
      ilike(usersTable.email, `%${q}%`),
    ))
    .orderBy(usersTable.name)
    .limit(20);

  res.json(results);
});

// Eliminar cuenta de usuario — borrado total en cascada manual
router.delete("/admin/users/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const targetId = parseInt(String(req.params.id));
  if (isNaN(targetId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [target] = await db
    .select({ id: usersTable.id, role: usersTable.role, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);

  if (!target) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  if (targetId === req.userId) { res.status(403).json({ error: "No puedes eliminar tu propia cuenta" }); return; }

  try {
    await db.transaction(async (tx) => {
      // 1. Obtener IDs de servicios relacionados con el usuario
      const userServices = await tx
        .select({ id: servicesTable.id })
        .from(servicesTable)
        .where(or(
          eq(servicesTable.clientId, targetId),
          eq(servicesTable.workerId, targetId),
          eq(servicesTable.directWorkerId, targetId),
        ));
      const serviceIds = userServices.map(s => s.id);

      // 2. Respuestas de tickets (dependen de support_tickets)
      const userTickets = await tx
        .select({ id: supportTicketsTable.id })
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.userId, targetId));
      const ticketIds = userTickets.map(t => t.id);
      if (ticketIds.length > 0) {
        await tx.delete(ticketResponsesTable).where(inArray(ticketResponsesTable.ticketId, ticketIds));
      }
      await tx.delete(supportTicketsTable).where(eq(supportTicketsTable.userId, targetId));

      // 3. Payouts (dependen de payments)
      await tx.delete(payoutsTable).where(eq(payoutsTable.workerId, targetId));

      // 4. Reviews (por usuario directo y por servicios del usuario)
      const reviewCond = serviceIds.length > 0
        ? or(eq(reviewsTable.clientId, targetId), eq(reviewsTable.workerId, targetId), inArray(reviewsTable.serviceId, serviceIds))
        : or(eq(reviewsTable.clientId, targetId), eq(reviewsTable.workerId, targetId));
      await tx.delete(reviewsTable).where(reviewCond!);

      // 5. Propuestas (por trabajador y por servicios del usuario)
      const proposalCond = serviceIds.length > 0
        ? or(eq(proposalsTable.workerId, targetId), inArray(proposalsTable.serviceId, serviceIds))
        : eq(proposalsTable.workerId, targetId);
      await tx.delete(proposalsTable).where(proposalCond);

      // 6. Mensajes (por remitente, worker, y por servicios del usuario)
      const msgCond = serviceIds.length > 0
        ? or(eq(messagesTable.senderId, targetId), eq(messagesTable.workerId, targetId), inArray(messagesTable.serviceId, serviceIds))
        : or(eq(messagesTable.senderId, targetId), eq(messagesTable.workerId, targetId));
      await tx.delete(messagesTable).where(msgCond!);

      // 7. Pagos (como cliente o trabajador)
      await tx.delete(paymentsTable).where(
        or(eq(paymentsTable.clientId, targetId), eq(paymentsTable.workerId, targetId))
      );

      // 8. Notificaciones
      await tx.delete(notificationsTable).where(eq(notificationsTable.userId, targetId));

      // 9. KYC — también limpiar referencias como reviewedBy
      await tx.execute(sql`UPDATE kyc_documents SET reviewed_by = NULL WHERE reviewed_by = ${targetId}`);
      await tx.delete(kycDocumentsTable).where(eq(kycDocumentsTable.userId, targetId));

      // 10. Favoritos (como vinculador o vinculado)
      await tx.delete(userFavoritesTable).where(
        or(eq(userFavoritesTable.vinculadorId, targetId), eq(userFavoritesTable.vinculadoId, targetId))
      );

      // 11. Usos de cupones
      await tx.delete(couponUsesTable).where(eq(couponUsesTable.userId, targetId));

      // 12. Servicios (ya limpiamos sus hijos arriba)
      if (serviceIds.length > 0) {
        await tx.delete(servicesTable).where(inArray(servicesTable.id, serviceIds));
      }

      // 13. Eliminar usuario — cascade limpia automáticamente:
      //     balance_transactions, certifications, direct_conversations/messages,
      //     portfolio, user_subscriptions, worker_categories, alert_sessions, crypto_keys
      await tx.delete(usersTable).where(eq(usersTable.id, targetId));
    });

    logger.info({ adminId: req.userId, targetId, name: target.name }, "Admin deleted user (full cascade)");
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err, targetId }, "Error deleting user");
    res.status(500).json({ error: "Error al eliminar el usuario: " + (err?.message ?? "error desconocido") });
  }
});

router.post("/admin/users/:id/phone-verify-manual", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const parsed = ManualPhoneVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select({
      id: usersTable.id,
      role: usersTable.role,
      phone: usersTable.phone,
      phoneVerified: usersTable.phoneVerified,
      phoneVerifiedAt: usersTable.phoneVerifiedAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!target) return { kind: "not_found" as const };
    if (target.role === "admin") return { kind: "admin_target" as const };

    const normalizedPhone = normalizePhone(target.phone);
    if (!normalizedPhone || !/^\+\d{8,15}$/.test(normalizedPhone)) {
      return { kind: "missing_phone" as const };
    }

    const verifiedUsers = await tx.select({
      id: usersTable.id,
      phone: usersTable.phone,
    }).from(usersTable).where(and(
      eq(usersTable.phoneVerified, true),
      ne(usersTable.id, userId),
    ));
    const conflict = verifiedUsers.find((row) => normalizePhone(row.phone) === normalizedPhone);
    if (conflict) {
      return { kind: "phone_taken" as const, conflictUserId: conflict.id };
    }

    if (target.phoneVerified) {
      return {
        kind: "already_verified" as const,
        phone: normalizedPhone,
        phoneVerifiedAt: target.phoneVerifiedAt,
      };
    }

    const now = new Date();
    const [updated] = await tx.update(usersTable)
      .set({ phoneVerified: true, phoneVerifiedAt: now })
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        phone: usersTable.phone,
        phoneVerified: usersTable.phoneVerified,
        phoneVerifiedAt: usersTable.phoneVerifiedAt,
      });

    const [audit] = await tx.insert(adminPhoneVerificationsTable).values({
      userId,
      adminId: req.userId!,
      phone: normalizedPhone,
      reason: parsed.data.reason,
      method: "manual_admin",
    }).returning({
      id: adminPhoneVerificationsTable.id,
      phone: adminPhoneVerificationsTable.phone,
      reason: adminPhoneVerificationsTable.reason,
      method: adminPhoneVerificationsTable.method,
      createdAt: adminPhoneVerificationsTable.createdAt,
    });

    return { kind: "verified" as const, updated, audit };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  if (result.kind === "admin_target") {
    res.status(400).json({ error: "No se puede verificar manualmente a una cuenta administradora" });
    return;
  }
  if (result.kind === "missing_phone") {
    res.status(400).json({ error: "El usuario no tiene un teléfono válido registrado" });
    return;
  }
  if (result.kind === "phone_taken") {
    logger.warn({ adminId: req.userId, targetId: userId, conflictUserId: result.conflictUserId }, "Manual phone verification rejected — phone already verified");
    res.status(409).json({ error: "PHONE_TAKEN", message: "Este número ya está verificado en otra cuenta." });
    return;
  }
  if (result.kind === "already_verified") {
    res.json({
      ok: true,
      alreadyVerified: true,
      phone: result.phone,
      phoneVerified: true,
      phoneVerifiedAt: result.phoneVerifiedAt,
    });
    return;
  }

  invalidateUserCache(userId);
  logger.info({ adminId: req.userId, targetId: userId }, "Admin manually verified phone");
  res.json({
    ok: true,
    alreadyVerified: false,
    user: result.updated,
    audit: result.audit,
  });
});

router.patch("/admin/users/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const parsed = AdminEditUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Nada que actualizar" }); return; }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  const [updated] = await db.update(usersTable).set(patch as any).where(eq(usersTable.id, userId)).returning({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    kycStatus: usersTable.kycStatus,
    emailVerified: usersTable.emailVerified,
    phoneVerified: usersTable.phoneVerified,
  });

  invalidateUserCache(userId);
  logger.info({ adminId: req.userId, targetId: userId, patch }, "Admin edited user fields");
  res.json(updated);
});

router.get("/admin/users/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  await expireDueAdminBlocks();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  // No exponer password hash
  const { password, ...safeUser } = user as any;

  const [
    servicesAsClient,
    servicesAsWorker,
    reviewsReceived,
    reviewsGiven,
    paymentsAsClient,
    paymentsAsWorker,
    balanceTx,
    subscriptionRows,
    statsRows,
    blockHistory,
    manualPhoneVerificationRows,
  ] = await Promise.all([
    db.select({
      id: servicesTable.id, title: servicesTable.title, status: servicesTable.status,
      estimatedPrice: servicesTable.estimatedPrice, finalPrice: servicesTable.finalPrice,
      createdAt: servicesTable.createdAt,
    }).from(servicesTable).where(eq(servicesTable.clientId, userId)).orderBy(desc(servicesTable.createdAt)).limit(100),

    db.select({
      id: servicesTable.id, title: servicesTable.title, status: servicesTable.status,
      estimatedPrice: servicesTable.estimatedPrice, finalPrice: servicesTable.finalPrice,
      createdAt: servicesTable.createdAt,
    }).from(servicesTable).where(eq(servicesTable.workerId, userId)).orderBy(desc(servicesTable.createdAt)).limit(100),

    db.select({
      id: reviewsTable.id, serviceId: reviewsTable.serviceId,
      rating: reviewsTable.rating, comment: reviewsTable.comment,
      authorId: reviewsTable.clientId, createdAt: reviewsTable.createdAt,
      authorName: usersTable.name,
    }).from(reviewsTable)
      .leftJoin(usersTable, eq(usersTable.id, reviewsTable.clientId))
      .where(eq(reviewsTable.workerId, userId))
      .orderBy(desc(reviewsTable.createdAt)).limit(50),

    db.select({
      id: reviewsTable.id, serviceId: reviewsTable.serviceId,
      rating: reviewsTable.workerRating, comment: reviewsTable.workerComment,
      targetId: reviewsTable.workerId, createdAt: reviewsTable.createdAt,
      targetName: usersTable.name,
    }).from(reviewsTable)
      .leftJoin(usersTable, eq(usersTable.id, reviewsTable.workerId))
      .where(and(eq(reviewsTable.clientId, userId), eq(reviewsTable.reviewedByWorker, true)))
      .orderBy(desc(reviewsTable.createdAt)).limit(50),

    db.select({
      id: paymentsTable.id, serviceId: paymentsTable.serviceId, amount: paymentsTable.amount,
      method: paymentsTable.method, status: paymentsTable.status, createdAt: paymentsTable.createdAt,
    }).from(paymentsTable).where(eq(paymentsTable.clientId, userId)).orderBy(desc(paymentsTable.createdAt)).limit(50),

    db.select({
      id: paymentsTable.id, serviceId: paymentsTable.serviceId, amount: paymentsTable.amount,
      commissionAmount: paymentsTable.commissionAmount, workerAmount: paymentsTable.workerAmount,
      method: paymentsTable.method, status: paymentsTable.status, createdAt: paymentsTable.createdAt,
    }).from(paymentsTable).where(eq(paymentsTable.workerId, userId)).orderBy(desc(paymentsTable.createdAt)).limit(50),

    db.select({
      id: balanceTransactionsTable.id, amount: balanceTransactionsTable.amount,
      type: balanceTransactionsTable.type, description: balanceTransactionsTable.description,
      relatedServiceId: balanceTransactionsTable.relatedServiceId,
      createdAt: balanceTransactionsTable.createdAt,
    }).from(balanceTransactionsTable).where(eq(balanceTransactionsTable.userId, userId))
      .orderBy(desc(balanceTransactionsTable.createdAt)).limit(50),

    db.select({
      id: userSubscriptionsTable.id,
      planCode: userSubscriptionsTable.planCode,
      status: userSubscriptionsTable.status,
      interval: userSubscriptionsTable.interval,
      currentPeriodEnd: userSubscriptionsTable.currentPeriodEnd,
    }).from(userSubscriptionsTable)
      .where(eq(userSubscriptionsTable.userId, userId))
      .orderBy(desc(userSubscriptionsTable.createdAt))
      .limit(1),

    db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM services WHERE client_id = ${userId}) AS services_as_client,
        (SELECT COUNT(*) FROM services WHERE worker_id = ${userId}) AS services_as_worker,
        (SELECT COUNT(*) FROM services WHERE worker_id = ${userId} AND status = 'completed') AS completed_as_worker,
        (SELECT COUNT(*) FROM services WHERE client_id = ${userId} AND status = 'completed') AS completed_as_client,
        (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE worker_id = ${userId}) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE worker_id = ${userId}) AS total_reviews,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE worker_id = ${userId} AND status = 'completed') AS total_earned,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM payments WHERE worker_id = ${userId} AND status = 'completed') AS total_commission_paid
    `),

    db.select({
      id: adminUserBlocksTable.id,
      duration: adminUserBlocksTable.duration,
      durationLabel: sql<string>`CASE
        WHEN ${adminUserBlocksTable.duration} = '24h' THEN '24 horas'
        WHEN ${adminUserBlocksTable.duration} = '7d' THEN '7 días'
        WHEN ${adminUserBlocksTable.duration} = '30d' THEN '30 días'
        ELSE 'Sin fecha de término'
      END`,
      blockedAt: adminUserBlocksTable.blockedAt,
      blockedUntil: adminUserBlocksTable.blockedUntil,
      endedAt: adminUserBlocksTable.endedAt,
      endReason: adminUserBlocksTable.endReason,
      blockedByAdminId: adminUserBlocksTable.blockedByAdminId,
      blockedByAdminName: adminBlocker.name,
      unblockedByAdminId: adminUserBlocksTable.unblockedByAdminId,
      unblockedByAdminName: adminUnblocker.name,
    })
      .from(adminUserBlocksTable)
      .leftJoin(adminBlocker, eq(adminBlocker.id, adminUserBlocksTable.blockedByAdminId))
      .leftJoin(adminUnblocker, eq(adminUnblocker.id, adminUserBlocksTable.unblockedByAdminId))
      .where(eq(adminUserBlocksTable.userId, userId))
      .orderBy(desc(adminUserBlocksTable.blockedAt)),

    db.select({
      id: adminPhoneVerificationsTable.id,
      phone: adminPhoneVerificationsTable.phone,
      reason: adminPhoneVerificationsTable.reason,
      method: adminPhoneVerificationsTable.method,
      createdAt: adminPhoneVerificationsTable.createdAt,
      adminId: adminPhoneVerificationsTable.adminId,
      adminName: phoneVerificationAdmin.name,
    })
      .from(adminPhoneVerificationsTable)
      .leftJoin(phoneVerificationAdmin, eq(phoneVerificationAdmin.id, adminPhoneVerificationsTable.adminId))
      .where(eq(adminPhoneVerificationsTable.userId, userId))
      .orderBy(desc(adminPhoneVerificationsTable.createdAt))
      .limit(1),
  ]);

  const stats: any = (statsRows as any).rows?.[0] || {};

  res.json({
    user: safeUser,
    stats: {
      servicesAsClient: Number(stats.services_as_client || 0),
      servicesAsWorker: Number(stats.services_as_worker || 0),
      completedAsClient: Number(stats.completed_as_client || 0),
      completedAsWorker: Number(stats.completed_as_worker || 0),
      avgRating: Number(stats.avg_rating || 0),
      totalReviews: Number(stats.total_reviews || 0),
      totalEarned: Number(stats.total_earned || 0),
      totalCommissionPaid: Number(stats.total_commission_paid || 0),
    },
    currentSubscription: subscriptionRows[0] || null,
    servicesAsClient,
    servicesAsWorker,
    reviewsReceived,
    reviewsGiven,
    paymentsAsClient,
    paymentsAsWorker,
    balanceTransactions: balanceTx,
    blockHistory,
    manualPhoneVerification: manualPhoneVerificationRows[0] || null,
  });
});

// ─── ADMIN: Métricas de Suscripciones ────────────────────────────────────────

router.get("/admin/subscriptions/stats", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const firstOfThisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // MRR: activas mensuales + anuales / 12
    const mrrResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(
          CASE WHEN interval = 'monthly' THEN price_paid_clp
               WHEN interval = 'annual'  THEN price_paid_clp / 12
               ELSE 0 END
        ), 0) AS mrr
      FROM user_subscriptions
      WHERE status IN ('active','trialing')
    `);
    const mrr = parseInt(String((mrrResult as any).rows?.[0]?.mrr ?? 0));
    const arr = mrr * 12;

    // Conteo por estado
    const byStatus = await db.execute(sql`
      SELECT status, COUNT(*) AS total
      FROM user_subscriptions
      GROUP BY status
    `);

    // Conteo por plan (solo activas + trialing)
    const byPlan = await db.execute(sql`
      SELECT plan_code, interval, COUNT(*) AS total
      FROM user_subscriptions
      WHERE status IN ('active','trialing')
      GROUP BY plan_code, interval
      ORDER BY total DESC
    `);

    // Nuevas este mes
    const newThisMonth = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM user_subscriptions
      WHERE created_at >= ${firstOfMonth}
    `);

    // Nuevas mes anterior
    const newLastMonth = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM user_subscriptions
      WHERE created_at >= ${firstOfLastMonth} AND created_at < ${firstOfMonth}
    `);

    // Conversión trial → activa (usuarios que pasaron de trialing a active)
    const trialTotal = await db.execute(sql`
      SELECT COUNT(*) AS total FROM user_subscriptions WHERE status != 'trialing' AND trial_ends_at IS NOT NULL
    `);
    const trialConverted = await db.execute(sql`
      SELECT COUNT(*) AS total FROM user_subscriptions WHERE status = 'active' AND trial_ends_at IS NOT NULL
    `);
    const trialTotalN = parseInt(String((trialTotal as any).rows?.[0]?.total ?? 0));
    const trialConvertedN = parseInt(String((trialConverted as any).rows?.[0]?.total ?? 0));
    const trialConversionRate = trialTotalN > 0 ? Math.round((trialConvertedN / trialTotalN) * 100) : 0;

    // Ingresos por suscripciones (pagos confirmados)
    const subRevenue = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= ${firstOfMonth} THEN amount_clp ELSE 0 END), 0) AS this_month,
        COALESCE(SUM(CASE WHEN created_at >= ${firstOfLastMonth} AND created_at < ${firstOfMonth} THEN amount_clp ELSE 0 END), 0) AS last_month,
        COALESCE(SUM(amount_clp), 0) AS total_all_time
      FROM subscription_payments
      WHERE status = 'paid'
    `);

    // Evolución de nuevas suscripciones últimos 6 meses
    const evolution = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COUNT(*) AS new_subs
      FROM user_subscriptions
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `);

    const revenueRow = (subRevenue as any).rows?.[0] ?? {};

    res.json({
      mrr,
      arr,
      byStatus: (byStatus as any).rows ?? [],
      byPlan: (byPlan as any).rows ?? [],
      newThisMonth: parseInt(String((newThisMonth as any).rows?.[0]?.total ?? 0)),
      newLastMonth: parseInt(String((newLastMonth as any).rows?.[0]?.total ?? 0)),
      trialConversionRate,
      trialTotal: trialTotalN,
      trialConverted: trialConvertedN,
      revenue: {
        thisMonth: parseInt(String(revenueRow.this_month ?? 0)),
        lastMonth: parseInt(String(revenueRow.last_month ?? 0)),
        allTime: parseInt(String(revenueRow.total_all_time ?? 0)),
      },
      evolution: (evolution as any).rows ?? [],
    });
  } catch (e) { logger.error({ err: e }, "admin/subscriptions/stats error"); res.status(500).json({ error: "Error" }); }
});

// ─── ADMIN: Suscripciones ────────────────────────────────────────────────────

router.get("/admin/subscriptions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const { status, planCode, search, page = "1", limit = "30" } = req.query as Record<string, string>;
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const offset = (parsedPage - 1) * parsedLimit;

    const rows = await db
      .select({
        id: userSubscriptionsTable.id,
        userId: userSubscriptionsTable.userId,
        planCode: userSubscriptionsTable.planCode,
        status: userSubscriptionsTable.status,
        interval: userSubscriptionsTable.interval,
        pricePaidClp: userSubscriptionsTable.pricePaidClp,
        couponCode: userSubscriptionsTable.couponCode,
        discountClp: userSubscriptionsTable.discountClp,
        trialEndsAt: userSubscriptionsTable.trialEndsAt,
        currentPeriodStart: userSubscriptionsTable.currentPeriodStart,
        currentPeriodEnd: userSubscriptionsTable.currentPeriodEnd,
        cancelledAt: userSubscriptionsTable.cancelledAt,
        createdAt: userSubscriptionsTable.createdAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userRole: usersTable.role,
      })
      .from(userSubscriptionsTable)
      .innerJoin(usersTable, eq(userSubscriptionsTable.userId, usersTable.id))
      .where(
        and(
          status ? eq(userSubscriptionsTable.status, status as any) : undefined,
          planCode ? eq(userSubscriptionsTable.planCode, planCode) : undefined,
          search ? or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`)) : undefined,
        )
      )
      .orderBy(desc(userSubscriptionsTable.createdAt))
      .limit(parsedLimit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(userSubscriptionsTable)
      .innerJoin(usersTable, eq(userSubscriptionsTable.userId, usersTable.id))
      .where(
        and(
          status ? eq(userSubscriptionsTable.status, status as any) : undefined,
          planCode ? eq(userSubscriptionsTable.planCode, planCode) : undefined,
          search ? or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`)) : undefined,
        )
      );

    res.json({ rows, total, page: parsedPage, limit: parsedLimit });
  } catch (e) { logger.error({ err: e }, "admin/subscriptions error"); res.status(500).json({ error: "Error" }); }
});

router.patch("/admin/subscriptions/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const { status, currentPeriodEnd } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (currentPeriodEnd) updates.currentPeriodEnd = new Date(currentPeriodEnd);
    if (status === "cancelled") updates.cancelledAt = new Date();
    const [updated] = await db.update(userSubscriptionsTable).set(updates).where(eq(userSubscriptionsTable.id, id)).returning({ id: userSubscriptionsTable.id, userId: userSubscriptionsTable.userId });
    if (!updated) { res.status(404).json({ error: "Suscripción no encontrada" }); return; }
    emitToUser(updated.userId, "subscription:updated", {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Error" }); }
});

router.post("/admin/subscriptions/grant", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const { userId, planCode, interval, days } = req.body;
    if (!userId || !planCode || !interval || !days) {
      res.status(400).json({ error: "Faltan campos" }); return;
    }
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + parseInt(days));
    await db
      .update(userSubscriptionsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(userSubscriptionsTable.userId, parseInt(userId)), eq(userSubscriptionsTable.status, "active")));
    const [row] = await db.insert(userSubscriptionsTable).values({
      userId: parseInt(userId),
      planCode,
      status: "active",
      interval,
      pricePaidClp: 0,
      discountClp: 0,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    }).returning();
    emitToUser(parseInt(userId), "subscription:updated", {});
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Error al otorgar plan" }); }
});

// ─── ADMIN: Planes de suscripción ────────────────────────────────────────────

router.get("/admin/plans", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.sortOrder);
    res.json(plans);
  } catch { res.status(500).json({ error: "Error al obtener planes" }); }
});

router.patch("/admin/plans/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

    const { name, priceClp, features, isActive, sortOrder } = req.body;
    const updates: Record<string, any> = {};

    if (name !== undefined) updates.name = String(name).trim();
    if (priceClp !== undefined) updates.priceClp = parseInt(String(priceClp));
    if (features !== undefined && typeof features === "object") updates.features = features;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (sortOrder !== undefined) updates.sortOrder = parseInt(String(sortOrder));

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No hay campos para actualizar" }); return;
    }

    const [updated] = await db.update(subscriptionPlansTable).set(updates).where(eq(subscriptionPlansTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Plan no encontrado" }); return; }
    res.json(updated);
  } catch { res.status(500).json({ error: "Error al actualizar plan" }); }
});

// ─── ADMIN: Cupones ──────────────────────────────────────────────────────────

router.get("/admin/coupons", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    res.json(rows);
  } catch { res.status(500).json({ error: "Error" }); }
});

router.post("/admin/coupons", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const { code, discountType, discountValue, maxUses, validPlans, validIntervals, expiresAt } = req.body;
    if (!code || !discountType || !discountValue) {
      res.status(400).json({ error: "Faltan campos requeridos" }); return;
    }
    const [row] = await db.insert(couponsTable).values({
      code: String(code).toUpperCase().trim(),
      discountType,
      discountValue: Number(discountValue),
      maxUses: maxUses ?? null,
      validPlans: validPlans ?? null,
      validIntervals: validIntervals ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") { res.status(400).json({ error: "Ya existe un cupón con ese código" }); return; }
    res.status(500).json({ error: "Error al crear cupón" });
  }
});

router.patch("/admin/coupons/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const { isActive } = req.body;
    await db.update(couponsTable).set({ isActive }).where(eq(couponsTable.id, id));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Error" }); }
});

router.delete("/admin/coupons/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(couponsTable).where(eq(couponsTable.id, id));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Error" }); }
});

export default router;
