import { randomUUID } from "node:crypto";
import { db, servicesTable, usersTable, alertSessionsTable, workerAlertSlotsTable, proposalsTable, workerCategoriesTable, messagesTable, subscriptionPlansTable } from "../db";
import { userSubscriptionsTable } from "../db/schema/subscriptions";
import { eq, and, isNull, isNotNull, or, lt, gt, lte, asc, inArray, sql } from "drizzle-orm";
import { emitToWorkers, emitToUser, emitToService, isAdminInWorkerMode } from "./socketio";
import { createNotification, createNotifications } from "./createNotification";
import { logger } from "./logger";
import {
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
const ACTIVE_TIMEOUT_MS = 60_000;     // 60 s para la fase activa (Pro Max + cercanos)
const ARRIVAL_AUTO_START_DELAY_MS = 10 * 60_000;

const PROMAX_PLAN_CODES = ["pro_plus_monthly", "pro_plus_annual"];

async function isActiveWorkerRecipient(userId: number, databaseRole: string): Promise<boolean> {
  if (databaseRole === "worker") return true;
  if (databaseRole !== "admin") return false;
  return isAdminInWorkerMode(userId);
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

/**
 * Atomically reserves the worker's single alert slot and delivers the oldest
 * currently-valid queued request. A pending slot represents an unread alert;
 * an engaged slot remains held while the worker reviews or negotiates.
 */
export async function dispatchNextQueuedAlert(workerId: number): Promise<boolean> {
  const now = new Date();
  const dispatchResult = await db.transaction(async (tx) => {
    const [worker] = await tx.select({
      role: usersTable.role,
      isAvailable: usersTable.isAvailable,
      status: usersTable.status,
      alertCooldownUntil: usersTable.alertCooldownUntil,
      suspendedUntil: usersTable.suspendedUntil,
    }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);

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
    if (assignedServices.length > 0) return null;

    const expiredSessions = await tx.update(alertSessionsTable)
      .set({ response: "skipped", respondedAt: now })
      .where(and(
        eq(alertSessionsTable.workerId, workerId),
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
    }).onConflictDoNothing().returning({ workerId: workerAlertSlotsTable.workerId });
    if (!slot) return { dispatch: null, expiredServiceIds };

    const [session] = await tx.update(alertSessionsTable)
      .set({ deliveredAt: now, deliveryId, sentAt: now })
      .where(and(
        eq(alertSessionsTable.id, candidate.sessionId),
        eq(alertSessionsTable.response, "pending"),
        isNull(alertSessionsTable.deliveredAt),
        lte(alertSessionsTable.availableAt, now),
        gt(alertSessionsTable.expiresAt, now),
      ))
      .returning({ id: alertSessionsTable.id });

    if (!session) {
      await tx.delete(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, workerId));
      return { dispatch: null, expiredServiceIds };
    }

    return { dispatch: { ...candidate, deliveryId }, expiredServiceIds };
  });

  if (!dispatchResult) return false;
  for (const serviceId of dispatchResult.expiredServiceIds) {
    await checkAllResponded(serviceId);
  }
  const dispatch = dispatchResult.dispatch;
  if (!dispatch) return false;

  // Do not emit an alert if the reservation was already invalidated by a
  // concurrent assignment/cancellation while this transaction was committing.
  const [current] = await db.select({
    status: servicesTable.status,
    clientId: servicesTable.clientId,
    isDirectRequest: servicesTable.isDirectRequest,
    directWorkerId: servicesTable.directWorkerId,
  }).from(servicesTable).where(eq(servicesTable.id, dispatch.serviceId)).limit(1);
  const [slot] = await db.select({ serviceId: workerAlertSlotsTable.serviceId })
    .from(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, workerId)).limit(1);
  if (!current || slot?.serviceId !== dispatch.serviceId ||
      (current.status !== "alerting" &&
        !(current.status === "pending" && current.isDirectRequest && current.directWorkerId === workerId))) {
    await db.update(alertSessionsTable)
      .set({ response: "skipped", respondedAt: new Date() })
      .where(and(
        eq(alertSessionsTable.serviceId, dispatch.serviceId),
        eq(alertSessionsTable.workerId, workerId),
        eq(alertSessionsTable.response, "pending"),
      ));
    await db.delete(workerAlertSlotsTable).where(and(
      eq(workerAlertSlotsTable.workerId, workerId),
      eq(workerAlertSlotsTable.serviceId, dispatch.serviceId),
    ));
    return false;
  }

  const client = await getClientInfo(current.clientId);
  const distanceKm = dispatch.distanceKm == null ? null : Math.round(dispatch.distanceKm * 10) / 10;
  const remainingSeconds = Math.max(1, Math.ceil((dispatch.expiresAt.getTime() - Date.now()) / 1000));
  const phase = dispatch.phase === "promax" ? "promax" : "nearby";

  emitToUser(workerId, "service:active_alert", {
    serviceId: dispatch.serviceId,
    deliveryId: dispatch.deliveryId,
    title: dispatch.title,
    clientName: client?.name ?? "Cliente",
    convivenciaScore: client?.clientRating ?? null,
    distanceKm,
    phase,
    totalSeconds: remainingSeconds,
    budgetNote: phase === "promax" ? (dispatch.budgetNote ?? null) : null,
  });
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
  return true;
}

/** Refresh the live Pro Max popup when the client edits the service budget. */
export async function refreshProMaxBudgetAlerts(serviceId: number): Promise<void> {
  const now = new Date();
  const activeAlerts = await db.select({
    workerId: alertSessionsTable.workerId,
    deliveryId: alertSessionsTable.deliveryId,
    distanceKm: alertSessionsTable.distanceKm,
    expiresAt: alertSessionsTable.expiresAt,
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
      eq(alertSessionsTable.phase, "promax"),
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
    expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
    phase: "direct",
  }).onConflictDoNothing();

  await db.update(alertSessionsTable)
    .set({
      response: "pending",
      respondedAt: null,
      sentAt: now,
      availableAt: now,
      expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
      deliveredAt: null,
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
  const [slot] = await db.select({
    serviceId: workerAlertSlotsTable.serviceId,
    state: workerAlertSlotsTable.state,
  })
    .from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, workerId))
    .limit(1);

  if (!slot) {
    await dispatchNextQueuedAlert(workerId);
    return;
  }

  if (slot.state === "pending") {
    await reemitActiveAlertsForWorker(workerId);
    return;
  }

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
  const hasCoords = !!(service.lat && service.lng);
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

  // Obtener todos los workers disponibles de la misma categoría, sin cooldown
  const allEligible = await db
    .select({
      id: usersTable.id,
      lat: usersTable.lat,
      lng: usersTable.lng,
      role: usersTable.role,
    })
    .from(usersTable)
    .innerJoin(workerCategoriesTable, eq(workerCategoriesTable.workerId, usersTable.id))
    .where(and(
      inArray(usersTable.role, ["worker", "admin"]),
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
  const eligibleWorkers = activeRoleCandidates
    .filter((candidate) => candidate.activeAsWorker)
    .map((candidate) => candidate.worker);

  logger.info({ serviceId, eligibleWorkers: eligibleWorkers.length }, "motor: eligible workers found");

  // Calificar:
  //  - Sin coordenadas en el servicio: TODOS los workers de la categoría califican
  //    (no sabemos la distancia, así que no podemos excluir a nadie).
  //  - Con coordenadas:
  //    · Pro Max → dentro de alertRadiusKm (o ilimitado si no tiene radio)
  //    · No Pro Max → dentro de NEARBY_RADIUS_KM
  const rankedCandidates = eligibleWorkers
    .map(w => {
      const distKm =
        hasCoords && w.lat && w.lng
          ? haversineKm(w.lat, w.lng, service.lat!, service.lng!)
          : null;
       const plan = workerPlans.get(w.id);
       const isProMax = plan ? PROMAX_PLAN_CODES.includes(plan.planCode) : false;
       const planRadius = typeof plan?.features.radius_km === "number" ? plan.features.radius_km : 5;
       const isUnlimited = planRadius < 0;
       const isNearby = !hasCoords || isUnlimited || (distKm !== null && distKm <= planRadius);
       // Pro+ recibe la posición prioritaria; su radio también es ilimitado.
       const withinProMaxRadius = isProMax && (
        !hasCoords ||                         // sin coords del servicio → incluir
         isUnlimited ||
        distKm === null ||                    // sin coords del worker → incluir
         distKm <= planRadius
      );
      return { ...w, distKm, isProMax, isNearby, withinProMaxRadius };
    })
    .filter(w => w.withinProMaxRadius || w.isNearby)
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
  }, "motor: radius filter diagnostics");

  const { proMaxWorkers, nearbyWorkers } = splitAlertRecipients(rankedCandidates);
  const qualified = [...proMaxWorkers, ...nearbyWorkers];

  logger.info({
    serviceId,
    qualified: qualified.map(w => ({ id: w.id, isProMax: w.isProMax, distKm: w.distKm })),
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
        expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
        deliveredAt: null,
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
  for (const worker of proMaxWorkers) {
    await dispatchNextQueuedAlert(worker.id);
  }

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
        for (const worker of nearbyWorkers) {
          await dispatchNextQueuedAlert(worker.id);
        }
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
    }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);
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
      .where(eq(workerAlertSlotsTable.workerId, workerId))
      .limit(1);
    if (existingSlot && existingSlot.serviceId !== serviceId) return false;

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
        expiresAt: new Date(now.getTime() + ACTIVE_TIMEOUT_MS),
        deliveredAt: now,
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

  const pendingSessions = await db
    .select({ id: alertSessionsTable.id })
    .from(alertSessionsTable)
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.response, "pending"),
      gt(alertSessionsTable.expiresAt, new Date()),
    ));

  if (pendingSessions.length > 0) return;

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

  await db
    .update(servicesTable)
    .set({ status: "open" })
    .where(and(
      eq(servicesTable.id, serviceId),
      or(eq(servicesTable.status, "alerting"), eq(servicesTable.status, "pending")),
    ));

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
      inArray(usersTable.role, ["worker", "admin"]),
      eq(usersTable.isAvailable, true),
      eq(usersTable.status, "active"),
      eq(workerCategoriesTable.categoryId, service.categoryId!),
      // Expertos suspendidos tampoco ven la bandeja de disponibles
      or(isNull(usersTable.suspendedUntil), lt(usersTable.suspendedUntil, new Date())),
    ));

  // Filtrar por radio de servicio del worker vs ubicación del servicio
  const hasServiceCoords = !!(service.lat && service.lng);
  const [busySlots, assignedServices] = await Promise.all([
    db.select({ workerId: workerAlertSlotsTable.workerId }).from(workerAlertSlotsTable),
    db.select({ workerId: servicesTable.workerId })
      .from(servicesTable)
      .where(and(
        inArray(servicesTable.status, ["accepted", "in_progress"]),
      )),
  ]);
  const busyWorkerIds = new Set([
    ...busySlots.map((slot) => slot.workerId),
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
  const cooldownUntil = new Date(Date.now() + 60 * 60 * 1000);
  await db
    .update(usersTable)
    .set({ alertCooldownUntil: cooldownUntil })
    .where(eq(usersTable.id, winnerWorkerId));

  emitToService(serviceId, "service:taken", { serviceId });
  await handleServiceTerminal(serviceId, winnerWorkerId);
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
  const [slot] = await db.select()
    .from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, workerId))
    .limit(1);
  if (!slot || slot.state !== "pending") return;

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
  await db.delete(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, workerId));
  emitToUser(workerId, "service:alert_expired", { serviceId: slot.serviceId });
  await checkAllResponded(slot.serviceId);
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
    }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);
    if (
      !worker ||
      !(await isActiveWorkerRecipient(workerId, worker.role)) ||
      worker.status !== "active" ||
      !worker.isAvailable
    ) return;

    const [slot] = await db.select()
      .from(workerAlertSlotsTable)
      .where(eq(workerAlertSlotsTable.workerId, workerId))
      .limit(1);
    if (!slot) {
      await dispatchNextQueuedAlert(workerId);
      return;
    }
    if (slot.state !== "pending") return;

    const [active] = await db.select({
      sessionId: alertSessionsTable.id,
      serviceId: servicesTable.id,
      title: servicesTable.title,
      clientId: servicesTable.clientId,
      budgetNote: servicesTable.budgetNote,
      phase: alertSessionsTable.phase,
      distanceKm: alertSessionsTable.distanceKm,
      expiresAt: alertSessionsTable.expiresAt,
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
      await db.delete(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, workerId));
      await dispatchNextQueuedAlert(workerId);
      if (active) await checkAllResponded(active.serviceId);
      return;
    }

    const client = await getClientInfo(active.clientId);
    const distanceKm = active.distanceKm == null ? null : Math.round(active.distanceKm * 10) / 10;
    emitToUser(workerId, "service:active_alert", {
      serviceId: active.serviceId,
      deliveryId: slot.deliveryId,
      title: active.title,
      clientName: client?.name ?? "Cliente",
      convivenciaScore: client?.clientRating ?? null,
      distanceKm,
      phase: active.phase === "promax" ? "promax" : "nearby",
      totalSeconds: Math.max(1, Math.ceil((active.expiresAt.getTime() - Date.now()) / 1000)),
      budgetNote: active.phase === "promax" ? (active.budgetNote ?? null) : null,
    });

    const key = timerKey(active.serviceId, workerId);
    const oldTimer = alertTimers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    alertTimers.set(key, setTimeout(() => {
      handleAlertTimeout(active.serviceId, workerId).catch((error) =>
        logger.error({ err: error, serviceId: active.serviceId, workerId }, "reconnected alert timeout error")
      );
    }, Math.max(0, active.expiresAt.getTime() - Date.now())));
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
