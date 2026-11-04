import { randomUUID } from "node:crypto";
import { db, servicesTable, usersTable, alertSessionsTable, workerAlertSlotsTable, proposalsTable, workerCategoriesTable, messagesTable, subscriptionPlansTable } from "../db";
import { userSubscriptionsTable } from "../db/schema/subscriptions";
import { eq, and, isNull, isNotNull, or, lt, gt, lte, asc, inArray, sql } from "drizzle-orm";
import { emitToWorkers, emitToUser, emitToService, getOnlineUserSet, isAdminInWorkerMode, isClientInWorkerMode } from "./socketio";
import { createNotification, createNotifications } from "./createNotification";
import { logger } from "./logger";
import {
  getActiveAlertExclusionReasons,
  isLateAlertPhase,
  isProMaxAlertPhase,
  getLateAlertWindow,
  isWorkerWithinAlertRadius,
  NEARBY_DELAY_MS,
  resolveLatestWorkerPlans,
  splitAlertRecipients,
} from "./alert-recipient-selection";
import { isWorkerPayoutComplete } from "./worker-eligibility";
import { finalizeCompletionSideEffects } from "./complete-service";

// ─────────────────────────────────────────────────────────────────────────────
// Configuración del Motor de Solicitudes (2 fases)
//
// Fase 1 — ACTIVA (alerta emergente):
//   1a) Pro Max: alerta inmediata (cualquier distancia). Timer: ACTIVE_TIMEOUT_MS.
//   1b) Pro y Gratis cercanos: alerta llega NEARBY_DELAY_MS después del Pro Max.
//       Si el servicio ya fue tomado en esos 10s, los cercanos NO reciben la alerta.
//       Timer: ACTIVE_TIMEOUT_MS − NEARBY_DELAY_MS.
//   Si todos rechazan/expiran → Fase 2.
//
// Fase 2 — BANDEJA (segundo plano):
//   Destinatarios: TODOS los workers activos de la categoría, sin límite de distancia.
//   Mecanismo: emite service:available → aparece en la lista inferior del worker.
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVE_MODAL_TIMEOUT_MS = 60_000;
const ACTIVE_TIMEOUT_MS = 120_000;    // 60 s en modal + 60 s en bandeja
const ARRIVAL_AUTO_START_DELAY_MS = 10 * 60_000;

const PROMAX_PLAN_CODES = ["pro_plus_monthly", "pro_plus_annual"];

async function isActiveWorkerRecipient(userId: number, databaseRole: string): Promise<boolean> {
  if (databaseRole === "worker") return true;
  if (databaseRole === "admin") return isAdminInWorkerMode(userId);
  if (databaseRole === "client") return isClientInWorkerMode(userId);
  return false;
}

// Timers individuales por (serviceId, workerId)
const alertTimers = new Map<string, NodeJS.Timeout>();
const arrivalAutoStartTimers = new Map<number, NodeJS.Timeout>();

function timerKey(serviceId: number, workerId: number): string {
  return `${serviceId}:${workerId}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getServiceForMotor(serviceId: number) {
  const [service] = await db.select({
    id: servicesTable.id,
    title: servicesTable.title,
    lat: servicesTable.lat,
    lng: servicesTable.lng,
    categoryId: servicesTable.categoryId,
    clientId: servicesTable.clientId,
    status: servicesTable.status,
    budgetNote: servicesTable.budgetNote,
    isDirectRequest: servicesTable.isDirectRequest,
    directWorkerId: servicesTable.directWorkerId,
  }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  return service ?? null;
}

async function getClientInfo(clientId: number) {
  const [client] = await db.select({
    name: usersTable.name,
    clientRating: usersTable.clientRating,
  }).from(usersTable).where(eq(usersTable.id, clientId)).limit(1);
  return client ?? null;
}

async function addLateActiveAlertSessions(
  workerId: number,
  now: Date,
): Promise<Array<{ serviceId: number; availableAt: Date }>> {
  const [worker] = await db.select({
    role: usersTable.role,
    lat: usersTable.lat,
    lng: usersTable.lng,
    alertRadiusKm: usersTable.alertRadiusKm,
  }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);
  if (!worker || !(await isActiveWorkerRecipient(workerId, worker.role))) return [];

  const [planRows, existingSessions, sourceRows, assigned] = await Promise.all([
    db.select({
      userId: userSubscriptionsTable.userId,
      id: userSubscriptionsTable.id,
      planCode: userSubscriptionsTable.planCode,
      features: subscriptionPlansTable.features,
      createdAt: userSubscriptionsTable.createdAt,
    })
      .from(userSubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(userSubscriptionsTable.planCode, subscriptionPlansTable.code))
      .where(and(
        eq(userSubscriptionsTable.userId, workerId),
        sql`${userSubscriptionsTable.status} IN ('active','trialing')`,
      )),
    db.select({ serviceId: alertSessionsTable.serviceId })
      .from(alertSessionsTable)
      .where(eq(alertSessionsTable.workerId, workerId)),
    db.select({
      serviceId: servicesTable.id,
      categoryId: servicesTable.categoryId,
      isDirectRequest: servicesTable.isDirectRequest,
      directWorkerId: servicesTable.directWorkerId,
      serviceLat: servicesTable.lat,
      serviceLng: servicesTable.lng,
      sentAt: alertSessionsTable.sentAt,
      expiresAt: alertSessionsTable.expiresAt,
      modalExpiresAt: alertSessionsTable.modalExpiresAt,
      phase: alertSessionsTable.phase,
    })
      .from(alertSessionsTable)
      .innerJoin(servicesTable, eq(servicesTable.id, alertSessionsTable.serviceId))
      .innerJoin(workerCategoriesTable, and(
        eq(workerCategoriesTable.workerId, workerId),
        eq(workerCategoriesTable.categoryId, servicesTable.categoryId),
      ))
      .where(and(
        eq(servicesTable.status, "alerting"),
        eq(alertSessionsTable.response, "pending"),
        gt(alertSessionsTable.expiresAt, now),
        gt(alertSessionsTable.modalExpiresAt, now),
      )),
    db.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, workerId),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      ))
      .limit(1),
  ]);
  if (assigned.length > 0) return [];

  const existingServiceIds = new Set(existingSessions.map(({ serviceId }) => serviceId));
  const plans = resolveLatestWorkerPlans(planRows.map((row) => ({
    ...row,
    features: (row.features ?? {}) as Record<string, unknown>,
  })));
  const plan = plans.get(workerId);
  const isProMax = !!plan && PROMAX_PLAN_CODES.includes(plan.planCode);
  const planRadiusKm = typeof plan?.features.radius_km === "number"
    ? plan.features.radius_km
    : 5;
  const sourceByService = new Map<number, typeof sourceRows>();
  for (const row of sourceRows) {
    if (row.isDirectRequest && row.directWorkerId !== workerId) continue;
    const rows = sourceByService.get(row.serviceId) ?? [];
    rows.push(row);
    sourceByService.set(row.serviceId, rows);
  }

  const additions: Array<typeof alertSessionsTable.$inferInsert> = [];
  const schedules: Array<{ serviceId: number; availableAt: Date }> = [];
  for (const [serviceId, rows] of sourceByService) {
    if (existingServiceIds.has(serviceId) || rows.length === 0) continue;
    const source = rows.reduce((latest, row) =>
      row.modalExpiresAt! > latest.modalExpiresAt! ? row : latest
    );
    const cohortStartedAt = rows.reduce((earliest, row) => {
      const rowStart = new Date(
        row.sentAt.getTime() - (row.phase === "nearby" ? NEARBY_DELAY_MS : 0),
      );
      return rowStart < earliest ? rowStart : earliest;
    }, source.sentAt);
    const distanceKm =
      worker.lat != null && worker.lng != null &&
      source.serviceLat != null && source.serviceLng != null
        ? haversineKm(worker.lat, worker.lng, source.serviceLat, source.serviceLng)
        : null;
    if (!isWorkerWithinAlertRadius({
      isProMax,
      profileRadiusKm: worker.alertRadiusKm,
      planRadiusKm,
      distanceKm,
      hasServiceCoordinates: source.serviceLat != null && source.serviceLng != null,
    })) continue;

    const window = getLateAlertWindow({
      now,
      cohortStartedAt,
      modalExpiresAt: source.modalExpiresAt!,
      expiresAt: source.expiresAt,
      phase: isProMax ? "promax" : "nearby",
    });
    if (!window) continue;

    additions.push({
      serviceId,
      workerId,
      response: "pending",
      sentAt: cohortStartedAt,
      availableAt: window.availableAt,
      modalExpiresAt: window.modalExpiresAt,
      expiresAt: window.expiresAt,
      phase: isProMax ? "late_promax" : "late_nearby",
      distanceKm,
    });
    schedules.push({ serviceId, availableAt: window.availableAt });
  }

  if (additions.length === 0) return [];
  const inserted = await db.insert(alertSessionsTable)
    .values(additions)
    .onConflictDoNothing()
    .returning({ serviceId: alertSessionsTable.serviceId });
  const insertedIds = new Set(inserted.map(({ serviceId }) => serviceId));
  const insertedSchedules = schedules.filter(({ serviceId }) => insertedIds.has(serviceId));
  if (insertedSchedules.length > 0) {
    logger.info({
      workerId,
      serviceIds: insertedSchedules.map(({ serviceId }) => serviceId),
    }, "motor: late worker eligible for active alert");
  }
  return insertedSchedules;
}

/**
 * Atomically reserves one worker/service alert slot. Calls without a target
 * service dispatch every currently eligible pending request.
 */
export async function dispatchNextQueuedAlert(
  workerId: number,
  targetServiceId?: number,
  preserveWindow = false,
): Promise<boolean> {
  if (targetServiceId === undefined) {
    const now = new Date();
    const pending = await db.select({ serviceId: alertSessionsTable.serviceId })
      .from(alertSessionsTable)
      .innerJoin(servicesTable, eq(servicesTable.id, alertSessionsTable.serviceId))
      .where(and(
        eq(alertSessionsTable.workerId, workerId),
        eq(alertSessionsTable.response, "pending"),
        isNull(alertSessionsTable.deliveredAt),
        lte(alertSessionsTable.availableAt, now),
        gt(alertSessionsTable.expiresAt, now),
        or(
          eq(servicesTable.status, "alerting"),
          and(
            eq(servicesTable.status, "pending"),
            eq(servicesTable.directWorkerId, workerId),
          ),
        ),
      ))
      .orderBy(asc(alertSessionsTable.availableAt), asc(alertSessionsTable.id));
    const delivered = await Promise.all(
      pending.map(({ serviceId }) => dispatchNextQueuedAlert(workerId, serviceId)),
    );
    return delivered.some(Boolean);
  }

  const now = new Date();
  const dispatchResult = await db.transaction(async (tx) => {
    const [worker] = await tx.select({
      role: usersTable.role,
      isAvailable: usersTable.isAvailable,
      status: usersTable.status,
      alertCooldownUntil: usersTable.alertCooldownUntil,
      suspendedUntil: usersTable.suspendedUntil,
    }).from(usersTable).where(eq(usersTable.id, workerId)).for("update").limit(1);

    if (
      !worker ||
      !(await isActiveWorkerRecipient(workerId, worker.role)) ||
      !worker.isAvailable ||
      worker.status !== "active" ||
      (worker.alertCooldownUntil && worker.alertCooldownUntil > now) ||
      (worker.suspendedUntil && worker.suspendedUntil > now)
    ) return null;

    const assignedServices = await tx.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, workerId),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      ))
      .limit(1);
    if (assignedServices.length > 0) {
      return {
        dispatch: null,
        expiredServiceIds: [] as number[],
        busyServiceId: assignedServices[0].id,
      };
    }

    const expiredSessions = await tx.update(alertSessionsTable)
      .set({ response: "skipped", respondedAt: now })
      .where(and(
        eq(alertSessionsTable.workerId, workerId),
        eq(alertSessionsTable.serviceId, targetServiceId),
        eq(alertSessionsTable.response, "pending"),
        isNull(alertSessionsTable.deliveredAt),
        lte(alertSessionsTable.expiresAt, now),
      ))
      .returning({ serviceId: alertSessionsTable.serviceId });
    const expiredServiceIds = [...new Set(expiredSessions.map((session) => session.serviceId))];

    const [candidate] = await tx.select({
      sessionId: alertSessionsTable.id,
      serviceId: alertSessionsTable.serviceId,
      workerId: alertSessionsTable.workerId,
      phase: alertSessionsTable.phase,
      distanceKm: alertSessionsTable.distanceKm,
      expiresAt: alertSessionsTable.expiresAt,
      modalExpiresAt: alertSessionsTable.modalExpiresAt,
      title: servicesTable.title,
      clientId: servicesTable.clientId,
      budgetNote: servicesTable.budgetNote,
      status: servicesTable.status,
      isDirectRequest: servicesTable.isDirectRequest,
      directWorkerId: servicesTable.directWorkerId,
    })
      .from(alertSessionsTable)
      .innerJoin(servicesTable, eq(servicesTable.id, alertSessionsTable.serviceId))
      .where(and(
        eq(alertSessionsTable.workerId, workerId),
        eq(alertSessionsTable.serviceId, targetServiceId),
        eq(alertSessionsTable.response, "pending"),
        isNull(alertSessionsTable.deliveredAt),
        lte(alertSessionsTable.availableAt, now),
        gt(alertSessionsTable.expiresAt, now),
        or(
          eq(servicesTable.status, "alerting"),
          and(
            eq(servicesTable.status, "pending"),
            eq(servicesTable.directWorkerId, workerId),
          ),
        ),
      ))
      .orderBy(
        asc(alertSessionsTable.availableAt),
        asc(alertSessionsTable.sentAt),
        asc(alertSessionsTable.id),
      )
      .limit(1);

    if (!candidate) return { dispatch: null, expiredServiceIds };

    const deliveryId = randomUUID();
    const [slot] = await tx.insert(workerAlertSlotsTable).values({
      workerId,
      serviceId: candidate.serviceId,
      state: "pending",
      deliveryId,
      updatedAt: now,
    }).onConflictDoNothing().returning({
      workerId: workerAlertSlotsTable.workerId,
      serviceId: workerAlertSlotsTable.serviceId,
    });
    if (!slot) return { dispatch: null, expiredServiceIds };

    const keepOriginalWindow = preserveWindow || isLateAlertPhase(candidate.phase);
    const modalExpiresAt = keepOriginalWindow && candidate.modalExpiresAt
      ? candidate.modalExpiresAt
      : new Date(now.getTime() + ACTIVE_MODAL_TIMEOUT_MS);
    const expiresAt = keepOriginalWindow ? candidate.expiresAt : new Date(now.getTime() + ACTIVE_TIMEOUT_MS);
    const [session] = await tx.update(alertSessionsTable)
      .set({
        deliveredAt: now,
        receivedAt: null,
        deliveryId,
        sentAt: now,
        modalExpiresAt,
        expiresAt,
      })
      .where(and(
        eq(alertSessionsTable.id, candidate.sessionId),
        eq(alertSessionsTable.response, "pending"),
        isNull(alertSessionsTable.deliveredAt),
        lte(alertSessionsTable.availableAt, now),
        gt(alertSessionsTable.expiresAt, now),
      ))
      .returning({
        id: alertSessionsTable.id,
        expiresAt: alertSessionsTable.expiresAt,
        modalExpiresAt: alertSessionsTable.modalExpiresAt,
      });

    if (!session) {
      await tx.delete(workerAlertSlotsTable).where(and(
        eq(workerAlertSlotsTable.workerId, workerId),
        eq(workerAlertSlotsTable.serviceId, candidate.serviceId),
      ));
      return { dispatch: null, expiredServiceIds };
    }

    return {
      dispatch: {
        ...candidate,
        deliveryId,
        expiresAt: session.expiresAt,
        modalExpiresAt: session.modalExpiresAt ?? modalExpiresAt,
      },
      expiredServiceIds,
    };
  });

  if (!dispatchResult) return false;
  for (const serviceId of dispatchResult.expiredServiceIds) {
    await checkAllResponded(serviceId);
  }
  if (dispatchResult.busyServiceId) {
    await invalidateOtherWorkerAlerts(workerId, dispatchResult.busyServiceId);
    return false;
  }
  const dispatch = dispatchResult.dispatch;
  if (!dispatch) return false;

  const client = await getClientInfo(dispatch.clientId);
  const distanceKm = dispatch.distanceKm == null ? null : Math.round(dispatch.distanceKm * 10) / 10;
  const remainingSeconds = Math.max(1, Math.ceil((dispatch.expiresAt.getTime() - Date.now()) / 1000));
  const modalSeconds = Math.max(0, Math.ceil((dispatch.modalExpiresAt.getTime() - Date.now()) / 1000));
  const phase = isProMaxAlertPhase(dispatch.phase) ? "promax" : "nearby";

  // Serialize the final validation and socket emit with assignment cleanup.
  // If an assignment won while the reservation was being created, its cleanup
  // will either have removed this slot already or will run immediately after
  // this emit and remove the card from the client.
  const emitted = await db.transaction(async (tx) => {
    await tx.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, workerId))
      .for("update")
      .limit(1);

    const assigned = await tx.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, workerId),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      ))
      .limit(1);
    if (assigned.length > 0) {
      return { sent: false, busyServiceId: assigned[0].id };
    }

    const [current] = await tx.select({
      status: servicesTable.status,
      clientId: servicesTable.clientId,
      isDirectRequest: servicesTable.isDirectRequest,
      directWorkerId: servicesTable.directWorkerId,
    }).from(servicesTable).where(eq(servicesTable.id, dispatch.serviceId)).limit(1);
    const [slot] = await tx.select({ serviceId: workerAlertSlotsTable.serviceId })
      .from(workerAlertSlotsTable).where(and(
        eq(workerAlertSlotsTable.workerId, workerId),
        eq(workerAlertSlotsTable.serviceId, dispatch.serviceId),
      )).limit(1);
    if (!current || slot?.serviceId !== dispatch.serviceId ||
        (current.status !== "alerting" &&
          !(current.status === "pending" && current.isDirectRequest && current.directWorkerId === workerId))) {
      await tx.update(alertSessionsTable)
        .set({ response: "skipped", respondedAt: new Date() })
        .where(and(
          eq(alertSessionsTable.serviceId, dispatch.serviceId),
          eq(alertSessionsTable.workerId, workerId),
          eq(alertSessionsTable.response, "pending"),
        ));
      await tx.delete(workerAlertSlotsTable).where(and(
        eq(workerAlertSlotsTable.workerId, workerId),
        eq(workerAlertSlotsTable.serviceId, dispatch.serviceId),
      ));
      return { sent: false };
    }

    emitToUser(workerId, "service:active_alert", {
      serviceId: dispatch.serviceId,
      deliveryId: dispatch.deliveryId,
      title: dispatch.title,
      clientName: client?.name ?? "Cliente",
      convivenciaScore: client?.clientRating ?? null,
      distanceKm,
      phase,
      totalSeconds: remainingSeconds,
      modalSeconds,
      budgetNote: phase === "promax" ? (dispatch.budgetNote ?? null) : null,
    });
    return { sent: true };
  });
  if (emitted.busyServiceId) {
    await invalidateOtherWorkerAlerts(workerId, emitted.busyServiceId);
    return false;
  }
  if (!emitted.sent) return false;
  logger.info({
    serviceId: dispatch.serviceId,
    workerId,
    deliveryId: dispatch.deliveryId,
    phase,
    expiresAt: dispatch.expiresAt,
  }, "motor: active alert socket emit attempted");

  const distText = distanceKm !== null ? ` — ${distanceKm} km` : "";
  createNotification({
    userId: workerId,
    type: "service_request",
    title: "⚡ Nueva solicitud de trabajo",
    message: `${dispatch.title}${distText}`,
    relatedId: dispatch.serviceId,
    highPriority: true,
    deliveryId: dispatch.deliveryId,
    alertExpiresAt: dispatch.expiresAt,
    alertModalExpiresAt: dispatch.modalExpiresAt,
    phase,
    budgetNote: phase === "promax" ? (dispatch.budgetNote ?? null) : null,
  }).catch((error) => logger.error({
    err: error,
    serviceId: dispatch.serviceId,
    workerId,
    deliveryId: dispatch.deliveryId,
  }, "push service_request error"));

  const key = timerKey(dispatch.serviceId, workerId);
  const previousTimer = alertTimers.get(key);
  if (previousTimer) clearTimeout(previousTimer);
  const timer = setTimeout(() => {
    handleAlertTimeout(dispatch.serviceId, workerId).catch((error) =>
      logger.error({ err: error, serviceId: dispatch.serviceId, workerId }, "handleAlertTimeout error")
    );
  }, Math.max(0, dispatch.expiresAt.getTime() - Date.now()));
  alertTimers.set(key, timer);
  setTimeout(() => {
    emitToUser(workerId, "service:available", {
      serviceId: dispatch.serviceId,
      alertPhase: "tray",
    });
    checkAllResponded(dispatch.serviceId).catch((error) =>
      logger.error({ err: error, serviceId: dispatch.serviceId }, "active modal phase transition error")
    );
  }, Math.max(0, dispatch.modalExpiresAt.getTime() - Date.now()));
  scheduleAlertReceiptRetry(workerId, dispatch.serviceId, dispatch.deliveryId);
  return true;
}

function scheduleAlertReceiptRetry(
  workerId: number,
  serviceId: number,
  deliveryId: string,
  attempt = 0,
): void {
  const delays = [3_000, 6_000, 12_000];
  const delay = delays[attempt];
  if (delay === undefined) return;

  setTimeout(async () => {
    const [session] = await db.select({
      response: alertSessionsTable.response,
      receivedAt: alertSessionsTable.receivedAt,
      deliveryId: alertSessionsTable.deliveryId,
      expiresAt: alertSessionsTable.expiresAt,
    }).from(alertSessionsTable).where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.workerId, workerId),
    )).limit(1);

    if (!session || session.response !== "pending" ||
        session.deliveryId !== deliveryId || session.receivedAt ||
        session.expiresAt <= new Date()) return;

    await reemitActiveAlertsForWorker(workerId);
    scheduleAlertReceiptRetry(workerId, serviceId, deliveryId, attempt + 1);
  }, delay);
}

/** Refresh the live Pro Max popup when the client edits the service budget. */
export async function refreshProMaxBudgetAlerts(serviceId: number): Promise<void> {
  const now = new Date();
  const activeAlerts = await db.select({
    workerId: alertSessionsTable.workerId,
    deliveryId: alertSessionsTable.deliveryId,
    distanceKm: alertSessionsTable.distanceKm,
    expiresAt: alertSessionsTable.expiresAt,
    modalExpiresAt: alertSessionsTable.modalExpiresAt,
    title: servicesTable.title,
    clientId: servicesTable.clientId,
    budgetNote: servicesTable.budgetNote,
  })
    .from(alertSessionsTable)
    .innerJoin(servicesTable, eq(servicesTable.id, alertSessionsTable.serviceId))
    .innerJoin(workerAlertSlotsTable, and(
      eq(workerAlertSlotsTable.workerId, alertSessionsTable.workerId),
      eq(workerAlertSlotsTable.serviceId, alertSessionsTable.serviceId),
      eq(workerAlertSlotsTable.deliveryId, alertSessionsTable.deliveryId),
      eq(workerAlertSlotsTable.state, "pending"),
    ))
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      inArray(alertSessionsTable.phase, ["promax", "late_promax"]),
      eq(alertSessionsTable.response, "pending"),
      isNotNull(alertSessionsTable.deliveryId),
      gt(alertSessionsTable.expiresAt, now),
      or(
        eq(servicesTable.status, "alerting"),
        and(
          eq(servicesTable.status, "pending"),
          eq(servicesTable.isDirectRequest, true),
          eq(servicesTable.directWorkerId, alertSessionsTable.workerId),
        ),
      ),
    ));

  for (const alert of activeAlerts) {
    const client = await getClientInfo(alert.clientId);
    emitToUser(alert.workerId, "service:active_alert", {
      serviceId,
      deliveryId: alert.deliveryId,
      title: alert.title,
      clientName: client?.name ?? "Cliente",
      convivenciaScore: client?.clientRating ?? null,
      distanceKm: alert.distanceKm == null ? null : Math.round(alert.distanceKm * 10) / 10,
      phase: "promax",
      totalSeconds: Math.max(1, Math.ceil((alert.expiresAt.getTime() - Date.now()) / 1000)),
      modalSeconds: Math.max(0, Math.ceil(((alert.modalExpiresAt?.getTime() ?? Date.now()) - Date.now()) / 1000)),
      budgetNote: alert.budgetNote ?? null,
    });
  }
}

export async function releaseWorkerAlertSlot(workerId: number, serviceId: number): Promise<boolean> {
  const [released] = await db.delete(workerAlertSlotsTable)
    .where(and(
      eq(workerAlertSlotsTable.workerId, workerId),
      eq(workerAlertSlotsTable.serviceId, serviceId),
      eq(workerAlertSlotsTable.state, "engaged"),
    ))
    .returning({ workerId: workerAlertSlotsTable.workerId });

  if (!released) return false;
  await resumeWorkerQueue(workerId);
  return true;
}

export async function releaseServiceAlertSlots(serviceId: number): Promise<number[]> {
  const slots = await db.select({ workerId: workerAlertSlotsTable.workerId })
    .from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.serviceId, serviceId));
  await db.delete(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.serviceId, serviceId));
  clearServiceAlertTimers(serviceId);
  return slots.map((slot) => slot.workerId);
}

export async function queueDirectServiceAlert(serviceId: number, workerId: number): Promise<void> {
  const now = new Date();
  const [service] = await db.select({
    status: servicesTable.status,
    isDirectRequest: servicesTable.isDirectRequest,
    directWorkerId: servicesTable.directWorkerId,
  }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  if (
    !service ||
    service.status !== "pending" ||
    !service.isDirectRequest ||
    service.directWorkerId !== workerId
  ) return;

  await db.insert(alertSessionsTable).values({
    serviceId,
    workerId,
    response: "pending",
    sentAt: now,
    availableAt: now,
    modalExpiresAt: new Date(now.getTime() + ACTIVE_MODAL_TIMEOUT_MS),
    expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
    phase: "direct",
  }).onConflictDoNothing();

  await db.update(alertSessionsTable)
    .set({
      response: "pending",
      respondedAt: null,
      sentAt: now,
      availableAt: now,
      modalExpiresAt: new Date(now.getTime() + ACTIVE_MODAL_TIMEOUT_MS),
      expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
      deliveredAt: null,
      receivedAt: null,
      deliveryId: null,
      phase: "direct",
      distanceKm: null,
    })
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.workerId, workerId),
      eq(alertSessionsTable.response, "skipped"),
    ));

  await dispatchNextQueuedAlert(workerId);
}

export async function resumeWorkerQueue(workerId: number): Promise<void> {
  await dispatchNextQueuedAlert(workerId);
  await reemitOpenServicesForWorker(workerId);
}

export async function reconcileWorkerAlertState(
  workerId: number,
  activeServiceId: number | null,
): Promise<void> {
  const slots = await db.select({
    serviceId: workerAlertSlotsTable.serviceId,
    state: workerAlertSlotsTable.state,
  })
    .from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, workerId))
    .orderBy(asc(workerAlertSlotsTable.updatedAt));

  if (slots.length === 0) {
    await dispatchNextQueuedAlert(workerId);
    return;
  }

  if (slots.some((slot) => slot.state === "pending")) {
    await reemitActiveAlertsForWorker(workerId);
  }

  for (const slot of slots) {
    if (slot.state !== "engaged") continue;
    let keepEngagedSlot = false;
    if (slot.serviceId === activeServiceId) {
    const [service] = await db.select({
      status: servicesTable.status,
      workerId: servicesTable.workerId,
      isDirectRequest: servicesTable.isDirectRequest,
      directWorkerId: servicesTable.directWorkerId,
    })
      .from(servicesTable)
      .where(eq(servicesTable.id, slot.serviceId))
      .limit(1);

    keepEngagedSlot = !!service && service.workerId == null && (
      service.status === "alerting" ||
      service.status === "open" ||
      (service.status === "pending" &&
        service.isDirectRequest &&
        service.directWorkerId === workerId)
    );
  }

    if (!keepEngagedSlot) {
      await releaseWorkerAlertSlot(workerId, slot.serviceId);
    }
  }
}

export async function handleServiceTerminal(serviceId: number, assignedWorkerId?: number | null): Promise<void> {
  clearArrivalAutoStartTimer(serviceId);
  await db.update(alertSessionsTable)
    .set({ response: "skipped", respondedAt: new Date() })
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.response, "pending"),
    ));
  const releasedWorkerIds = await releaseServiceAlertSlots(serviceId);
  const workerIds = new Set(releasedWorkerIds);
  if (assignedWorkerId) workerIds.add(assignedWorkerId);
  for (const workerId of workerIds) {
    emitToUser(workerId, "service:taken", { serviceId });
    await resumeWorkerQueue(workerId);
  }
}

async function expirePendingAlertSessions(now: Date): Promise<void> {
  const expired = await db.update(alertSessionsTable)
    .set({ response: "skipped", respondedAt: now })
    .where(and(
      eq(alertSessionsTable.response, "pending"),
      lte(alertSessionsTable.expiresAt, now),
    ))
    .returning({
      serviceId: alertSessionsTable.serviceId,
      workerId: alertSessionsTable.workerId,
      deliveredAt: alertSessionsTable.deliveredAt,
    });

  for (const session of expired) {
    const key = timerKey(session.serviceId, session.workerId);
    const timer = alertTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      alertTimers.delete(key);
    }
    await db.delete(workerAlertSlotsTable).where(and(
      eq(workerAlertSlotsTable.workerId, session.workerId),
      eq(workerAlertSlotsTable.serviceId, session.serviceId),
    ));
    if (session.deliveredAt) {
      emitToUser(session.workerId, "service:alert_expired", { serviceId: session.serviceId });
    }
    await checkAllResponded(session.serviceId);
    await dispatchNextQueuedAlert(session.workerId);
  }
}

async function autoStartArrivedServices(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - ARRIVAL_AUTO_START_DELAY_MS);
  const dueServices = await db.select({
    id: servicesTable.id,
    title: servicesTable.title,
    clientId: servicesTable.clientId,
    workerId: servicesTable.workerId,
    workerArrivedAt: servicesTable.workerArrivedAt,
  })
    .from(servicesTable)
    .where(and(
      inArray(servicesTable.status, ["accepted", "in_progress"]),
      lte(servicesTable.workerArrivedAt, cutoff),
      isNull(servicesTable.workStartedAt),
    ));

  for (const service of dueServices) {
    if (!service.workerId || !service.workerArrivedAt) continue;
    const workStartedAt = new Date(service.workerArrivedAt.getTime() + ARRIVAL_AUTO_START_DELAY_MS);
    const [updated] = await db.update(servicesTable)
      .set({ status: "in_progress", workStartedAt })
      .where(and(
        eq(servicesTable.id, service.id),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
        eq(servicesTable.workerId, service.workerId),
        isNull(servicesTable.workStartedAt),
        lte(servicesTable.workerArrivedAt, cutoff),
      ))
      .returning();
    if (!updated) continue;
    clearArrivalAutoStartTimer(service.id);

    const payload = {
      serviceId: service.id,
      status: "in_progress",
      workerArrivedAt: updated.workerArrivedAt,
      workStartedAt: updated.workStartedAt,
      autoStarted: true,
    };
    emitToService(service.id, "service_updated", payload);
    emitToUser(service.clientId, "service_updated", payload);
    emitToUser(service.workerId, "service_updated", payload);

    await createNotification({
      userId: service.clientId,
      title: "El trabajo comenzó",
      message: `El trabajo "${service.title}" comenzó automáticamente, 10 minutos después de la llegada del experto.`,
      type: "service_accepted",
      relatedId: service.id,
      targetRole: "client",
    });
    await createNotification({
      userId: service.workerId,
      title: "Trabajo iniciado automáticamente",
      message: `El trabajo "${service.title}" pasó a En progreso, 10 minutos después de registrar tu llegada.`,
      type: "service_accepted",
      relatedId: service.id,
      targetRole: "worker",
    });
  }
}

async function notifyExpiredFreeCancelWindows(now: Date): Promise<void> {
  const dueServices = await db.select({
    id: servicesTable.id,
    title: servicesTable.title,
    clientId: servicesTable.clientId,
    workerId: servicesTable.workerId,
  })
    .from(servicesTable)
    .where(and(
      inArray(servicesTable.status, ["accepted", "in_progress"]),
      isNotNull(servicesTable.workerId),
      isNotNull(servicesTable.freeCancelUntil),
      lte(servicesTable.freeCancelUntil, now),
      isNull(servicesTable.freeCancelEndNotifiedAt),
    ));

  for (const service of dueServices) {
    if (!service.workerId) continue;
    const [claimed] = await db.update(servicesTable)
      .set({ freeCancelEndNotifiedAt: now })
      .where(and(
        eq(servicesTable.id, service.id),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
        eq(servicesTable.workerId, service.workerId),
        isNotNull(servicesTable.freeCancelUntil),
        lte(servicesTable.freeCancelUntil, now),
        isNull(servicesTable.freeCancelEndNotifiedAt),
      ))
      .returning({ id: servicesTable.id });
    if (!claimed) continue;

    try {
      await createNotifications([
        {
          userId: service.workerId,
          title: "Terminó el tiempo de gracia",
          message: "Los 10 minutos se acabó, tienes que dirigirte a Mis Trabajos y tomarte una selfie de seguridad para que inicie el trabajo.",
          type: "service_accepted",
          relatedId: service.id,
          targetRole: "worker",
        },
        {
          userId: service.clientId,
          title: "Terminó el tiempo de gracia",
          message: "Se acabaron los 10 minutos, el experto va en camino a tu domicilio.",
          type: "service_accepted",
          relatedId: service.id,
          targetRole: "client",
        },
      ]);
    } catch (err) {
      // El insert en lote es atómico; si falla, liberar la marca para reintentar.
      await db.update(servicesTable)
        .set({ freeCancelEndNotifiedAt: null })
        .where(and(eq(servicesTable.id, service.id), eq(servicesTable.freeCancelEndNotifiedAt, now)));
      throw err;
    }
  }
}

export function clearArrivalAutoStartTimer(serviceId: number): void {
  const timer = arrivalAutoStartTimers.get(serviceId);
  if (!timer) return;
  clearTimeout(timer);
  arrivalAutoStartTimers.delete(serviceId);
}

export function scheduleArrivalAutoStart(serviceId: number, workerArrivedAt: Date): void {
  clearArrivalAutoStartTimer(serviceId);
  const dueAt = workerArrivedAt.getTime() + ARRIVAL_AUTO_START_DELAY_MS;
  const timer = setTimeout(() => {
    arrivalAutoStartTimers.delete(serviceId);
    autoStartArrivedServices(new Date()).catch((error) =>
      logger.error({ err: error, serviceId }, "arrival auto-start timer error")
    );
  }, Math.max(0, dueAt - Date.now()));
  timer.unref?.();
  arrivalAutoStartTimers.set(serviceId, timer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto de entrada: lanza la Fase 1 (Pro Max + Cercanos)
// ─────────────────────────────────────────────────────────────────────────────
export async function launchActivePhase(serviceId: number): Promise<void> {
  try {
    const service = await getServiceForMotor(serviceId);
    if (!service) return;
    if (service.isDirectRequest) return;

    // Si no tiene coordenadas: igual alertamos a Pro Max (reciben sin importar distancia)
    // Solo los "cercanos" quedan excluidos (no hay distancia que calcular)
    await launchCombinedActivePhase(serviceId, service);
  } catch (err) {
    logger.error({ err }, "launchActivePhase error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 1 — Pro Max + Cercanos (alerta emergente simultánea)
// ─────────────────────────────────────────────────────────────────────────────
async function launchCombinedActivePhase(
  serviceId: number,
  service: Awaited<ReturnType<typeof getServiceForMotor>>,
): Promise<void> {
  if (!service) return;

  // Sin coordenadas no podemos filtrar por distancia: todos los workers de la
  // categoría son elegibles (no sabemos dónde está el servicio).
  const hasCoords = service.lat != null && service.lng != null;
  const now = new Date();

  // Obtener el radio y las funciones de prioridad de cada plan activo.
  const workerPlanRows = await db
    .select({
      userId: userSubscriptionsTable.userId,
      id: userSubscriptionsTable.id,
      planCode: userSubscriptionsTable.planCode,
      features: subscriptionPlansTable.features,
      createdAt: userSubscriptionsTable.createdAt,
    })
    .from(userSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(userSubscriptionsTable.planCode, subscriptionPlansTable.code))
    .where(and(
      sql`${userSubscriptionsTable.status} IN ('active','trialing')`,
    ));
  const workerPlans = resolveLatestWorkerPlans(workerPlanRows.map(row => ({
    ...row,
    features: (row.features ?? {}) as Record<string, unknown>,
  })));

  logger.info({
    serviceId,
    categoryId: service.categoryId,
    hasCoords,
    proMaxCount: [...workerPlans.values()].filter(plan => PROMAX_PLAN_CODES.includes(plan.planCode)).length,
  }, "motor: launching active phase");

  // Audit only relevant worker IDs and filter outcomes. Run independently so
  // diagnostic queries cannot delay or change the active alert selection.
  const categoryMatch = sql<boolean>`EXISTS (
    SELECT 1 FROM ${workerCategoriesTable}
    WHERE ${workerCategoriesTable.workerId} = ${usersTable.id}
      AND ${workerCategoriesTable.categoryId} = ${service.categoryId!}
  )`;
  void db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      status: usersTable.status,
      isAvailable: usersTable.isAvailable,
      alertCooldownUntil: usersTable.alertCooldownUntil,
      suspendedUntil: usersTable.suspendedUntil,
      categoryMatches: categoryMatch,
    })
    .from(usersTable)
    .where(and(
      inArray(usersTable.role, ["worker", "admin", "client"]),
      or(eq(usersTable.isAvailable, true), categoryMatch),
    ))
    .then(async (diagnosticRows) => {
      const [assignedRows, roleChecks] = await Promise.all([
        db.select({ workerId: servicesTable.workerId })
          .from(servicesTable)
          .where(and(
            inArray(servicesTable.status, ["accepted", "in_progress"]),
            isNotNull(servicesTable.workerId),
          )),
        Promise.all(diagnosticRows.map(async (worker) => ({
          workerId: worker.id,
          activeAsWorker: await isActiveWorkerRecipient(worker.id, worker.role),
        }))),
      ]);
      const assignedWorkerIds = new Set(assignedRows.map((row) => row.workerId));
      const activeWorkerById = new Map(roleChecks.map((row) => [row.workerId, row.activeAsWorker]));
      logger.info({
        serviceId,
        categoryId: service.categoryId,
        workers: diagnosticRows.map((worker) => ({
          workerId: worker.id,
          excludedBy: getActiveAlertExclusionReasons({
            role: worker.role,
            isAvailable: worker.isAvailable,
            status: worker.status,
            categoryMatches: worker.categoryMatches,
            alertCooldownUntil: worker.alertCooldownUntil,
            suspendedUntil: worker.suspendedUntil,
            activeAsWorker: activeWorkerById.get(worker.id) ?? false,
            hasActiveService: assignedWorkerIds.has(worker.id),
            now,
          }),
        })),
      }, "motor: recipient exclusion diagnostics");
    })
    .catch((err) => {
      logger.warn({ err, serviceId }, "motor: recipient diagnostics failed");
    });

  // Obtener todos los workers disponibles de la misma categoría, sin cooldown
  const allEligible = await db
    .select({
      id: usersTable.id,
      lat: usersTable.lat,
      lng: usersTable.lng,
      role: usersTable.role,
      alertRadiusKm: usersTable.alertRadiusKm,
    })
    .from(usersTable)
    .innerJoin(workerCategoriesTable, eq(workerCategoriesTable.workerId, usersTable.id))
    .where(and(
      inArray(usersTable.role, ["worker", "admin", "client"]),
      eq(usersTable.isAvailable, true),
      eq(usersTable.status, "active"),
      eq(workerCategoriesTable.categoryId, service.categoryId!),
      or(isNull(usersTable.alertCooldownUntil), lt(usersTable.alertCooldownUntil, now)),
      // Expertos suspendidos (sanción por cancelaciones) no reciben alertas
      or(isNull(usersTable.suspendedUntil), lt(usersTable.suspendedUntil, now)),
    ));

  const activeRoleCandidates = await Promise.all(allEligible.map(async (worker) => ({
    worker,
    activeAsWorker: await isActiveWorkerRecipient(worker.id, worker.role),
  })));
  const assignedRows = await db.select({ workerId: servicesTable.workerId })
    .from(servicesTable)
    .where(and(
      inArray(servicesTable.status, ["accepted", "in_progress"]),
      isNotNull(servicesTable.workerId),
    ));
  const assignedWorkerIds = new Set(assignedRows.map((row) => row.workerId));

  // Diagnostic only: include connected accounts even when an earlier SQL
  // filter excluded them, so a missing recipient can be traced without
  // changing eligibility or delaying dispatch.
  void (async () => {
    try {
      const diagnosticUserIds = new Set([
        ...allEligible.map((worker) => worker.id),
        ...getOnlineUserSet(),
      ]);
      if (diagnosticUserIds.size === 0) return;
      const diagnosticRows = await db.select({
        id: usersTable.id,
        role: usersTable.role,
        isAvailable: usersTable.isAvailable,
        status: usersTable.status,
        alertCooldownUntil: usersTable.alertCooldownUntil,
        suspendedUntil: usersTable.suspendedUntil,
        matchedCategoryWorkerId: workerCategoriesTable.workerId,
      })
        .from(usersTable)
        .leftJoin(workerCategoriesTable, and(
          eq(workerCategoriesTable.workerId, usersTable.id),
          eq(workerCategoriesTable.categoryId, service.categoryId!),
        ))
        .where(inArray(usersTable.id, [...diagnosticUserIds]));
      const diagnosticWorkers = await Promise.all(diagnosticRows.map(async (worker) => {
        const activeAsWorker = await isActiveWorkerRecipient(worker.id, worker.role);
        const excludedBy = getActiveAlertExclusionReasons({
          role: worker.role,
          isAvailable: worker.isAvailable,
          status: worker.status,
          categoryMatches: worker.matchedCategoryWorkerId === worker.id,
          alertCooldownUntil: worker.alertCooldownUntil,
          suspendedUntil: worker.suspendedUntil,
          activeAsWorker,
          hasActiveService: assignedWorkerIds.has(worker.id),
          now,
        });
        return {
          workerId: worker.id,
          connected: getOnlineUserSet().has(worker.id),
          selectedForBaseEligibility: excludedBy.length === 0,
          excludedBy,
        };
      }));
      logger.info({
        serviceId,
        categoryId: service.categoryId,
        workers: diagnosticWorkers,
      }, "motor: active alert recipient eligibility diagnostics");
    } catch (err) {
      logger.warn({ err, serviceId }, "motor: active alert recipient diagnostics failed");
    }
  })();


  const excludedAssigned = activeRoleCandidates.filter(
    (candidate) => candidate.activeAsWorker && assignedWorkerIds.has(candidate.worker.id),
  ).length;
  const eligibleWorkers = activeRoleCandidates
    .filter((candidate) => candidate.activeAsWorker)
    .filter((candidate) => !assignedWorkerIds.has(candidate.worker.id))
    .map((candidate) => candidate.worker);

  logger.info({ serviceId, eligibleWorkers: eligibleWorkers.length }, "motor: eligible workers found");

  // Calificar:
  //  - Sin coordenadas en el servicio: TODOS los workers de la categoría califican
  //    (no sabemos la distancia, así que no podemos excluir a nadie).
  //  - Con coordenadas:
  //    · Pro Max → dentro del radio personal
  //    · Pro/Gratis → dentro del radio personal y del límite del plan
  const candidateWorkers = eligibleWorkers
    .map(w => {
      const distKm =
        hasCoords && w.lat != null && w.lng != null
          ? haversineKm(w.lat, w.lng, service.lat!, service.lng!)
          : null;
       const plan = workerPlans.get(w.id);
       const isProMax = plan ? PROMAX_PLAN_CODES.includes(plan.planCode) : false;
        const planRadius = typeof plan?.features.radius_km === "number" ? plan.features.radius_km : 5;
        const profileRadius = w.alertRadiusKm;
        const withinAlertRadius = isWorkerWithinAlertRadius({
          isProMax,
          profileRadiusKm: profileRadius,
          planRadiusKm: planRadius,
          distanceKm: distKm,
          hasServiceCoordinates: hasCoords,
        });
        const isNearby = !isProMax && withinAlertRadius;
        const withinProMaxRadius = isProMax && withinAlertRadius;
      return { ...w, distKm, isProMax, isNearby, withinProMaxRadius };
    })
  const rankedCandidates = candidateWorkers
    .filter(w => w.isProMax ? w.withinProMaxRadius : w.isNearby)
    // Ordenar: Pro Max primero, luego por distancia
    .sort((a, b) => {
      if (a.isProMax && !b.isProMax) return -1;
      if (!a.isProMax && b.isProMax) return 1;
      const da = a.distKm ?? 9999;
      const db2 = b.distKm ?? 9999;
      return da - db2;
    });

  logger.info({
    serviceId,
    eligibleWorkers: eligibleWorkers.length,
    excludedByRadius: eligibleWorkers.length - rankedCandidates.length,
    workerRadiusDiagnostics: candidateWorkers.map((worker) => {
      const included = worker.isProMax ? worker.withinProMaxRadius : worker.isNearby;
      return {
        workerId: worker.id,
        included,
        reason: included ? "eligible" : "outside_profile_or_plan_radius",
      };
    }),
    proMaxRadiusDiagnostics: candidateWorkers
      .filter((worker) => worker.isProMax)
      .map((worker) => ({
        id: worker.id,
        profileRadiusKm: worker.alertRadiusKm,
        distanceKm: worker.distKm,
        included: worker.withinProMaxRadius,
        reason: worker.withinProMaxRadius ? "eligible" : "outside_profile_radius",
      })),
  }, "motor: radius filter diagnostics");

  const { proMaxWorkers, nearbyWorkers } = splitAlertRecipients(rankedCandidates);
  const qualified = [...proMaxWorkers, ...nearbyWorkers];

  logger.info({
    serviceId,
    categoryId: service.categoryId,
    qualified: qualified.map(w => ({ id: w.id, isProMax: w.isProMax, distKm: w.distKm })),
    recipientOutcomes: candidateWorkers.map((worker) => {
      const included = worker.isProMax ? worker.withinProMaxRadius : worker.isNearby;
      return {
        workerId: worker.id,
        selected: included,
        phase: worker.isProMax ? "promax" : "nearby",
        reason: included ? null : "outside_profile_or_plan_radius",
      };
    }),
    excludedAssigned,
    excludedByRadius: eligibleWorkers.length - rankedCandidates.length,
  }, "motor: qualified workers for active alert");

  if (qualified.length === 0) {
    // Nadie califica para la alerta activa: ir directo a la bandeja
    logger.info({ serviceId }, "motor: no qualified workers → transitioning to passive");
    await transitionToPassive(serviceId);
    return;
  }

  await db.update(servicesTable)
    .set({ status: "alerting" })
    .where(eq(servicesTable.id, serviceId));

  // Insertar sesiones para workers nuevos (que no tuvieron sesión previa).
  await db
    .insert(alertSessionsTable)
    .values(qualified.map(w => ({
      serviceId,
      workerId: w.id,
      response: "pending",
      sentAt: now,
      availableAt: new Date(now.getTime() + (w.isProMax ? 0 : NEARBY_DELAY_MS)),
      modalExpiresAt: new Date(now.getTime() + (w.isProMax ? 0 : NEARBY_DELAY_MS) + ACTIVE_MODAL_TIMEOUT_MS),
      expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
      phase: w.isProMax ? "promax" : "nearby",
      distanceKm: w.distKm,
    })))
    .onConflictDoNothing();

  // En un reintento, los workers que no respondieron quedan con response="skipped".
  // Resetear solo esas sesiones a "pending" para que checkAllResponded los
  // espere correctamente. Las sesiones "viewed" u otras respuestas legítimas
  // no se tocan.
  await Promise.all(qualified.map((worker) => {
    const availableAt = new Date(now.getTime() + (worker.isProMax ? 0 : NEARBY_DELAY_MS));
    return db.update(alertSessionsTable)
      .set({
        response: "pending",
        respondedAt: null,
        sentAt: now,
        availableAt,
        modalExpiresAt: new Date(availableAt.getTime() + ACTIVE_MODAL_TIMEOUT_MS),
        expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
        deliveredAt: null,
        receivedAt: null,
        deliveryId: null,
        phase: worker.isProMax ? "promax" : "nearby",
        distanceKm: worker.distKm,
      })
      .where(and(
        eq(alertSessionsTable.serviceId, serviceId),
        eq(alertSessionsTable.workerId, worker.id),
        eq(alertSessionsTable.response, "skipped"),
      ));
  }));

  // La fila de sesión ya está persistida; la reserva única decide quién recibe
  // la alerta ahora y quién queda en cola hasta liberar su negociación actual.
  await Promise.all(
    proMaxWorkers.map((worker) => dispatchNextQueuedAlert(worker.id, serviceId)),
  );

  // ── Fase 1b: Pro y Gratis cercanos reciben la alerta 10s después ─────────
  if (nearbyWorkers.length > 0) {
    setTimeout(async () => {
      try {
        // Verificar que el servicio siga en estado "alerting" antes de notificar
        const [current] = await db
          .select({ status: servicesTable.status })
          .from(servicesTable)
          .where(eq(servicesTable.id, serviceId))
          .limit(1);

        if (!current || current.status !== "alerting") {
          logger.info({ serviceId }, "motor: service no longer alerting — skipping nearby delay alert");
          return;
        }

        logger.info({ serviceId, nearbyCount: nearbyWorkers.length }, "motor: emitting delayed alert to nearby workers");
        await Promise.all(
          nearbyWorkers.map((worker) => dispatchNextQueuedAlert(worker.id, serviceId)),
        );
      } catch (err) {
        logger.error({ err, serviceId }, "motor: error in nearby delay alert");
      }
    }, NEARBY_DELAY_MS);
  }
}

async function handleAlertTimeout(serviceId: number, workerId: number): Promise<void> {
  alertTimers.delete(timerKey(serviceId, workerId));

  await db
    .update(alertSessionsTable)
    .set({ response: "skipped", respondedAt: new Date() })
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.workerId, workerId),
      eq(alertSessionsTable.response, "pending"),
    ));

  await db.delete(workerAlertSlotsTable).where(and(
    eq(workerAlertSlotsTable.workerId, workerId),
    eq(workerAlertSlotsTable.serviceId, serviceId),
  ));
  emitToUser(workerId, "service:alert_expired", { serviceId });
  await dispatchNextQueuedAlert(workerId);
  await checkAllResponded(serviceId);
}

export async function handleWorkerSkip(serviceId: number, workerId: number): Promise<void> {
  const key = timerKey(serviceId, workerId);
  const timer = alertTimers.get(key);
  if (timer) { clearTimeout(timer); alertTimers.delete(key); }

  await db
    .update(alertSessionsTable)
    .set({ response: "skipped", respondedAt: new Date() })
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.workerId, workerId),
      eq(alertSessionsTable.response, "pending"),
    ));

  await db.delete(workerAlertSlotsTable).where(and(
    eq(workerAlertSlotsTable.workerId, workerId),
    eq(workerAlertSlotsTable.serviceId, serviceId),
  ));
  await dispatchNextQueuedAlert(workerId);
  await checkAllResponded(serviceId);
}

export async function handleWorkerView(serviceId: number, workerId: number): Promise<boolean> {
  const now = new Date();
  const engaged = await db.transaction(async (tx) => {
    const [service] = await tx.select({
      status: servicesTable.status,
      workerId: servicesTable.workerId,
      clientId: servicesTable.clientId,
      categoryId: servicesTable.categoryId,
      isDirectRequest: servicesTable.isDirectRequest,
      directWorkerId: servicesTable.directWorkerId,
    }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);

    if (!service ||
        (service.status !== "alerting" &&
          service.status !== "open" &&
          !(service.status === "pending" && service.isDirectRequest && service.directWorkerId === workerId)) ||
        (service.workerId && service.workerId !== workerId)) return false;

    const [worker] = await tx.select({
      role: usersTable.role,
      status: usersTable.status,
      isAvailable: usersTable.isAvailable,
    }).from(usersTable).where(eq(usersTable.id, workerId)).for("update").limit(1);
    if (
      !worker ||
      !(await isActiveWorkerRecipient(workerId, worker.role)) ||
      worker.status !== "active" ||
      !worker.isAvailable
    ) return false;

    const [category] = await tx.select({ workerId: workerCategoriesTable.workerId })
      .from(workerCategoriesTable)
      .where(and(
        eq(workerCategoriesTable.workerId, workerId),
        eq(workerCategoriesTable.categoryId, service.categoryId),
      ))
      .limit(1);
    if (!category && service.directWorkerId !== workerId) return false;

    const [activeService] = await tx.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, workerId),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      ))
      .limit(1);
    if (activeService) return false;

    const [existingSlot] = await tx.select()
      .from(workerAlertSlotsTable)
      .where(and(
        eq(workerAlertSlotsTable.workerId, workerId),
        eq(workerAlertSlotsTable.serviceId, serviceId),
      ))
      .limit(1);

    const [session] = await tx.select()
      .from(alertSessionsTable)
      .where(and(
        eq(alertSessionsTable.serviceId, serviceId),
        eq(alertSessionsTable.workerId, workerId),
      ))
      .limit(1);
    const deliveryId = existingSlot?.deliveryId ?? session?.deliveryId ?? randomUUID();

    if (existingSlot) {
      await tx.update(workerAlertSlotsTable)
        .set({ state: "engaged", deliveryId, updatedAt: now })
        .where(and(
          eq(workerAlertSlotsTable.workerId, workerId),
          eq(workerAlertSlotsTable.serviceId, serviceId),
        ));
    } else {
      const [newSlot] = await tx.insert(workerAlertSlotsTable).values({
        workerId,
        serviceId,
        state: "engaged",
        deliveryId,
        updatedAt: now,
      }).onConflictDoNothing().returning({ workerId: workerAlertSlotsTable.workerId });
      if (!newSlot) return false;
    }

    if (session) {
      await tx.update(alertSessionsTable)
        .set({ response: "viewed", respondedAt: now, deliveredAt: session.deliveredAt ?? now })
        .where(eq(alertSessionsTable.id, session.id));
    } else {
      await tx.insert(alertSessionsTable).values({
        serviceId,
        workerId,
        response: "viewed",
        sentAt: now,
        availableAt: now,
      modalExpiresAt: new Date(now.getTime() + ACTIVE_MODAL_TIMEOUT_MS),
        expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
        deliveredAt: now,
      receivedAt: now,
        deliveryId,
        phase: "nearby",
        respondedAt: now,
      }).onConflictDoNothing();
    }

    return true;
  });

  if (!engaged) return false;

  const key = timerKey(serviceId, workerId);
  const timer = alertTimers.get(key);
  if (timer) { clearTimeout(timer); alertTimers.delete(key); }

  await checkAllResponded(serviceId);

  // Sistema de cancelación tardía: sin tarifa de visita técnica y datos de
  // transferencia completos, el experto NO puede generar propuestas (ni
  // siquiera las automáticas al ver la alerta).
  if (!(await isWorkerPayoutComplete(workerId))) return true;

  // Experto suspendido (sanción por cancelaciones): tampoco puede generar la
  // propuesta automática al ver la alerta.
  const [wRow] = await db.select({ suspendedUntil: usersTable.suspendedUntil })
    .from(usersTable).where(eq(usersTable.id, workerId)).limit(1);
  if (wRow?.suspendedUntil && wRow.suspendedUntil > new Date()) return true;

  // Auto-crear propuesta para que el worker pueda chatear de inmediato
  const existing = await db
    .select({ id: proposalsTable.id })
    .from(proposalsTable)
    .where(and(eq(proposalsTable.serviceId, serviceId), eq(proposalsTable.workerId, workerId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(proposalsTable).values({
      serviceId,
      workerId,
      status: "open_chat",
      lastCounterBy: "worker",
    });
  } else {
    await db
      .update(proposalsTable)
      .set({ status: "open_chat" })
      .where(and(
        eq(proposalsTable.serviceId, serviceId),
        eq(proposalsTable.workerId, workerId),
        eq(proposalsTable.status, "rejected"),
      ));
  }

  // Notificar en tiempo real al cliente: le llegó una oferta nueva de este experto
  // (antes esto se creaba silenciosamente en la BD sin avisar al cliente)
  const svc = await getServiceForMotor(serviceId);
  if (svc) {
    emitToUser(svc.clientId, "proposal_updated", { serviceId, action: "new" });
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuando todos los alertados respondieron/expiraron → pasar a bandeja (Fase 2)
// ─────────────────────────────────────────────────────────────────────────────
async function checkAllResponded(serviceId: number): Promise<void> {
  const [service] = await db
    .select({ status: servicesTable.status })
    .from(servicesTable)
    .where(eq(servicesTable.id, serviceId))
    .limit(1);

  if (!service || service.status !== "alerting") return;

  const pendingModalSessions = await db
    .select({ id: alertSessionsTable.id })
    .from(alertSessionsTable)
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.response, "pending"),
      or(
        gt(alertSessionsTable.modalExpiresAt, new Date()),
        and(
          isNull(alertSessionsTable.modalExpiresAt),
          gt(alertSessionsTable.expiresAt, new Date()),
        ),
      ),
    ));

  if (pendingModalSessions.length > 0) return;

  // Todos respondieron/expiraron → Fase 2: bandeja para todos
  await transitionToPassive(serviceId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 — Bandeja (segundo plano): workers activos de la categoría dentro de
// su radio de servicio (serviceRadius). Si el servicio o el worker no tiene
// coordenadas, se incluye igual (no se puede filtrar por distancia).
// ─────────────────────────────────────────────────────────────────────────────
export async function transitionToPassive(serviceId: number): Promise<void> {
  const service = await getServiceForMotor(serviceId);
  if (!service) return;

  const [transitioned] = await db
    .update(servicesTable)
    .set({ status: "open" })
    .where(and(
      eq(servicesTable.id, serviceId),
      or(eq(servicesTable.status, "alerting"), eq(servicesTable.status, "pending")),
    ))
    .returning({ id: servicesTable.id });
  if (!transitioned) return;

  // Workers activos de la categoría con su ubicación y radio de servicio
  const allWorkers = await db
    .select({
      id: usersTable.id,
      lat: usersTable.lat,
      lng: usersTable.lng,
      role: usersTable.role,
      planCode: userSubscriptionsTable.planCode,
      planFeatures: subscriptionPlansTable.features,
    })
    .from(usersTable)
    .innerJoin(workerCategoriesTable, eq(workerCategoriesTable.workerId, usersTable.id))
    .leftJoin(userSubscriptionsTable, and(
      eq(userSubscriptionsTable.userId, usersTable.id),
      sql`${userSubscriptionsTable.status} IN ('active','trialing')`,
    ))
    .leftJoin(subscriptionPlansTable, eq(userSubscriptionsTable.planCode, subscriptionPlansTable.code))
    .where(and(
      inArray(usersTable.role, ["worker", "admin", "client"]),
      eq(usersTable.isAvailable, true),
      eq(usersTable.status, "active"),
      eq(workerCategoriesTable.categoryId, service.categoryId!),
      // Expertos suspendidos tampoco ven la bandeja de disponibles
      or(isNull(usersTable.suspendedUntil), lt(usersTable.suspendedUntil, new Date())),
    ));

  // Filtrar por radio de servicio del worker vs ubicación del servicio
  const hasServiceCoords = !!(service.lat && service.lng);
  const [busySlots, assignedServices] = await Promise.all([
    db.select({
      workerId: workerAlertSlotsTable.workerId,
      serviceId: workerAlertSlotsTable.serviceId,
    }).from(workerAlertSlotsTable),
    db.select({ workerId: servicesTable.workerId })
      .from(servicesTable)
      .where(and(
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      )),
  ]);
  const busyWorkerIds = new Set([
    ...busySlots.filter((slot) => slot.serviceId !== serviceId).map((slot) => slot.workerId),
    ...assignedServices.map((service) => service.workerId).filter((id): id is number => id !== null),
  ]);

  const activeRoleRows = await Promise.all(allWorkers.map(async (worker) => ({
    worker,
    activeAsWorker: await isActiveWorkerRecipient(worker.id, worker.role),
  })));
  const eligible = activeRoleRows.filter(({ worker, activeAsWorker }) => {
    if (!activeAsWorker || busyWorkerIds.has(worker.id)) return false;
    if (!hasServiceCoords || !worker.lat || !worker.lng) return true; // sin coords → incluir
    const dist = haversineKm(worker.lat, worker.lng, service.lat!, service.lng!);
    const planFeatures = worker.planFeatures as Record<string, unknown> | null;
    const radiusKm = typeof planFeatures?.radius_km === "number"
      ? planFeatures.radius_km
      : 5;
    return radiusKm < 0 || dist <= radiusKm;
  }).map(({ worker }) => worker);

  logger.info({
    serviceId,
    totalWorkers: allWorkers.length,
    eligibleForBandeja: eligible.length,
    hasServiceCoords,
  }, "motor: transitioning to passive (bandeja)");

  if (eligible.length > 0) {
    emitToWorkers(eligible.map(w => w.id), "service:available", {
      serviceId,
      title: service.title,
      categoryId: service.categoryId,
    });
  }
}

export async function handleServiceTaken(serviceId: number, winnerWorkerId: number): Promise<void> {
  // Cooldown de 1 hora para el ganador (evita spam, pero permite recibir nuevos trabajos rápido)
  await invalidateOtherWorkerAlerts(
    winnerWorkerId,
    serviceId,
    new Date(Date.now() + 60 * 60 * 1000),
  );

  emitToService(serviceId, "service:taken", { serviceId });
  await handleServiceTerminal(serviceId, winnerWorkerId);
}

/**
 * Close every other active alert and reservation for this worker. Dispatch,
 * replay and assignment paths serialize on the worker row so a reservation
 * cannot survive an assignment and later be emitted as a stale card.
 */
async function invalidateOtherWorkerAlerts(
  workerId: number,
  keepServiceId: number,
  cooldownUntil?: Date,
): Promise<void> {
  const invalidatedServices = await db.transaction(async (tx) => {
    await tx.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, workerId))
      .for("update")
      .limit(1);

    if (cooldownUntil) {
      await tx.update(usersTable)
        .set({ alertCooldownUntil: cooldownUntil })
        .where(eq(usersTable.id, workerId));
    }

    const skippedSessions = await tx.update(alertSessionsTable)
      .set({ response: "skipped", respondedAt: new Date() })
      .where(and(
        eq(alertSessionsTable.workerId, workerId),
        inArray(alertSessionsTable.response, ["pending", "viewed"]),
        sql`${alertSessionsTable.serviceId} <> ${keepServiceId}`,
      ))
      .returning({ serviceId: alertSessionsTable.serviceId });
    const releasedSlots = await tx.delete(workerAlertSlotsTable)
      .where(and(
        eq(workerAlertSlotsTable.workerId, workerId),
        sql`${workerAlertSlotsTable.serviceId} <> ${keepServiceId}`,
      ))
      .returning({ serviceId: workerAlertSlotsTable.serviceId });

    return [...new Set([
      ...skippedSessions.map((session) => session.serviceId),
      ...releasedSlots.map((slot) => slot.serviceId),
    ])];
  });

  for (const otherServiceId of invalidatedServices) {
    const key = timerKey(otherServiceId, workerId);
    const timer = alertTimers.get(key);
    if (timer) clearTimeout(timer);
    alertTimers.delete(key);
    emitToUser(workerId, "service:taken", { serviceId: otherServiceId });
    await checkAllResponded(otherServiceId);
  }
}

/** Called after cancellation/completion commits, so only one winner releases the queue. */
/** Cancela los temporizadores de alertas de una solicitud que fue eliminada. */
export function clearServiceAlertTimers(serviceId: number): void {
  for (const [key, timer] of alertTimers.entries()) {
    if (key.startsWith(`${serviceId}:`)) {
      clearTimeout(timer);
      alertTimers.delete(key);
    }
  }
}

export async function pauseWorkerAlertQueue(workerId: number): Promise<void> {
  const slots = await db.select()
    .from(workerAlertSlotsTable)
    .where(and(
      eq(workerAlertSlotsTable.workerId, workerId),
      eq(workerAlertSlotsTable.state, "pending"),
    ));
  for (const slot of slots) {
    const key = timerKey(slot.serviceId, workerId);
    const timer = alertTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      alertTimers.delete(key);
    }
    await db.update(alertSessionsTable)
      .set({ response: "skipped", respondedAt: new Date() })
      .where(and(
        eq(alertSessionsTable.serviceId, slot.serviceId),
        eq(alertSessionsTable.workerId, workerId),
        eq(alertSessionsTable.response, "pending"),
      ));
    await db.delete(workerAlertSlotsTable).where(and(
      eq(workerAlertSlotsTable.workerId, workerId),
      eq(workerAlertSlotsTable.serviceId, slot.serviceId),
    ));
    emitToUser(workerId, "service:alert_expired", { serviceId: slot.serviceId });
    await checkAllResponded(slot.serviceId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-emite solamente la reserva pendiente del worker. La misma deliveryId
// permite al cliente deduplicar el evento si el socket se reconecta.
// ─────────────────────────────────────────────────────────────────────────────
export async function reemitActiveAlertsForWorker(workerId: number): Promise<void> {
  try {
    const now = new Date();
    const [worker] = await db.select({
      role: usersTable.role,
      status: usersTable.status,
      isAvailable: usersTable.isAvailable,
      alertCooldownUntil: usersTable.alertCooldownUntil,
      suspendedUntil: usersTable.suspendedUntil,
    }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);
    if (
      !worker ||
      !(await isActiveWorkerRecipient(workerId, worker.role)) ||
      worker.status !== "active" ||
      !worker.isAvailable ||
      (worker.alertCooldownUntil && worker.alertCooldownUntil > now) ||
      (worker.suspendedUntil && worker.suspendedUntil > now)
    ) return;

    const [assignedService] = await db.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, workerId),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      ))
      .limit(1);
    if (assignedService) {
      await invalidateOtherWorkerAlerts(workerId, assignedService.id);
      return;
    }

    const slots = await db.select()
      .from(workerAlertSlotsTable)
      .where(eq(workerAlertSlotsTable.workerId, workerId))
      .orderBy(asc(workerAlertSlotsTable.updatedAt));
    const lateSessions = await addLateActiveAlertSessions(workerId, now);
    const dispatchLateSession = async (session: { serviceId: number; availableAt: Date }) => {
      const delay = Math.max(0, session.availableAt.getTime() - Date.now());
      if (delay === 0) {
        await dispatchNextQueuedAlert(workerId, session.serviceId, true);
        return;
      }
      setTimeout(() => {
        dispatchNextQueuedAlert(workerId, session.serviceId, true).catch((error) =>
          logger.error({ err: error, serviceId: session.serviceId, workerId }, "late alert dispatch error")
        );
      }, delay);
    };
    await Promise.all(lateSessions.map(dispatchLateSession));
    if (slots.length === 0) {
      await dispatchNextQueuedAlert(workerId);
      return;
    }
    for (const slot of slots) {
    if (slot.state !== "pending") continue;

    const [active] = await db.select({
      sessionId: alertSessionsTable.id,
      serviceId: servicesTable.id,
      title: servicesTable.title,
      clientId: servicesTable.clientId,
      budgetNote: servicesTable.budgetNote,
      phase: alertSessionsTable.phase,
      distanceKm: alertSessionsTable.distanceKm,
      expiresAt: alertSessionsTable.expiresAt,
      modalExpiresAt: alertSessionsTable.modalExpiresAt,
      status: servicesTable.status,
      isDirectRequest: servicesTable.isDirectRequest,
      directWorkerId: servicesTable.directWorkerId,
    })
      .from(alertSessionsTable)
      .innerJoin(servicesTable, eq(servicesTable.id, alertSessionsTable.serviceId))
      .where(and(
        eq(alertSessionsTable.serviceId, slot.serviceId),
        eq(alertSessionsTable.workerId, workerId),
        eq(alertSessionsTable.response, "pending"),
        eq(alertSessionsTable.deliveryId, slot.deliveryId),
        gt(alertSessionsTable.expiresAt, now),
      ))
      .limit(1);

    const isStillActive = active && (
      active.status === "alerting" ||
      (active.status === "pending" && active.isDirectRequest && active.directWorkerId === workerId)
    );
    if (!active || !isStillActive) {
      await db.update(alertSessionsTable)
        .set({ response: "skipped", respondedAt: now })
        .where(and(
          eq(alertSessionsTable.serviceId, slot.serviceId),
          eq(alertSessionsTable.workerId, workerId),
          eq(alertSessionsTable.response, "pending"),
        ));
      await db.delete(workerAlertSlotsTable).where(and(
        eq(workerAlertSlotsTable.workerId, workerId),
        eq(workerAlertSlotsTable.serviceId, slot.serviceId),
      ));
      await dispatchNextQueuedAlert(workerId);
      if (active) await checkAllResponded(active.serviceId);
      continue;
    }

    const client = await getClientInfo(active.clientId);
    const distanceKm = active.distanceKm == null ? null : Math.round(active.distanceKm * 10) / 10;
    const replayed = await db.transaction(async (tx) => {
      await tx.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, workerId))
        .for("update")
        .limit(1);

      const [assigned] = await tx.select({ id: servicesTable.id })
        .from(servicesTable)
        .where(and(
          eq(servicesTable.workerId, workerId),
          inArray(servicesTable.status, ["accepted", "in_progress"]),
        ))
        .limit(1);
      if (assigned) return { busyServiceId: assigned.id, sent: false };

      const [stillPending] = await tx.select({ sessionId: alertSessionsTable.id })
        .from(alertSessionsTable)
        .innerJoin(workerAlertSlotsTable, and(
          eq(workerAlertSlotsTable.workerId, alertSessionsTable.workerId),
          eq(workerAlertSlotsTable.serviceId, alertSessionsTable.serviceId),
          eq(workerAlertSlotsTable.deliveryId, alertSessionsTable.deliveryId),
        ))
        .where(and(
          eq(alertSessionsTable.serviceId, active.serviceId),
          eq(alertSessionsTable.workerId, workerId),
          eq(alertSessionsTable.response, "pending"),
          eq(alertSessionsTable.deliveryId, slot.deliveryId),
          gt(alertSessionsTable.expiresAt, new Date()),
        ))
        .limit(1);
      if (!stillPending) return { sent: false };

      emitToUser(workerId, "service:active_alert", {
        serviceId: active.serviceId,
        deliveryId: slot.deliveryId,
        title: active.title,
        clientName: client?.name ?? "Cliente",
        convivenciaScore: client?.clientRating ?? null,
        distanceKm,
        phase: isProMaxAlertPhase(active.phase) ? "promax" : "nearby",
        totalSeconds: Math.max(1, Math.ceil((active.expiresAt.getTime() - Date.now()) / 1000)),
        modalSeconds: Math.max(0, Math.ceil(((active.modalExpiresAt?.getTime() ?? Date.now()) - Date.now()) / 1000)),
        budgetNote: isProMaxAlertPhase(active.phase) ? (active.budgetNote ?? null) : null,
      });
      return { sent: true };
    });
    if (replayed.busyServiceId) {
      await invalidateOtherWorkerAlerts(workerId, replayed.busyServiceId);
      return;
    }
    if (!replayed.sent) continue;

    const key = timerKey(active.serviceId, workerId);
    const oldTimer = alertTimers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    alertTimers.set(key, setTimeout(() => {
      handleAlertTimeout(active.serviceId, workerId).catch((error) =>
        logger.error({ err: error, serviceId: active.serviceId, workerId }, "reconnected alert timeout error")
      );
    }, Math.max(0, active.expiresAt.getTime() - Date.now())));
    }
    await dispatchNextQueuedAlert(workerId);
  } catch (err) {
    logger.error({ err }, "reemitActiveAlertsForWorker error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-emite servicios en estado "open" (bandeja) al worker cuando abre la app.
// Así, si publicaron un servicio mientras el worker estaba offline, al
// reconectarse verá los servicios disponibles sin esperar el próximo cron.
// ─────────────────────────────────────────────────────────────────────────────
export async function reemitOpenServicesForWorker(workerId: number): Promise<void> {
  try {
    const [worker] = await db
      .select({
        lat: usersTable.lat,
        lng: usersTable.lng,
        isAvailable: usersTable.isAvailable,
        role: usersTable.role,
        status: usersTable.status,
        serviceRadius: usersTable.serviceRadius,
        alertCooldownUntil: usersTable.alertCooldownUntil,
        suspendedUntil: usersTable.suspendedUntil,
      })
      .from(usersTable)
      .where(eq(usersTable.id, workerId))
      .limit(1);

    if (
      !worker ||
      !(await isActiveWorkerRecipient(workerId, worker.role)) ||
      !worker.isAvailable ||
      worker.status !== "active"
    ) return;
    const now = new Date();
    if (worker.alertCooldownUntil && worker.alertCooldownUntil > now) return;
    if (worker.suspendedUntil && worker.suspendedUntil > now) return;
    const [slot] = await db.select({ workerId: workerAlertSlotsTable.workerId })
      .from(workerAlertSlotsTable)
      .where(eq(workerAlertSlotsTable.workerId, workerId))
      .limit(1);
    if (slot) return;
    const [assignedService] = await db.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.workerId, workerId),
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      ))
      .limit(1);
    if (assignedService) return;

    // Categorías del worker
    const workerCats = await db
      .select({ categoryId: workerCategoriesTable.categoryId })
      .from(workerCategoriesTable)
      .where(eq(workerCategoriesTable.workerId, workerId));
    if (workerCats.length === 0) return;

    const catIds = workerCats.map(c => c.categoryId);

    // Servicios en estado "open" de sus categorías (últimas 12 horas)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const openServices = await db
      .select({
        id: servicesTable.id,
        title: servicesTable.title,
        categoryId: servicesTable.categoryId,
        lat: servicesTable.lat,
        lng: servicesTable.lng,
      })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.status, "open"),
        inArray(servicesTable.categoryId, catIds),
        gt(servicesTable.createdAt, twelveHoursAgo),
      ));

    if (openServices.length === 0) return;

    // Filtrar por radio de servicio del worker
    const eligible = openServices.filter(s => {
      if (!s.lat || !s.lng || !worker.lat || !worker.lng) return true;
      const dist = haversineKm(worker.lat, worker.lng, s.lat, s.lng);
      return dist <= (worker.serviceRadius ?? 50);
    });

    if (eligible.length === 0) return;

    logger.info({ workerId, count: eligible.length }, "motor: re-emitting open services to reconnected worker");

    for (const svc of eligible) {
      emitToUser(workerId, "service:available", {
        serviceId: svc.id,
        title: svc.title,
        categoryId: svc.categoryId,
      });
    }
  } catch (err) {
    logger.error({ err }, "reemitOpenServicesForWorker error");
  }
}

// Cron de un minuto — relanza servicios bloqueados en "pending"
// y recupera servicios "alerting" atascados tras reinicio del servidor
// (los timers en memoria se pierden en cada reinicio; esto los resuelve).
export async function runMotorMinuteLoop(): Promise<void> {
  try {
    await expirePendingAlertSessions(new Date());
  } catch (err) {
    logger.error({ err }, "alert queue expiration recovery error");
  }

  try {
    await notifyExpiredFreeCancelWindows(new Date());
  } catch (err) {
    logger.error({ err }, "free-cancel expiry notification recovery error");
  }

  try {
    await autoStartArrivedServices(new Date());
  } catch (err) {
    logger.error({ err }, "arrival auto-start recovery error");
  }

  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    // Ventana amplia para "alerting": ACTIVE_TIMEOUT_MS (60 s) + margen de 90 s
    const alertingStuckAgo = new Date(Date.now() - (ACTIVE_TIMEOUT_MS + 90_000));

    const stuckServices = await db
      .select({ id: servicesTable.id, status: servicesTable.status })
      .from(servicesTable)
      .where(and(
        or(
          // Servicio nunca pasó de "pending" (motor no corrió o falló)
          and(eq(servicesTable.status, "pending"), lt(servicesTable.updatedAt, twoMinutesAgo)),
          // Servicio quedó en "alerting" tras reinicio del servidor (timers perdidos)
          and(eq(servicesTable.status, "alerting"), lt(servicesTable.updatedAt, alertingStuckAgo)),
        ),
      ));

    for (const svc of stuckServices) {
      if (svc.status === "pending") {
        logger.info({ serviceId: svc.id }, "Motor: re-launching stuck pending service");
        await launchActivePhase(svc.id);
      } else {
        // "alerting" atascado → pasar directamente a bandeja; los timers ya expiraron
        logger.info({ serviceId: svc.id }, "Motor: recovering stuck alerting service → transitioning to passive");
        // Marcar todas las sesiones pendientes como "skipped"
        await db
          .update(alertSessionsTable)
          .set({ response: "skipped", respondedAt: new Date() })
          .where(and(
            eq(alertSessionsTable.serviceId, svc.id),
            eq(alertSessionsTable.response, "pending"),
          ));
        await transitionToPassive(svc.id);
      }
    }
  } catch (err) {
    logger.error({ err }, "runMotorMinuteLoop error");
  }

  // Auto-completar: una de las partes marcó el trabajo como completado y la
  // otra no confirmó en 24 horas → el sistema completa automáticamente.
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expired = await db
      .select()
      .from(servicesTable)
      .where(and(
        eq(servicesTable.status, "in_progress"),
        or(
          lt(servicesTable.workerCompletedAt, dayAgo),
          lt(servicesTable.clientCompletedAt, dayAgo),
        ),
      ));

    for (const svc of expired) {
      // Update condicional: si se completó/canceló mientras tanto, no hacer nada.
      const [updated] = await db.update(servicesTable).set({
        status: "completed",
        completedAt: new Date(),
      }).where(and(eq(servicesTable.id, svc.id), eq(servicesTable.status, "in_progress"))).returning();
      if (!updated) continue;

      logger.info({ serviceId: svc.id }, "Motor: auto-completado tras 24h sin confirmación de la otra parte");

      // Side effects compartidos (notificaciones, mensaje de sistema y, si el
      // pago es por transferencia, datos bancarios oficiales en el chat).
      await finalizeCompletionSideEffects(
        updated,
        "El trabajo se completó automáticamente (24 horas sin respuesta de la otra parte).",
      );
      await handleServiceTerminal(updated.id, updated.workerId);
    }
  } catch (err) {
    logger.error({ err }, "auto-complete 24h error");
  }
}
