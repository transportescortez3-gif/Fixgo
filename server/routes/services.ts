import { Router } from "express";
import { db, servicesTable, usersTable, categoriesTable, subcategoriesTable, userFavoritesTable, workerCategoriesTable, proposalsTable, messagesTable, reviewsTable, paymentsTable, alertSessionsTable, cancellationChargesTable, securitySelfiesTable } from "../db";
import { createNotification, createNotifications } from "../lib/createNotification";
import { emitToWorkers, emitToService, emitToUser } from "../lib/socketio";
import { eq, and, count, or, isNotNull, isNull, desc, notInArray, inArray, gte, lt, sql } from "drizzle-orm";
import {
  launchActivePhase,
  transitionToPassive,
  clearServiceAlertTimers,
  clearArrivalAutoStartTimer,
  scheduleArrivalAutoStart,
  handleServiceTaken,
  handleServiceTerminal,
  queueDirectServiceAlert,
  refreshProMaxBudgetAlerts,
} from "../lib/service-motor";
import { alias } from "drizzle-orm/pg-core";
import { logger } from "../lib/logger";
import { isWorkerPayoutComplete, PROFILE_INCOMPLETE_MESSAGE } from "../lib/worker-eligibility";
import { finalizeCompletionSideEffects } from "../lib/complete-service";
import { removeAllChatAttachmentObjects, removeE2EChatAttachments } from "../lib/chat-attachments";
import { recordSecuritySelfie } from "../lib/security-selfies";
import { getLateCancellationAction, getSuspensionDurationHours } from "../lib/suspension-policy";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

import { authenticate, invalidateUserCache } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import {
  CreateServiceBody,
  GetServiceParams,
  UpdateServiceParams,
  UpdateServiceBody,
  AcceptServiceParams,
  CancelServiceParams,
  CompleteServiceParams,
  ListServicesQueryParams,
} from "../zod";

const router = Router();

const clientTable = alias(usersTable, "client");
const workerTable = alias(usersTable, "worker");

const userFields = (t: typeof usersTable) => ({
  id: t.id, name: t.name, email: t.email,
  role: t.role, status: t.status, phone: t.phone,
  avatarUrl: t.avatarUrl, rating: t.rating, totalReviews: t.totalReviews,
  clientRating: t.clientRating,
  isAvailable: t.isAvailable, lat: t.lat, lng: t.lng,
  visitFee: t.visitFee,
  createdAt: t.createdAt,
});

const userFieldsFull = (t: typeof usersTable) => ({
  id: t.id, name: t.name, email: t.email,
  role: t.role, status: t.status, phone: t.phone,
  avatarUrl: t.avatarUrl, bio: t.bio, skills: t.skills,
  rating: t.rating, totalReviews: t.totalReviews,
  clientRating: t.clientRating,
  isAvailable: t.isAvailable, lat: t.lat, lng: t.lng,
  visitFee: t.visitFee,
  createdAt: t.createdAt,
});

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

type ServiceViewer = { userId?: number; userRole?: string };

function redactWorkerAddress(service: any, viewer?: ServiceViewer) {
  if (
    viewer?.userRole === "worker" &&
    viewer.userId === service.workerId &&
    !service.workerSelfieUrl
  ) {
    return {
      ...service,
      address: null,
      originAddress: null,
      destinationAddress: null,
      lat: null,
      lng: null,
    };
  }
  return service;
}

async function getServiceWithRelations(id: number, viewer?: ServiceViewer) {
  const rows = await db.select({
    service: servicesTable,
    client: userFieldsFull(clientTable as unknown as typeof usersTable),
    worker: userFieldsFull(workerTable as unknown as typeof usersTable),
    category: categoriesTable,
    subcategory: subcategoriesTable,
  })
  .from(servicesTable)
  .innerJoin(clientTable, eq(servicesTable.clientId, clientTable.id))
  .leftJoin(workerTable, eq(servicesTable.workerId, workerTable.id))
  .leftJoin(categoriesTable, eq(servicesTable.categoryId, categoriesTable.id))
  .leftJoin(subcategoriesTable, eq(servicesTable.subcategoryId, subcategoriesTable.id))
  .where(eq(servicesTable.id, id))
  .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  const [existingReview] = await db.select({
    rating: reviewsTable.rating,
    reviewedByWorker: reviewsTable.reviewedByWorker,
  }).from(reviewsTable).where(eq(reviewsTable.serviceId, id)).limit(1);

  // El motivo de cancelación es PRIVADO (solo panel admin /admin/cancellations):
  // nunca se expone en los DTOs de servicios que ven los usuarios.
  const { cancellationReason: _reason, ...serviceSafe } = row.service as any;
  return {
    ...redactWorkerAddress(serviceSafe, viewer),
    client: row.client,
    worker: row.worker?.id ? row.worker : null,
    category: row.category,
    subcategory: row.subcategory ?? null,
    reviewedByClient: !!existingReview && existingReview.rating > 0,
    reviewedByWorker: !!existingReview?.reviewedByWorker,
  };
}

async function getServicesWithRelations(whereClause: any, limit: number, offset: number, viewer?: ServiceViewer) {
  const rows = await db.select({
    service: servicesTable,
    client: userFields(clientTable as unknown as typeof usersTable),
    worker: userFields(workerTable as unknown as typeof usersTable),
    category: categoriesTable,
    subcategory: subcategoriesTable,
  })
  .from(servicesTable)
  .innerJoin(clientTable, eq(servicesTable.clientId, clientTable.id))
  .leftJoin(workerTable, eq(servicesTable.workerId, workerTable.id))
  .leftJoin(categoriesTable, eq(servicesTable.categoryId, categoriesTable.id))
  .leftJoin(subcategoriesTable, eq(servicesTable.subcategoryId, subcategoriesTable.id))
  .where(whereClause)
  .limit(limit)
  .offset(offset)
  .orderBy(desc(servicesTable.createdAt));

  return rows.map(row => {
    // Motivo de cancelación privado: no exponer en el listado.
    const { cancellationReason: _reason, ...serviceSafe } = row.service as any;
    return {
      ...redactWorkerAddress(serviceSafe, viewer),
      client: row.client,
      worker: row.worker?.id ? row.worker : null,
      category: row.category,
      subcategory: row.subcategory ?? null,
    };
  });
}

router.get("/services", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const query = ListServicesQueryParams.safeParse(req.query);
  const status = query.success ? query.data.status : undefined;
  const clientId = query.success ? query.data.clientId : undefined;
  const workerId = query.success ? query.data.workerId : undefined;
  const page = query.success ? (query.data.page ?? 1) : 1;
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;
  const noCount = req.query.noCount === "true";

  const conditions = [];
  if (status) conditions.push(eq(servicesTable.status, status as "pending" | "alerting" | "open" | "accepted" | "in_progress" | "completed" | "cancelled"));
  if (clientId) conditions.push(eq(servicesTable.clientId, clientId));

  if (req.userRole === "client") {
    conditions.push(eq(servicesTable.clientId, req.userId!));
    if (workerId) conditions.push(eq(servicesTable.workerId, workerId));
  } else if (req.userRole === "worker") {
    if (workerId && workerId === req.userId) {
      // Subquery: servicios donde este worker tiene propuesta
      const myProposalServiceIds = db
        .select({ serviceId: proposalsTable.serviceId })
        .from(proposalsTable)
        .where(eq(proposalsTable.workerId, req.userId!));

      conditions.push(
        or(
          // Servicio asignado a este worker
          eq(servicesTable.workerId, req.userId!),
          // Servicios donde envió propuesta Y el cliente NO eligió a otro worker
          and(
            inArray(servicesTable.id, myProposalServiceIds),
            or(
              isNull(servicesTable.workerId),
              eq(servicesTable.workerId, req.userId!)
            )
          ),
          // Solicitud directa pendiente para este worker
          and(
            eq(servicesTable.status, "pending"),
            eq(servicesTable.isDirectRequest, true),
            eq(servicesTable.directWorkerId, req.userId!)
          )
        )!
      );
    } else if (!workerId && !clientId && !status) {
      conditions.push(
        or(
          eq(servicesTable.workerId, req.userId!),
          and(
            eq(servicesTable.status, "pending"),
            or(eq(servicesTable.isDirectRequest, false), isNull(servicesTable.isDirectRequest))
          ),
          and(
            eq(servicesTable.status, "pending"),
            eq(servicesTable.isDirectRequest, true),
            eq(servicesTable.directWorkerId, req.userId!)
          )
        )!
      );
    } else {
      if (workerId) conditions.push(eq(servicesTable.workerId, workerId));
      // Cuando el worker lista servicios "open" (pantalla de inicio),
      // excluir aquellos donde ya envió propuesta
      if (status === "open" && !workerId && req.userId) {
        const alreadyProposed = db
          .select({ serviceId: proposalsTable.serviceId })
          .from(proposalsTable)
          .where(eq(proposalsTable.workerId, req.userId));
        conditions.push(notInArray(servicesTable.id, alreadyProposed));
      }
    }
  } else {
    if (workerId) conditions.push(eq(servicesTable.workerId, workerId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [services, totalResult] = await Promise.all([
    getServicesWithRelations(whereClause, limit, offset, {
      userId: req.userId,
      userRole: req.userRole,
    }),
    noCount ? Promise.resolve([{ count: 0 }]) : db.select({ count: count() }).from(servicesTable).where(whereClause),
  ]);

  res.json({ services, total: totalResult[0]?.count ?? 0, page, limit });
});

router.post("/services", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const directWorkerId = parsed.data.directWorkerId ?? null;

  const [service] = await db.insert(servicesTable).values({
    title: parsed.data.title,
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    subcategoryId: parsed.data.subcategoryId ?? undefined,
    clientId: req.userId!,
    address: parsed.data.address ?? undefined,
    originAddress: parsed.data.originAddress ?? undefined,
    destinationAddress: parsed.data.destinationAddress ?? undefined,
    lat: parsed.data.lat ?? undefined,
    lng: parsed.data.lng ?? undefined,
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
    imageUrls: parsed.data.imageUrls ?? [],
    budgetNote: parsed.data.budgetNote ?? undefined,
    // Precio y cotización son excluyentes: si pide cotización no lleva presupuesto.
    requestQuote: parsed.data.requestQuote ?? false,
    isUrgent: parsed.data.isUrgent ?? false,
    clientSelfieUrl: parsed.data.clientSelfieUrl ?? undefined,
    clientSelfieTakenAt: parsed.data.clientSelfieUrl ? new Date() : undefined,
    // Cómo pagará el cliente (efectivo/transferencia). Obligatorio en la UI.
    paymentMethod: parsed.data.paymentMethod ?? undefined,
    isDirectRequest: directWorkerId ? true : false,
    directWorkerId: directWorkerId ?? undefined,
  }).returning();

  if (service && parsed.data.clientSelfieUrl) {
    await recordSecuritySelfie({
      userId: req.userId!,
      role: "client",
      serviceId: service.id,
      objectPath: parsed.data.clientSelfieUrl,
      purpose: "service",
      takenAt: service.clientSelfieTakenAt ?? new Date(),
    });
  }

  if (directWorkerId) {
    // La solicitud directa usa la misma reserva exclusiva que las públicas;
    // si el experto está negociando, queda en cola sin enviar una alerta paralela.
    queueDirectServiceAlert(service.id, directWorkerId).catch((error) =>
      logger.error({ err: error, serviceId: service.id, workerId: directWorkerId }, "queue direct service alert error")
    );
  } else {
    // Motor de Solicitudes: lanza fase activa (pantalla completa a 4-5 expertos cercanos)
    // launchActivePhase corre en background y no bloquea la respuesta al cliente
    launchActivePhase(service.id).catch(e => logger.error({ err: e, serviceId: service.id }, "launchActivePhase error on create"));
  }

  const full = await getServiceWithRelations(service.id);
  res.status(201).json(full);
});

router.get("/services/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = GetServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const service = await getServiceWithRelations(params.data.id, {
    userId: req.userId,
    userRole: req.userRole,
  });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json(service);
});

router.patch("/services/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Bug fix: verificar que el usuario sea dueño del servicio o admin antes de editar
  const [existingService] = await db.select({ clientId: servicesTable.clientId, workerId: servicesTable.workerId })
    .from(servicesTable).where(eq(servicesTable.id, params.data.id)).limit(1);

  if (!existingService) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const isOwner = existingService.clientId === req.userId || existingService.workerId === req.userId;
  if (!isOwner && req.userRole !== "admin") {
    res.status(403).json({ error: "No tienes permiso para editar este servicio" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.finalPrice !== undefined) updateData.finalPrice = parsed.data.finalPrice;
  if (parsed.data.workerId !== undefined) updateData.workerId = parsed.data.workerId;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.address !== undefined) updateData.address = parsed.data.address;
  if (parsed.data.originAddress !== undefined) updateData.originAddress = parsed.data.originAddress;
  if (parsed.data.destinationAddress !== undefined) updateData.destinationAddress = parsed.data.destinationAddress;
  if (parsed.data.imageUrls !== undefined) updateData.imageUrls = parsed.data.imageUrls;
  if (parsed.data.budgetNote !== undefined) updateData.budgetNote = parsed.data.budgetNote;

  const [updated] = await db.update(servicesTable).set(updateData).where(eq(servicesTable.id, params.data.id)).returning();

  if (!updated) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  if (parsed.data.budgetNote !== undefined) {
    await refreshProMaxBudgetAlerts(updated.id).catch((error) => {
      logger.warn({ err: error, serviceId: updated.id }, "Could not refresh active Pro Max budget alert");
    });
  }

  const full = await getServiceWithRelations(updated.id);
  res.json(full);
});

/* Eliminar servicio — solo el dueño, solo estados previos a aceptación */
router.delete("/services/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [svc] = await db.select({ clientId: servicesTable.clientId, status: servicesTable.status })
    .from(servicesTable).where(eq(servicesTable.id, id)).limit(1);

  if (!svc) { res.status(404).json({ error: "Servicio no encontrado" }); return; }
  if (svc.clientId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "No tienes permiso para eliminar este servicio" }); return;
  }
  const deletableStatuses = ["pending", "alerting", "open"];
  if (!deletableStatuses.includes(svc.status) && req.userRole !== "admin") {
    res.status(400).json({ error: "No se puede eliminar un servicio en este estado" }); return;
  }

  try {
    // Evita que una alerta ya programada vuelva a ejecutarse después del
    // borrado y mantiene las selfies como registros de auditoría, pero sin
    // una referencia a una publicación inexistente.
    clearServiceAlertTimers(id);
    await removeAllChatAttachmentObjects(id);
    await db.transaction(async (tx) => {
      await tx.update(securitySelfiesTable)
        .set({ serviceId: null, proposalId: null })
        .where(eq(securitySelfiesTable.serviceId, id));
      await tx.delete(cancellationChargesTable).where(eq(cancellationChargesTable.serviceId, id));
      await tx.delete(paymentsTable).where(eq(paymentsTable.serviceId, id));
      await tx.delete(reviewsTable).where(eq(reviewsTable.serviceId, id));
      await tx.delete(messagesTable).where(eq(messagesTable.serviceId, id));
      await tx.delete(proposalsTable).where(eq(proposalsTable.serviceId, id));
      await tx.delete(alertSessionsTable).where(eq(alertSessionsTable.serviceId, id));
      await tx.delete(servicesTable).where(eq(servicesTable.id, id));
    });
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error, serviceId: id }, "No se pudo eliminar el servicio");
    res.status(500).json({ error: "No se pudo eliminar la publicación. Inténtalo nuevamente." });
  }
});

/* Limpia budget_note después de que el cliente lo envió como mensaje cifrado */
router.post("/services/:id/clear-budget", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [svc] = await db.select({ clientId: servicesTable.clientId })
    .from(servicesTable).where(eq(servicesTable.id, id)).limit(1);

  if (!svc) { res.status(404).json({ error: "Not found" }); return; }
  if (svc.clientId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Sin permiso" }); return;
  }

  await db.update(servicesTable).set({ budgetNote: null }).where(eq(servicesTable.id, id));
  await refreshProMaxBudgetAlerts(id).catch((error) => {
    logger.warn({ err: error, serviceId: id }, "Could not refresh active Pro Max budget alert after clearing budget");
  });
  res.json({ ok: true });
});

router.post("/services/:id/accept", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = AcceptServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (req.userRole !== "worker" && req.userRole !== "admin") {
    res.status(403).json({ error: "Only workers can accept services" });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.id)).limit(1);
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  // Sistema de cancelación tardía: el experto debe tener tarifa de visita
  // técnica y datos de transferencia completos para tomar trabajos.
  if (req.userRole === "worker" && !(await isWorkerPayoutComplete(req.userId!))) {
    res.status(403).json({
      error: PROFILE_INCOMPLETE_MESSAGE,
      code: "PROFILE_INCOMPLETE_VISIT_FEE",
    });
    return;
  }

  // Bug fix: el UPDATE incluye WHERE status='pending' para ser atómico y evitar
  // race condition donde dos trabajadores aceptan el mismo servicio simultáneamente
  const [updated] = await db.update(servicesTable).set({
    status: "accepted",
    workerId: req.userId,
    // Ventana de cancelación gratis: 10 minutos desde la asignación.
    freeCancelUntil: new Date(Date.now() + 10 * 60 * 1000),
  }).where(and(eq(servicesTable.id, params.data.id), eq(servicesTable.status, "pending"))).returning();

  if (!updated) {
    res.status(400).json({ error: "El servicio ya no está disponible" });
    return;
  }

  await handleServiceTaken(params.data.id, req.userId!);

  await createNotification({
    userId: service.clientId,
    title: "Servicio aceptado",
    message: `Un trabajador aceptó tu solicitud: ${service.title}`,
    type: "service_accepted",
    relatedId: service.id,
    targetRole: "client",
  });

  const full = await getServiceWithRelations(updated.id);

  const [clientUser] = await db.select().from(usersTable).where(eq(usersTable.id, service.clientId)).limit(1);
  const [workerUserAcc] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  emitToService(params.data.id, "service_updated", { serviceId: params.data.id, status: "accepted" });
  emitToUser(service.clientId, "service_updated", { serviceId: params.data.id, status: "accepted" });
  emitToUser(req.userId!, "service_updated", { serviceId: params.data.id, status: "accepted" });
  res.json(full);
});

router.post("/services/:id/start", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) {
    res.status(404).json({ error: "Servicio no encontrado" });
    return;
  }

  if (req.userRole !== "worker" || service.workerId !== req.userId) {
    res.status(403).json({ error: "Solo el profesional asignado puede iniciar el trabajo" });
    return;
  }

  if (service.status === "completed" || service.status === "cancelled") {
    res.status(400).json({ error: "Este trabajo ya está cerrado" });
    return;
  }
  if (service.workStartedAt) {
    clearArrivalAutoStartTimer(id);
    res.json(await getServiceWithRelations(id));
    return;
  }
  if (service.status !== "accepted" && service.status !== "in_progress") {
    res.status(400).json({ error: "El servicio todavía no está activo" });
    return;
  }
  if (!service.workerArrivedAt) {
    res.status(400).json({ error: "Primero registra tu llegada al domicilio" });
    return;
  }

  const startedAt = new Date();
  const [updated] = await db.update(servicesTable).set({
    status: "in_progress",
    workStartedAt: startedAt,
  }).where(and(
    eq(servicesTable.id, id),
    eq(servicesTable.status, service.status),
    eq(servicesTable.workerId, req.userId!),
    isNull(servicesTable.workStartedAt),
  )).returning();

  if (!updated) {
    const [current] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
    if (current && current.status !== "completed" && current.status !== "cancelled" && current.workStartedAt) {
      clearArrivalAutoStartTimer(id);
      res.json(await getServiceWithRelations(id));
      return;
    }
    res.status(409).json({ error: "El trabajo cambió de estado; actualiza la pantalla" });
    return;
  }

  clearArrivalAutoStartTimer(id);
  await createNotification({
    userId: service.clientId,
    title: "Trabajo iniciado",
    message: `El profesional ha comenzado a trabajar en "${service.title}"`,
    type: "service_accepted",
    relatedId: service.id,
    targetRole: "client",
  });

  const full = await getServiceWithRelations(updated.id);

  const updatePayload = {
    serviceId: id,
    status: "in_progress",
    workerArrivedAt: updated.workerArrivedAt,
    workStartedAt: updated.workStartedAt,
  };
  emitToService(id, "service_updated", updatePayload);
  emitToUser(service.clientId, "service_updated", updatePayload);
  if (service.workerId) emitToUser(service.workerId, "service_updated", updatePayload);
  res.json(full);
});

router.post("/services/:id/arrive", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) {
    res.status(404).json({ error: "Servicio no encontrado" });
    return;
  }
  if (req.userRole !== "worker" || service.workerId !== req.userId) {
    res.status(403).json({ error: "Solo el experto asignado puede registrar su llegada" });
    return;
  }

  if (service.status === "completed" || service.status === "cancelled") {
    res.status(400).json({ error: "Este trabajo ya está cerrado" });
    return;
  }
  if (service.workerArrivedAt) {
    res.json(await getServiceWithRelations(id));
    return;
  }
  if (service.status !== "accepted" && service.status !== "in_progress") {
    res.status(400).json({ error: "El experto puede registrar su llegada cuando el trabajo está aceptado" });
    return;
  }

  const arrivedAt = new Date();
  const [updated] = await db.update(servicesTable)
    .set({ workerArrivedAt: arrivedAt })
    .where(and(
      eq(servicesTable.id, id),
      inArray(servicesTable.status, ["accepted", "in_progress"]),
      eq(servicesTable.workerId, req.userId!),
      isNull(servicesTable.workerArrivedAt),
    ))
    .returning();

  if (!updated) {
    const [current] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
    if (current?.workerArrivedAt) {
      res.json(await getServiceWithRelations(id));
      return;
    }
    res.status(409).json({ error: "El trabajo cambió de estado; actualiza la pantalla" });
    return;
  }

  if (updated.workerArrivedAt) scheduleArrivalAutoStart(id, updated.workerArrivedAt);
  await createNotification({
    userId: service.clientId,
    title: "¡Tu experto llegó!",
    message: "El experto ya está en tu domicilio esperando que le abras la puerta.",
    type: "worker_arrived",
    relatedId: service.id,
    targetRole: "client",
    highPriority: true,
  });

  const updatePayload = { serviceId: id, status: updated.status, workerArrivedAt: updated.workerArrivedAt };
  emitToService(id, "service_updated", updatePayload);
  emitToUser(service.clientId, "service_updated", updatePayload);
  emitToUser(req.userId!, "service_updated", updatePayload);
  res.json(await getServiceWithRelations(id));
});

router.post("/services/:id/reject-direct", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  if (service.directWorkerId !== req.userId) {
    res.status(403).json({ error: "No tienes permiso para rechazar esta solicitud" }); return;
  }
  if (!service.isDirectRequest || service.status !== "pending") {
    res.status(400).json({ error: "Esta solicitud no puede ser rechazada" }); return;
  }

  await createNotification({
    userId: service.clientId,
    title: "Tu técnico no está disponible",
    message: `Tu técnico de confianza no puede atenderte en este momento para: "${service.title}"`,
    type: "direct_rejected" as const,
    relatedId: service.id,
    targetRole: "client",
  });

  await handleServiceTerminal(id, service.directWorkerId);
  emitToUser(service.clientId, "service_updated", { serviceId: id, status: "direct_rejected" });
  res.json({ ok: true });
});

router.post("/services/:id/convert-to-public", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  if (service.clientId !== req.userId) {
    res.status(403).json({ error: "Solo el cliente puede convertir la solicitud" }); return;
  }
  if (!service.isDirectRequest) {
    res.status(400).json({ error: "Esta solicitud ya es pública" }); return;
  }

  await db.update(servicesTable).set({
    isDirectRequest: false,
    directWorkerId: null,
    status: "pending",
  }).where(eq(servicesTable.id, id));

  await handleServiceTerminal(id, service.directWorkerId);

  // Motor de Solicitudes: lanza fase activa para esta solicitud convertida a pública
  launchActivePhase(id).catch(e => logger.error({ err: e, serviceId: id }, "launchActivePhase error on convert-to-public"));

  res.json({ ok: true });
});

router.post("/services/:id/cancel", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = CancelServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.id)).limit(1);
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const isParticipant = service.clientId === req.userId || service.workerId === req.userId;
  if (!isParticipant && req.userRole !== "admin") {
    res.status(403).json({ error: "Solo el cliente, profesional o administrador puede cancelar el servicio" });
    return;
  }

  if (service.status === "completed") {
    res.status(400).json({ error: "No se puede cancelar un servicio ya completado" });
    return;
  }

  // Idempotencia: si ya está cancelado, devolver el estado actual sin insertar
  // otro mensaje system "⛔ ..." duplicado ni re-emitir eventos.
  if (service.status === "cancelled") {
    const full = await getServiceWithRelations(service.id);
    res.json(full);
    return;
  }

  // Motivo de cancelación declarado (obligatorio en la UI del experto).
  const cancelReason = typeof (req.body as any)?.reason === "string"
    ? String((req.body as any).reason).trim().slice(0, 500) || null
    : null;

  // Update CONDICIONAL (status != cancelled/completed): si dos cancelaciones
  // llegan a la vez, solo UNA gana y ejecuta los efectos (cargo, mensaje
  // system, notificaciones); la otra recibe el estado actual sin duplicar nada.
  const [updated] = await db.update(servicesTable).set({
    status: "cancelled",
    cancelledBy: req.userId!,
    cancellationReason: cancelReason,
    cancelledAt: new Date(),
  })
    .where(and(
      eq(servicesTable.id, params.data.id),
      notInArray(servicesTable.status, ["cancelled", "completed"]),
    )).returning();
  if (!updated) {
    const full = await getServiceWithRelations(service.id);
    res.json(full);
    return;
  }

  await handleServiceTerminal(params.data.id, service.workerId);

  // La conversación queda cerrada desde este momento. La copia E2E se borra
  // de forma idempotente; soporte conserva su copia por siete días.
  await removeE2EChatAttachments(params.data.id);

  // Cancelación TARDÍA del cliente: si ya venció la ventana de cancelación
  // gratis (10 min desde que confirmó al experto), se registra un cargo por la
  // visita técnica del experto. IMPORTANTE (legal): Fixgo NO cobra ni procesa
  // este pago — solo muestra los datos de transferencia del experto y guarda
  // el comprobante que sube el cliente como imagen.
  let lateCharge: {
    amount: number;
    holderName: string;
    bankName: string;
    bankAccountType: string;
    bankAccountNumber: string;
    bankRut: string;
    deadlineAt: Date;
  } | null = null;
  const isLateClientCancel =
    req.userId === service.clientId &&
    !!service.workerId &&
    !!service.freeCancelUntil &&
    Date.now() > new Date(service.freeCancelUntil).getTime();

  if (isLateClientCancel && service.workerId) {
    const [workerUser] = await db.select({
      name: usersTable.name,
      visitFee: usersTable.visitFee,
      payoutBankName: usersTable.payoutBankName,
      payoutBankAccountType: usersTable.payoutBankAccountType,
      payoutBankAccountNumber: usersTable.payoutBankAccountNumber,
      payoutBankRut: usersTable.payoutBankRut,
    }).from(usersTable).where(eq(usersTable.id, service.workerId)).limit(1);
    const bankName = workerUser?.payoutBankName;
    const bankAccountType = workerUser?.payoutBankAccountType;
    const bankAccountNumber = workerUser?.payoutBankAccountNumber;
    const bankRut = workerUser?.payoutBankRut;

    // Solo crear el cargo si el snapshot bancario está completo — un cargo sin
    // datos de transferencia sería impagable para el cliente.
    if (
      workerUser?.visitFee && workerUser.visitFee > 0 &&
      bankName && bankAccountType && bankAccountNumber && bankRut
    ) {
      const [charge] = await db.insert(cancellationChargesTable).values({
        serviceId: params.data.id,
        clientId: service.clientId,
        workerId: service.workerId,
        amount: workerUser.visitFee,
        holderName: workerUser.name,
        bankName,
        bankAccountType,
        bankAccountNumber,
        bankRut,
        deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).onConflictDoNothing({ target: cancellationChargesTable.serviceId }).returning();

      if (charge) {
        lateCharge = {
          amount: charge.amount,
          holderName: charge.holderName,
          // Estos campos se validan como completos antes del INSERT. Drizzle
          // los expone como nullable porque la tabla conserva compatibilidad
          // con snapshots históricos.
          bankName: charge.bankName!,
          bankAccountType: charge.bankAccountType!,
          bankAccountNumber: charge.bankAccountNumber!,
          bankRut: charge.bankRut!,
          deadlineAt: charge.deadlineAt,
        };
        const amountFmt = charge.amount.toLocaleString("es-CL");
        await createNotification({
          userId: service.clientId,
          title: "Cancelación con cargo de visita técnica",
          message: `Cancelaste después del tiempo permitido. Debes transferir $${amountFmt} al experto dentro de 24 horas. Revisa los datos en Mis Trabajos.`,
          type: "cancellation_charge",
          relatedId: service.id,
          targetRole: "client",
          highPriority: true,
        });
        await createNotification({
          userId: service.workerId,
          title: "Te corresponde tu visita técnica 💰",
          message: `El cliente canceló "${service.title}" fuera del tiempo permitido. Le enviamos tus datos para que te transfiera $${amountFmt}.`,
          type: "cancellation_charge",
          relatedId: service.id,
          targetRole: "worker",
          highPriority: true,
        });
        emitToUser(service.clientId, "cancellation_charge", { serviceId: params.data.id, action: "created" });
        emitToUser(service.workerId, "cancellation_charge", { serviceId: params.data.id, action: "created" });
      }
    }
  }

  // Sanciones automáticas por cancelaciones TARDÍAS del EXPERTO sobre trabajos
  // ya aceptados. Dentro de los primeros 10 minutos no hay penalización.
  const isWorkerCancel = req.userId === service.workerId && !!service.workerId &&
    ["accepted", "in_progress"].includes(service.status) &&
    !!service.freeCancelUntil &&
    Date.now() > new Date(service.freeCancelUntil).getTime();
  if (isWorkerCancel) {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // Transacción con lock de la fila del usuario (FOR UPDATE): cancelaciones
      // concurrentes del mismo experto se serializan aquí, así el conteo y la
      // escalada de nivel son consistentes (sin sanciones duplicadas ni niveles
      // saltados).
      const sanction = await db.transaction(async (tx) => {
        const [me] = await tx.select({ suspensionCount: usersTable.suspensionCount })
          .from(usersTable).where(eq(usersTable.id, req.userId!)).for("update").limit(1);
        if (!me) return null;

        const [{ value: monthCancels }] = await tx.select({ value: count() })
          .from(servicesTable)
          .where(and(
            eq(servicesTable.cancelledBy, req.userId!),
            eq(servicesTable.workerId, req.userId!),
            eq(servicesTable.status, "cancelled"),
            isNotNull(servicesTable.cancelledAt),
            gte(servicesTable.cancelledAt, monthStart),
            isNotNull(servicesTable.freeCancelUntil),
            sql`${servicesTable.cancelledAt} > ${servicesTable.freeCancelUntil}`,
          ));

        const [{ value: previousMonthCancels }] = await tx.select({ value: count() })
          .from(servicesTable)
          .where(and(
            eq(servicesTable.cancelledBy, req.userId!),
            eq(servicesTable.workerId, req.userId!),
            eq(servicesTable.status, "cancelled"),
            isNotNull(servicesTable.cancelledAt),
            lt(servicesTable.cancelledAt, monthStart),
            isNotNull(servicesTable.freeCancelUntil),
            sql`${servicesTable.cancelledAt} > ${servicesTable.freeCancelUntil}`,
          ));

        // Las dos primeras cancelaciones tardías solo advierten. La tercera
        // activa la suspensión temporal de 24 horas.
        const level = (me.suspensionCount ?? 0) + 1;
        const action = getLateCancellationAction(monthCancels);
        const hours = getSuspensionDurationHours({
          suspensionCount: me.suspensionCount,
          currentMonthCancellations: monthCancels,
          previousMonthCancellations: previousMonthCancels,
        });
        const untilDate = hours > 0
          ? new Date(Date.now() + hours * 60 * 60 * 1000)
          : null;
        const userUpdate: {
          suspensionCount: number;
          suspendedUntil?: Date;
          isAvailable?: boolean;
        } = {
          suspensionCount: level,
        };
        if (action === "suspension" && untilDate) {
          userUpdate.suspendedUntil = untilDate;
          userUpdate.isAvailable = false;
        }
        await tx.update(usersTable).set(userUpdate).where(eq(usersTable.id, req.userId!));
        return { monthCancels, level, hours, untilDate, action };
      });

      if (sanction) {
        const { monthCancels, level, hours, untilDate, action } = sanction;
        if (action === "suspension") {
          // La autenticación cachea el estado del usuario durante 60 s. Invalidar
          // aquí evita que una petición posterior pase con el estado anterior.
          invalidateUserCache(req.userId!);
          const durText = hours === 24
            ? "24 horas"
            : hours === 7 * 24
            ? "7 días"
            : "30 días";
          await createNotification({
            userId: req.userId!,
            title: "Cuenta suspendida temporalmente",
            message: `Llegaste a la cancelación tardía número ${monthCancels} del mes. Tu cuenta de experto queda suspendida por ${durText}: no recibirás alertas ni podrás enviar propuestas.`,
            type: "account_suspension",
            relatedId: service.id,
            targetRole: "worker",
            highPriority: true,
          });
          emitToUser(req.userId!, "account_suspension", { suspendedUntil: untilDate!.toISOString(), level });
          logger.warn({ workerId: req.userId, monthCancels, level, hours, until: untilDate!.toISOString() }, "Suspensión automática por cancelación tardía escalonada");
        } else {
          const warningNumber = monthCancels;
          const remaining = Math.max(0, 3 - warningNumber);
          await createNotification({
            userId: req.userId!,
            title: `Advertencia ${warningNumber} de 2 por cancelación tardía`,
            message: remaining === 1
              ? "Esta es tu segunda cancelación tardía del mes. Una nueva cancelación fuera de los 10 minutos suspenderá tu cuenta por 24 horas."
              : "Esta es tu primera cancelación tardía del mes. Una segunda genera otra advertencia; la tercera suspende tu cuenta por 24 horas.",
            type: "account_warning",
            relatedId: service.id,
            targetRole: "worker",
            highPriority: true,
          });
          emitToUser(req.userId!, "account_warning", { count: warningNumber, remaining });
          logger.warn({ workerId: req.userId, monthCancels, level }, "Advertencia por cancelación tardía");
        }
      }
    } catch (err) {
      logger.error({ err }, "Error aplicando sanción por cancelación del experto");
    }
  }

  // Aviso PERSISTENTE en la pantalla de inicio de la OTRA parte: si el chat
  // desapareció (cancelación), el usuario igual se entera al volver a la app.
  // La tarjeta queda fija en el inicio hasta que la cierre con la "X".
  if (service.workerId && ["accepted", "in_progress"].includes(service.status)) {
    try {
      if (req.userId === service.clientId) {
        await createNotification({
          userId: service.workerId,
          title: "Servicio cancelado",
          message: `"${service.title}" — El cliente canceló el servicio. Este trabajo ya no está disponible.`,
          type: "service_cancelled",
          relatedId: service.id,
          targetRole: "worker",
          highPriority: true,
        });
      } else if (req.userId === service.workerId) {
        await createNotification({
          userId: service.clientId,
          title: "Servicio cancelado",
          message: `"${service.title}" — El experto canceló el servicio. Revisa Mis Trabajos para elegir otro experto.`,
          type: "service_cancelled",
          relatedId: service.id,
          targetRole: "client",
          highPriority: true,
        });
      }
    } catch (err) {
      logger.error({ err }, "Error creando notificación de cancelación");
    }
  }

  // Aviso PERSISTENTE en el chat del hilo asignado: sin esto, el experto que
  // está dentro del chat no se entera de la cancelación (y el aviso sobrevive
  // al salir y volver a entrar, a diferencia del socket event).
  if (service.workerId) {
    if (lateCharge && req.userId === service.clientId) {
      // Igual que la tarjeta de transferencia, el mensaje solo contiene un
      // marcador. El cliente obtiene los datos desde el endpoint protegido.
      const chargeCard = "__CANCELLATION_CHARGE_CARD__";
      const [chargeMsg] = await db.insert(messagesTable).values({
        serviceId: params.data.id,
        senderId: req.userId!,
        workerId: service.workerId,
        content: chargeCard,
        messageType: "cancellation_charge_card",
      }).returning();
      emitToService(params.data.id, "new_message", chargeMsg);
      emitToUser(service.clientId, "new_message", chargeMsg);
      emitToUser(service.workerId, "new_message", chargeMsg);
    }

    const canceledBy = req.userId === service.clientId ? "El cliente" : req.userId === service.workerId ? "El experto" : "Un administrador";
    const chargeNote = lateCharge
      ? ` Por cancelar fuera del tiempo permitido, corresponde el pago de la visita técnica ($${lateCharge.amount.toLocaleString("es-CL")}).`
      : "";
    // El MOTIVO de la cancelación es PRIVADO: solo lo ve el admin en su panel
    // (/admin/cancellations). Al otro usuario solo se le informa que fue cancelado.
    const [sysMsg] = await db.insert(messagesTable).values({
      serviceId: params.data.id,
      senderId: req.userId!,
      workerId: service.workerId,
      content: `⛔ ${canceledBy} canceló este servicio. La conversación quedó cerrada.${chargeNote}`,
      messageType: "system",
    }).returning();
    emitToService(params.data.id, "new_message", sysMsg);
    emitToUser(service.clientId, "new_message", sysMsg);
    emitToUser(service.workerId, "new_message", sysMsg);
  }

  const full = await getServiceWithRelations(updated.id);
  emitToService(params.data.id, "service_updated", { serviceId: params.data.id, status: "cancelled" });
  emitToUser(service.clientId, "service_updated", { serviceId: params.data.id, status: "cancelled" });
  if (service.workerId) emitToUser(service.workerId, "service_updated", { serviceId: params.data.id, status: "cancelled" });
  res.json(full);
});

router.post("/services/:id/requote", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const { message } = req.body as { message?: string };

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  if (service.workerId !== req.userId) {
    res.status(403).json({ error: "Solo el profesional asignado puede solicitar re-cotización" });
    return;
  }

  if (service.status !== "in_progress") {
    res.status(400).json({ error: "Solo se puede re-cotizar un servicio en progreso" });
    return;
  }

  const [updated] = await db.update(servicesTable).set({
    requoteStatus: "pending",
    requoteMessage: message ?? null,
  }).where(eq(servicesTable.id, id)).returning();

  await createNotification({
    userId: service.clientId,
    title: "⚠️ El profesional solicita re-cotización",
    message: `El profesional del servicio "${service.title}" solicita un ajuste. Abre el chat para ver los detalles.`,
    type: "service_request" as const,
    relatedId: service.id,
    targetRole: "client",
  });


  const full = await getServiceWithRelations(updated.id);
  res.json(full);
});

router.post("/services/:id/requote/accept", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  if (service.clientId !== req.userId) {
    res.status(403).json({ error: "Solo el cliente puede aceptar la re-cotización" });
    return;
  }

  if (service.requoteStatus !== "pending") {
    res.status(400).json({ error: "No hay re-cotización pendiente" });
    return;
  }

  const [updated] = await db.update(servicesTable).set({
    requoteStatus: "accepted",
  }).where(eq(servicesTable.id, id)).returning();

  await createNotification({
    userId: service.workerId!,
    title: "✅ Re-cotización aceptada",
    message: `El cliente aceptó el ajuste solicitado. Puedes continuar con el servicio.`,
    type: "service_accepted" as const,
    relatedId: service.id,
    targetRole: "worker",
  });

  const full = await getServiceWithRelations(updated.id);
  res.json(full);
});

router.post("/services/:id/requote/reject", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  if (service.clientId !== req.userId) {
    res.status(403).json({ error: "Solo el cliente puede rechazar la re-cotización" });
    return;
  }

  if (service.requoteStatus !== "pending") {
    res.status(400).json({ error: "No hay re-cotización pendiente" });
    return;
  }

  const VISIT_FEE = 13000;

  const [updated] = await db.update(servicesTable).set({
    requoteStatus: "rejected_visit",
    finalPrice: VISIT_FEE,
  }).where(eq(servicesTable.id, id)).returning();

  await createNotification({
    userId: service.workerId!,
    title: "❌ Re-cotización rechazada",
    message: `El cliente rechazó el nuevo precio. Se cobrará $${VISIT_FEE.toLocaleString("es-CL")} de domicilio.`,
    type: "service_accepted" as const,
    relatedId: service.id,
    targetRole: "worker",
  });

  const full = await getServiceWithRelations(updated.id);
  res.json(full);
});

router.post("/services/:id/complete", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = CompleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.id)).limit(1);
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  // Authz: solo el cliente dueño o un admin pueden marcar el servicio como completado
  if (service.clientId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Solo el cliente del servicio puede confirmar la finalización" });
    return;
  }

  // Idempotencia: si ya está completado, devolver el estado actual sin re-ejecutar pagos/comisiones
  if (service.status === "completed") {
    const full = await getServiceWithRelations(service.id);
    res.json(full);
    return;
  }

  if (service.status !== "in_progress") {
    res.status(400).json({ error: "El servicio debe estar en progreso para poder completarse" });
    return;
  }

  // Doble confirmación: si el EXPERTO aún no marcó "Trabajo realizado" y hay
  // un experto asignado, el cliente solo deja constancia (client_completed_at)
  // y se le avisa al experto para que confirme. Si no confirma en 24 horas,
  // el sistema completa automáticamente.
  if (service.workerId && !service.workerCompletedAt) {
    if (service.clientCompletedAt) {
      // Ya marcado por el cliente: idempotente.
      const full = await getServiceWithRelations(service.id);
      res.json(full);
      return;
    }
    const [marked] = await db.update(servicesTable).set({
      clientCompletedAt: new Date(),
    }).where(and(
      eq(servicesTable.id, params.data.id),
      eq(servicesTable.status, "in_progress"),
      isNull(servicesTable.clientCompletedAt),
    )).returning();

    if (!marked) {
      const full = await getServiceWithRelations(service.id);
      res.json(full);
      return;
    }

    await createNotification({
      userId: service.workerId,
      title: "El cliente marcó el trabajo como completado",
      message: `Confirma que "${service.title}" quedó listo. Si no respondes en 24 horas, se completará automáticamente.`,
      type: "work_done_confirm",
      relatedId: service.id,
      targetRole: "worker",
      highPriority: true,
    });

    const [sysMsg] = await db.insert(messagesTable).values({
      serviceId: service.id,
      senderId: service.clientId,
      workerId: service.workerId,
      content: "✅ El cliente marcó el trabajo como completado. Experto: confirma la finalización en Mis Trabajos. Si no respondes en 24 horas, el trabajo se completará automáticamente.",
      messageType: "system",
    }).returning();
    const sysFullMsg = { ...sysMsg, sender: null };
    emitToService(service.id, "new_message", sysFullMsg);
    emitToUser(service.clientId, "new_message", sysFullMsg);
    emitToUser(service.workerId, "new_message", sysFullMsg);

    const full = await getServiceWithRelations(marked.id);
    emitToService(params.data.id, "service_updated", { serviceId: params.data.id, status: "in_progress", clientCompletedAt: marked.clientCompletedAt });
    emitToUser(service.clientId, "service_updated", { serviceId: params.data.id, status: "in_progress", clientCompletedAt: marked.clientCompletedAt });
    emitToUser(service.workerId, "service_updated", { serviceId: params.data.id, status: "in_progress", clientCompletedAt: marked.clientCompletedAt });
    res.json(full);
    return;
  }

  // El experto ya marcó (o no hay experto asignado): esta confirmación CIERRA
  // el trabajo. Transición atómica (single-writer): el WHERE condicionado a
  // in_progress garantiza que solo UNA request gane la transición.
  const [updated] = await db.update(servicesTable).set({
    status: "completed",
    completedAt: new Date(),
  }).where(and(eq(servicesTable.id, params.data.id), eq(servicesTable.status, "in_progress"))).returning();

  if (!updated) {
    // Otra request completó (o canceló) el servicio entre la lectura y el update
    const [current] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.id)).limit(1);
    if (current?.status === "completed") {
      const full = await getServiceWithRelations(current.id);
      res.json(full);
      return;
    }
    res.status(400).json({ error: "El servicio debe estar en progreso para poder completarse" });
    return;
  }

  // Side effects compartidos: notificaciones, mensaje de sistema y, si el pago
  // es por TRANSFERENCIA, inyección automática de los datos bancarios oficiales
  // del experto en el chat. Modelo SaaS: Fixgo NO procesa el pago.
  await finalizeCompletionSideEffects(updated, "El cliente confirmó que el trabajo quedó completado.");
  await handleServiceTerminal(updated.id, updated.workerId);

  const full = await getServiceWithRelations(updated.id);
  res.json(full);
});

// El EXPERTO marca "Trabajo realizado": notifica al cliente para que confirme.
// Si el cliente no confirma en 24 horas, el sistema completa automáticamente
// (auto-complete en el loop del motor). Así el trabajo nunca queda colgado.
router.post("/services/:id/worker-complete", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id as string);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Service not found" }); return; }

  if (service.workerId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Solo el experto asignado puede marcar el trabajo como realizado" });
    return;
  }

  // Idempotencia: ya marcado o ya completado → devolver estado actual.
  if (service.status === "completed" || service.workerCompletedAt) {
    const full = await getServiceWithRelations(service.id);
    res.json(full);
    return;
  }

  if (service.status !== "in_progress") {
    res.status(400).json({ error: "El servicio debe estar en progreso para marcarlo como realizado" });
    return;
  }

  // Doble confirmación: si el CLIENTE ya había marcado el trabajo como
  // completado, la marca del experto CIERRA el trabajo de inmediato.
  if (service.clientCompletedAt) {
    const [completed] = await db.update(servicesTable).set({
      status: "completed",
      completedAt: new Date(),
      workerCompletedAt: new Date(),
    }).where(and(eq(servicesTable.id, id), eq(servicesTable.status, "in_progress"))).returning();

    if (completed) {
      await finalizeCompletionSideEffects(completed, "El experto confirmó que el trabajo quedó completado.");
      await handleServiceTerminal(completed.id, completed.workerId);
    }
    const full = await getServiceWithRelations(service.id);
    res.json(full);
    return;
  }

  // Update condicional: solo UNA request gana (evita side effects duplicados).
  const [updated] = await db.update(servicesTable).set({
    workerCompletedAt: new Date(),
  }).where(and(
    eq(servicesTable.id, id),
    eq(servicesTable.status, "in_progress"),
    isNull(servicesTable.workerCompletedAt),
  )).returning();

  if (!updated) {
    const full = await getServiceWithRelations(service.id);
    res.json(full);
    return;
  }

  await createNotification({
    userId: service.clientId,
    title: "El experto marcó el trabajo como realizado",
    message: `Confirma que "${service.title}" quedó listo. Si no respondes en 24 horas, se completará automáticamente.`,
    type: "work_done_confirm",
    relatedId: service.id,
    targetRole: "client",
    highPriority: true,
  });

  if (service.workerId) {
    const [sysMsg] = await db.insert(messagesTable).values({
      serviceId: service.id,
      senderId: service.workerId,
      workerId: service.workerId,
      content: "🔧 El experto marcó el trabajo como realizado. Cliente: confirma la finalización en Mis Trabajos. Si no respondes en 24 horas, el trabajo se completará automáticamente.",
      messageType: "system",
    }).returning();
    const sysFullMsg = { ...sysMsg, sender: null };
    emitToService(service.id, "new_message", sysFullMsg);
    emitToUser(service.clientId, "new_message", sysFullMsg);
    emitToUser(service.workerId, "new_message", sysFullMsg);
  }

  const full = await getServiceWithRelations(updated.id);
  emitToService(id, "service_updated", { serviceId: id, status: "in_progress", workerCompletedAt: updated.workerCompletedAt });
  emitToUser(service.clientId, "service_updated", { serviceId: id, status: "in_progress", workerCompletedAt: updated.workerCompletedAt });
  if (service.workerId) emitToUser(service.workerId, "service_updated", { serviceId: id, status: "in_progress", workerCompletedAt: updated.workerCompletedAt });
  res.json(full);
});

// Datos oficiales de transferencia del experto para un servicio COMPLETADO con
// pago por transferencia. Solo el cliente dueño (o admin) puede verlos.
// IMPORTANTE (legal): Fixgo NO procesa el pago — solo muestra los datos.
router.get("/services/:id/transfer-info", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id as string);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service) { res.status(404).json({ error: "Service not found" }); return; }

  if (service.clientId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Sin permiso" });
    return;
  }
  if (service.status !== "completed" || service.paymentMethod !== "transfer" || !service.workerId) {
    res.status(400).json({ error: "Este servicio no tiene pago por transferencia pendiente" });
    return;
  }

  const [worker] = await db.select({
    name: usersTable.name,
    payoutBankName: usersTable.payoutBankName,
    payoutBankAccountType: usersTable.payoutBankAccountType,
    payoutBankAccountNumber: usersTable.payoutBankAccountNumber,
    payoutBankRut: usersTable.payoutBankRut,
  }).from(usersTable).where(eq(usersTable.id, service.workerId)).limit(1);

  if (!worker?.payoutBankName || !worker.payoutBankAccountType || !worker.payoutBankAccountNumber || !worker.payoutBankRut) {
    res.status(404).json({ error: "El experto no tiene datos bancarios completos" });
    return;
  }

  res.json({
    holderName: worker.name,
    bankName: worker.payoutBankName,
    bankAccountType: worker.payoutBankAccountType,
    bankAccountNumber: worker.payoutBankAccountNumber,
    bankRut: worker.payoutBankRut,
  });
});

// Servicios en fase abierta (status=open) disponibles para el experto autenticado.
// Fase 2 del motor: NO filtra por distancia. El motor ya emitió service:available
// solo a los workers de la categoría correcta; aquí devolvemos todos los "open"
// de la categoría del worker, ordenados de más cercano a más lejano (referencia).
router.get("/services/available", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo expertos pueden ver servicios disponibles" });
    return;
  }

  const worker = await db.select({
    id: usersTable.id,
    lat: usersTable.lat,
    lng: usersTable.lng,
    suspendedUntil: usersTable.suspendedUntil,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1).then(r => r[0]);

  if (!worker) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  // Experto suspendido (sanción por cancelaciones): no ve la bandeja de disponibles.
  if (worker.suspendedUntil && new Date(worker.suspendedUntil).getTime() > Date.now()) {
    res.json([]);
    return;
  }

  // Categorías que maneja este experto
  const workerCats = await db.select({ categoryId: workerCategoriesTable.categoryId })
    .from(workerCategoriesTable)
    .where(eq(workerCategoriesTable.workerId, worker.id));
  const catIds = workerCats.map(c => c.categoryId);

  // Servicios en status=open de la categoría del worker (sin filtro de distancia)
  const openServices = await db.select({
    id: servicesTable.id,
    title: servicesTable.title,
    description: servicesTable.description,
    status: servicesTable.status,
    categoryId: servicesTable.categoryId,
    lat: servicesTable.lat,
    lng: servicesTable.lng,
    createdAt: servicesTable.createdAt,
  }).from(servicesTable).where(eq(servicesTable.status, "open"));

  const filtered = openServices
    .filter(svc => {
      if (catIds.length > 0 && svc.categoryId && !catIds.includes(svc.categoryId)) return false;
      return true;
    })
    .map(svc => ({
      ...svc,
      distanceKm: (worker.lat && worker.lng && svc.lat && svc.lng)
        ? Math.round(haversineKm(worker.lat, worker.lng, svc.lat, svc.lng) * 10) / 10
        : null,
    }))
    .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));

  res.json(filtered);
});

// ── Reintentar: relanza la Fase 1 (alerta activa a Pro Max + cercanos) ────────
router.post("/services/:id/relaunch", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [service] = await db.select({
    id: servicesTable.id,
    clientId: servicesTable.clientId,
    status: servicesTable.status,
  }).from(servicesTable).where(eq(servicesTable.id, id)).limit(1);

  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }
  if (service.clientId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Sin permiso" }); return;
  }
  if (["completed", "cancelled", "in_progress"].includes(service.status)) {
    res.status(400).json({ error: "El servicio no puede relanzarse en este estado" }); return;
  }

  // Guard de concurrencia: solo se puede relanzar si el servicio NO está ya en fase activa
  // (status pending = motor no ha arrancado, open/alerting = ya está procesando)
  if (service.status === "alerting") {
    res.json({ ok: true, skipped: true }); return;
  }

  // Resetear a pending para que el motor pueda relanzar la fase activa
  const [updated] = await db.update(servicesTable)
    .set({ status: "pending" })
    .where(and(
      eq(servicesTable.id, id),
      or(eq(servicesTable.status, "pending"), eq(servicesTable.status, "open")),
    ))
    .returning({ id: servicesTable.id });

  if (!updated) { res.json({ ok: true, skipped: true }); return; }

  launchActivePhase(id).catch(e => logger.error({ err: e, serviceId: id }, "launchActivePhase error on relaunch"));
  res.json({ ok: true });
});

// ── Segundo plano: pasa la orden directamente a la bandeja de todos ───────────
router.post("/services/:id/background", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [service] = await db.select({
    id: servicesTable.id,
    clientId: servicesTable.clientId,
    status: servicesTable.status,
  }).from(servicesTable).where(eq(servicesTable.id, id)).limit(1);

  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }
  if (service.clientId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Sin permiso" }); return;
  }
  if (["completed", "cancelled"].includes(service.status)) {
    res.status(400).json({ error: "El servicio no puede moverse en este estado" }); return;
  }

  // Pasar directamente a Fase 2 (bandeja universal)
  transitionToPassive(id).catch(e => console.error("background error:", e));
  res.json({ ok: true });
});

export default router;
