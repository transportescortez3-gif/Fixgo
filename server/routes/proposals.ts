import { Router } from "express";
import { db, proposalsTable, servicesTable, usersTable, messagesTable } from "../db";
import { eq, and, ne, aliasedTable, sql, notInArray, count, gte } from "drizzle-orm";
import { createNotification } from "../lib/createNotification";
import { emitToService, emitToUser } from "../lib/socketio";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { CreateProposalBody, CounterProposalBody } from "../zod";
import { handleServiceTaken } from "../lib/service-motor";
import { isWorkerPayoutComplete } from "../lib/worker-eligibility";
import { recordSecuritySelfie } from "../lib/security-selfies";
import { featureLimit, getActivePlanForUser } from "../lib/subscription-access";

const router = Router();

/** Notifica a los trabajadores cuya propuesta fue rechazada porque el cliente eligió a otro */
async function notifyRejectedWorkers(
  serviceId: number,
  clientId: number,
  serviceTitle: string,
  rejected: Array<{ id: number; workerId: number }>
) {
  for (const rp of rejected) {
    try {
      const [sysMsg] = await db.insert(messagesTable).values({
        serviceId,
        senderId: clientId,
        workerId: rp.workerId,
        content: "⛔ El cliente eligió a otro profesional para este trabajo.",
        messageType: "system",
      }).returning();
      emitToUser(rp.workerId, "new_message", { ...sysMsg, sender: null });
      emitToUser(rp.workerId, "proposal_updated", {
        serviceId,
        action: "not_selected",
        proposalId: rp.id,
      });
      await createNotification({
        userId: rp.workerId,
        title: "No fuiste seleccionado esta vez",
        message: `El cliente eligió a otro profesional para "${serviceTitle}". ¡Sigue buscando!`,
        type: "proposal_rejected",
        relatedId: serviceId,
        targetRole: "worker",
      });
    } catch (e) {
      console.error("[notifyRejectedWorkers] Error notificando al trabajador", rp.workerId, e);
    }
  }
}

const userSelect = {
  id: usersTable.id, name: usersTable.name, email: usersTable.email,
  role: usersTable.role, status: usersTable.status, phone: usersTable.phone,
  avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, skills: usersTable.skills,
  rating: usersTable.rating, totalReviews: usersTable.totalReviews,
  isAvailable: usersTable.isAvailable, lat: usersTable.lat, lng: usersTable.lng,
  visitFee: usersTable.visitFee,
  createdAt: usersTable.createdAt,
};

async function getProposalWithWorker(proposalId: number) {
  const rows = await db.select({
    proposal: proposalsTable,
    worker: userSelect,
  })
  .from(proposalsTable)
  .innerJoin(usersTable, eq(proposalsTable.workerId, usersTable.id))
  .where(eq(proposalsTable.id, proposalId))
  .limit(1);

  if (rows.length === 0) return null;
  return { ...rows[0].proposal, worker: rows[0].worker };
}

async function getProposalsWithWorkers(serviceId: number, filterWorkerId?: number) {
  const conditions = [eq(proposalsTable.serviceId, serviceId)];
  if (filterWorkerId) conditions.push(eq(proposalsTable.workerId, filterWorkerId));

  const rows = await db.select({
    proposal: proposalsTable,
    worker: userSelect,
  })
  .from(proposalsTable)
  .innerJoin(usersTable, eq(proposalsTable.workerId, usersTable.id))
  .where(and(...conditions))
  .orderBy(proposalsTable.createdAt);

  return rows.map(r => ({ ...r.proposal, worker: r.worker }));
}

router.get("/proposals/my", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo trabajadores pueden ver sus propuestas" });
    return;
  }
  const clientAlias = aliasedTable(usersTable, "client_user");

  const rows = await db.select({
    proposal: proposalsTable,
    service: servicesTable,
    client: {
      id: clientAlias.id,
      name: clientAlias.name,
      avatarUrl: clientAlias.avatarUrl,
    },
    // reviewedByWorker NO es columna de services: se calcula desde reviews.
    // La UI (WorkerJobCard) lo usa para ocultar "Calificar Cliente" y evitar
    // re-abrir el modal de calificación tras calificar. EXISTS (y no leftJoin)
    // para no duplicar propuestas si hubiera más de una fila de review por servicio.
    reviewedByWorker: sql<boolean>`EXISTS (SELECT 1 FROM reviews r WHERE r.service_id = ${servicesTable.id} AND r.reviewed_by_worker = true)`,
  })
    .from(proposalsTable)
    .innerJoin(servicesTable, eq(proposalsTable.serviceId, servicesTable.id))
    .leftJoin(clientAlias, eq(servicesTable.clientId, clientAlias.id))
    .where(eq(proposalsTable.workerId, req.userId!))
    .orderBy(proposalsTable.createdAt);

  res.json(rows.map(r => {
    const service = !r.service.workerSelfieUrl
      ? {
          ...r.service,
          address: null,
          originAddress: null,
          destinationAddress: null,
          lat: null,
          lng: null,
        }
      : r.service;
    return {
      ...r.proposal,
      service: { ...service, client: r.client, reviewedByWorker: !!r.reviewedByWorker },
    };
  }));
});

router.get("/services/:id/proposals", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseInt(String(req.params.id), 10);
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  if (!service) {
    console.log(`[proposals] GET serviceId=${serviceId} userId=${req.userId} → 404 service not found`);
    res.status(404).json({ error: "Servicio no encontrado" }); return;
  }

  const isServiceOwner = service.clientId === req.userId;
  const isWorkerRole = req.userRole === "worker";
  const isAdminRole = req.userRole === "admin";

  if (!isServiceOwner && !isWorkerRole && !isAdminRole) {
    console.log(`[proposals] GET serviceId=${serviceId} userId=${req.userId} role=${req.userRole} → 403 not owner/worker/admin`);
    res.status(403).json({ error: "No tienes acceso a las propuestas de este servicio" });
    return;
  }

  if (isWorkerRole && !isServiceOwner) {
    const results = await getProposalsWithWorkers(serviceId, req.userId!);
    console.log(`[proposals] GET serviceId=${serviceId} userId=${req.userId} role=worker → ${results.length} proposals (own only)`);
    res.json(results);
    return;
  }

  const results = await getProposalsWithWorkers(serviceId);
  console.log(`[proposals] GET serviceId=${serviceId} userId=${req.userId} role=${req.userRole} owner=${isServiceOwner} → ${results.length} proposals statuses=[${results.map((r:any)=>r.status).join(",")}]`);
  res.json(results);
});

router.post("/services/:id/proposals", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo los trabajadores pueden enviar propuestas" });
    return;
  }

  const [workerUser] = await db.select({
    kycStatus: usersTable.kycStatus,
    suspendedUntil: usersTable.suspendedUntil,
    visitFee: usersTable.visitFee,
    payoutBankName: usersTable.payoutBankName,
    payoutBankAccountType: usersTable.payoutBankAccountType,
    payoutBankAccountNumber: usersTable.payoutBankAccountNumber,
    payoutBankRut: usersTable.payoutBankRut,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!workerUser || workerUser.kycStatus !== "approved") {
    res.status(403).json({ error: "Debes verificar tu identidad (KYC) antes de enviar propuestas" });
    return;
  }

  // Suspensión temporal por cancelaciones reiteradas: no puede enviar propuestas.
  if (workerUser.suspendedUntil && new Date(workerUser.suspendedUntil).getTime() > Date.now()) {
    const until = new Date(workerUser.suspendedUntil).toLocaleString("es-CL", { timeZone: "America/Santiago" });
    res.status(403).json({
      error: `Tu cuenta está suspendida temporalmente por cancelaciones reiteradas. Podrás volver a trabajar el ${until}.`,
      code: "ACCOUNT_SUSPENDED",
    });
    return;
  }

  // Sistema de cancelación tardía: para recibir trabajos, el experto debe tener
  // su tarifa de visita técnica y sus datos de transferencia completos en el
  // perfil (así el cliente sabe cuánto y a dónde transferir si cancela tarde).
  if (
    workerUser.visitFee == null || workerUser.visitFee <= 0 ||
    !workerUser.payoutBankName || !workerUser.payoutBankAccountType ||
    !workerUser.payoutBankAccountNumber || !workerUser.payoutBankRut
  ) {
    res.status(403).json({
      error: "Antes de conectarte debes completar tu perfil: tarifa de visita técnica y datos de transferencia (banco, tipo de cuenta, N° de cuenta y RUT).",
      code: "PROFILE_INCOMPLETE_VISIT_FEE",
    });
    return;
  }

  const workerPlan = await getActivePlanForUser(req.userId!);
  const monthlyProposalLimit = featureLimit(workerPlan, "leads_per_month", 5);
  if (monthlyProposalLimit >= 0) {
    const monthStart = new Date();
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setDate(1);
    const [{ total }] = await db
      .select({ total: count() })
      .from(proposalsTable)
      .where(and(
        eq(proposalsTable.workerId, req.userId!),
        gte(proposalsTable.createdAt, monthStart),
      ));

    if (Number(total) >= monthlyProposalLimit) {
      res.status(403).json({
        error: `Alcanzaste el límite de ${monthlyProposalLimit} solicitudes de tu plan este mes.`,
        code: "MONTHLY_REQUEST_LIMIT",
      });
      return;
    }
  }

  const serviceId = parseInt(String(req.params.id), 10);
  const parsed = CreateProposalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  const openStatuses = ["pending", "alerting", "open"];
  if (!service || !openStatuses.includes(service.status)) {
    res.status(400).json({ error: "El servicio no está disponible para propuestas" });
    return;
  }

  const existing = await db.select().from(proposalsTable).where(
    and(eq(proposalsTable.serviceId, serviceId), eq(proposalsTable.workerId, req.userId!))
  ).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Ya enviaste una propuesta para este servicio" });
    return;
  }

  const [proposal] = await db.insert(proposalsTable).values({
    serviceId,
    workerId: req.userId!,
    message: parsed.data.message ?? null,
    estimatedTime: parsed.data.estimatedTime ?? null,
    lastCounterBy: "worker",
    workerSelfieUrl: (parsed.data as any).workerSelfieUrl ?? null,
  }).returning();

  if (proposal && (parsed.data as any).workerSelfieUrl) {
    await recordSecuritySelfie({
      userId: req.userId!,
      role: "worker",
      serviceId,
      proposalId: proposal.id,
      objectPath: (parsed.data as any).workerSelfieUrl,
      purpose: "proposal",
    });
  }

  await createNotification({
    userId: service.clientId,
    title: "Nueva propuesta recibida",
    message: `Un profesional quiere conectarse para tu servicio. Abre el chat para ver los detalles.`,
    type: "proposal_received",
    relatedId: service.id,
    targetRole: "client",
  });

  const result = await getProposalWithWorker(proposal.id);
  emitToService(serviceId, "proposal_updated", { serviceId, action: "new" });
  emitToUser(service.clientId, "proposal_updated", { serviceId, action: "new" });
  res.status(201).json(result);
});

router.post("/proposals/:id/accept", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const proposalId = parseInt(String(req.params.id), 10);
  const [proposal] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, proposalId)).limit(1);
  if (!proposal) { res.status(404).json({ error: "Propuesta no encontrada" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, proposal.serviceId)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  const isClient = service.clientId === req.userId;
  const isProposalWorker = proposal.workerId === req.userId;

  if (!isClient && !isProposalWorker) {
    res.status(403).json({ error: "No tienes permiso para aceptar esta propuesta" });
    return;
  }

  // Solo el cliente puede hacer la confirmación final ("Confirmar Experto")
  if (!isClient) {
    res.status(403).json({ error: "Solo el cliente puede confirmar al experto. El experto usa 'Aceptar Trabajo'." });
    return;
  }

  const acceptableStatuses = ["pending", "countered", "worker_accepted", "open_chat"];
  if (!acceptableStatuses.includes(proposal.status)) {
    res.status(400).json({ error: "Esta propuesta no se puede confirmar en su estado actual" });
    return;
  }

  // Defensa en profundidad: el experto debe tener tarifa de visita y datos de
  // transferencia completos ANTES de ser asignado (el cargo por cancelación
  // tardía necesita ese snapshot bancario).
  if (!(await isWorkerPayoutComplete(proposal.workerId))) {
    res.status(409).json({
      error: "Este experto aún no completa su tarifa de visita técnica y datos de transferencia. No puede ser confirmado por ahora.",
    });
    return;
  }

  let rejectedProposals: Array<{ id: number; workerId: number }> = [];
  try {
    await db.transaction(async (tx) => {
      await tx.update(proposalsTable).set({ status: "accepted" }).where(eq(proposalsTable.id, proposalId));
      // Rechazar todas las demás propuestas del servicio y capturar sus IDs para notificar
      rejectedProposals = await tx.update(proposalsTable).set({ status: "rejected" }).where(
        and(eq(proposalsTable.serviceId, proposal.serviceId), ne(proposalsTable.id, proposalId))
      ).returning({ id: proposalsTable.id, workerId: proposalsTable.workerId });
      // Update CONDICIONAL: si otro accept concurrente ya asignó el servicio,
      // este returning viene vacío → rollback completo (no queda una segunda
      // propuesta marcada como accepted).
      const [assigned] = await tx.update(servicesTable).set({
        status: "in_progress",
        workerId: proposal.workerId,
        // La ventana comienza cuando ambas partes confirman el acuerdo en el
        // chat, no cuando el cliente solo confirma al experto.
        freeCancelUntil: null,
      }).where(and(
        eq(servicesTable.id, proposal.serviceId),
        notInArray(servicesTable.status, ["in_progress", "completed", "cancelled"]),
      )).returning({ id: servicesTable.id });
      if (!assigned) throw new Error("SERVICE_ALREADY_ASSIGNED");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SERVICE_ALREADY_ASSIGNED") {
      res.status(409).json({ error: "Este servicio ya fue asignado o cerrado" });
      return;
    }
    throw err;
  }

  // Cooldown 4h + emitir service:taken a todos (Motor)
  await handleServiceTaken(proposal.serviceId, proposal.workerId);

  await createNotification({
    userId: proposal.workerId,
    title: "¡Felicitaciones! Fuiste seleccionado 🎉",
    message: `El cliente te eligió para: "${service.title}". El chat está abierto para coordinar.`,
    type: "proposal_accepted",
    relatedId: service.id,
    targetRole: "worker",
    highPriority: true,
  });
  await createNotification({
    userId: service.clientId,
    title: "Experto confirmado 💬",
    message: `Ya puedes coordinar los detalles directamente con el experto.`,
    type: "proposal_accepted",
    relatedId: service.id,
    targetRole: "client",
    highPriority: true,
  });

  // Mensaje de sistema en el chat para que ambas partes vean la confirmación
  const [sysMsg] = await db.insert(messagesTable).values({
    serviceId: proposal.serviceId,
    senderId: service.clientId,
    workerId: proposal.workerId,
    content: `✅ Cliente eligió a este especialista. ¡Coordinen los detalles aquí!`,
    messageType: "system",
  }).returning();
  const sysFullMsg = { ...sysMsg, sender: null };
  emitToService(proposal.serviceId, "new_message", sysFullMsg);
  emitToUser(service.clientId, "new_message", sysFullMsg);
  emitToUser(proposal.workerId, "new_message", sysFullMsg);

  // La dirección se muestra en la tarjeta __AGREEMENT__ que ya envía el
  // endpoint /accept-work. No insertar un location_share separado porque
  // aparecería duplicado en ambos lados del chat.

  const result = await getProposalWithWorker(proposalId);
  // El contador se inicia al enviar el mensaje de acuerdo en el chat.
  const serviceUpdatedPayload = { serviceId: proposal.serviceId, status: "in_progress", freeCancelUntil: null };
  emitToService(proposal.serviceId, "proposal_updated", { serviceId: proposal.serviceId, action: "accepted" });
  emitToService(proposal.serviceId, "service_updated", serviceUpdatedPayload);
  emitToUser(service.clientId, "proposal_updated", { serviceId: proposal.serviceId, action: "accepted" });
  emitToUser(proposal.workerId, "proposal_updated", { serviceId: proposal.serviceId, action: "accepted" });
  emitToUser(service.clientId, "service_updated", serviceUpdatedPayload);
  emitToUser(proposal.workerId, "service_updated", serviceUpdatedPayload);
  res.json(result);

  // Notificar a los trabajadores no seleccionados (en background, no bloquea la respuesta)
  notifyRejectedWorkers(proposal.serviceId, service.clientId, service.title, rejectedProposals).catch(console.error);
});

// Experto presiona "Aceptar Trabajo" — señala al cliente que está listo para cerrar el trato
router.post("/services/:id/worker-accept", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo expertos pueden aceptar un trabajo" });
    return;
  }

  const workerPlan = await getActivePlanForUser(req.userId!);
  const monthlyProposalLimit = featureLimit(workerPlan, "leads_per_month", 5);
  if (monthlyProposalLimit >= 0) {
    const monthStart = new Date();
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setDate(1);
    const [{ total }] = await db
      .select({ total: count() })
      .from(proposalsTable)
      .where(and(
        eq(proposalsTable.workerId, req.userId!),
        gte(proposalsTable.createdAt, monthStart),
      ));

    if (Number(total) >= monthlyProposalLimit) {
      res.status(403).json({
        error: `Alcanzaste el límite de ${monthlyProposalLimit} solicitudes de tu plan este mes.`,
        code: "MONTHLY_REQUEST_LIMIT",
      });
      return;
    }
  }

  const serviceId = parseInt(String(req.params.id), 10);
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  const [proposal] = await db.select().from(proposalsTable).where(
    and(eq(proposalsTable.serviceId, serviceId), eq(proposalsTable.workerId, req.userId!))
  ).limit(1);

  if (!proposal) {
    res.status(404).json({ error: "No tienes una propuesta activa para este servicio" });
    return;
  }

  const allowedForAccept = ["pending", "open_chat", "countered"];
  if (!allowedForAccept.includes(proposal.status)) {
    res.status(400).json({ error: "Esta propuesta no puede ser aceptada en su estado actual" });
    return;
  }

  await db.update(proposalsTable)
    .set({ status: "worker_accepted" })
    .where(eq(proposalsTable.id, proposal.id));

  await createNotification({
    userId: service.clientId,
    title: "¡Un experto está listo! ✅",
    message: `El experto confirmó su disponibilidad para: "${service.title}". Ahora tú decides.`,
    type: "proposal_accepted",
    relatedId: service.id,
    targetRole: "client",
    highPriority: true,
  });

  const result = await getProposalWithWorker(proposal.id);
  emitToService(serviceId, "proposal_updated", { serviceId, action: "worker_accepted", proposalId: proposal.id });
  emitToUser(service.clientId, "proposal_updated", { serviceId, action: "worker_accepted", proposalId: proposal.id });
  emitToUser(req.userId!, "proposal_updated", { serviceId, action: "worker_accepted", proposalId: proposal.id });
  res.json(result);
});

router.post("/proposals/:id/reject", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const proposalId = parseInt(String(req.params.id), 10);
  const [proposal] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, proposalId)).limit(1);
  if (!proposal) { res.status(404).json({ error: "Propuesta no encontrada" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, proposal.serviceId)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  const isClient = service.clientId === req.userId;
  const isProposalWorker = proposal.workerId === req.userId;

  if (!isClient && !isProposalWorker) {
    res.status(403).json({ error: "No tienes permiso para rechazar esta propuesta" });
    return;
  }

  await db.update(proposalsTable).set({ status: "rejected" }).where(eq(proposalsTable.id, proposalId));

  const notifyUserId = isClient ? proposal.workerId : service.clientId;
  const notifyTitle = isClient ? "Propuesta rechazada" : "El profesional rechazó la negociación";
  await createNotification({
    userId: notifyUserId,
    title: notifyTitle,
    message: isClient ? "Tu propuesta ha sido rechazada por el cliente" : "El profesional ha rechazado tu contraoferta",
    type: "proposal_rejected",
    relatedId: service.id,
    targetRole: isClient ? "worker" : "client",
  });

  if (!isClient && (service as any).isDirectRequest) {
    await createNotification({
      userId: service.clientId,
      title: "Tu técnico no está disponible",
      message: `Tu técnico de confianza no aceptó la solicitud para: "${service.title}"`,
      type: "direct_rejected" as const,
      relatedId: service.id,
      targetRole: "client",
    });
  }

  const result = await getProposalWithWorker(proposalId);
  emitToService(proposal.serviceId, "proposal_updated", { serviceId: proposal.serviceId, action: "rejected" });
  emitToUser(service.clientId, "proposal_updated", { serviceId: proposal.serviceId, action: "rejected" });
  emitToUser(proposal.workerId, "proposal_updated", { serviceId: proposal.serviceId, action: "rejected" });
  res.json(result);
});

router.post("/proposals/:id/counter", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const proposalId = parseInt(String(req.params.id), 10);
  const parsed = CounterProposalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [proposal] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, proposalId)).limit(1);
  if (!proposal) { res.status(404).json({ error: "Propuesta no encontrada" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, proposal.serviceId)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  const isClient = service.clientId === req.userId;
  const isProposalWorker = proposal.workerId === req.userId;

  if (!isClient && !isProposalWorker) {
    res.status(403).json({ error: "No tienes permiso para contraoferta en esta propuesta" });
    return;
  }

  if (proposal.status !== "pending" && proposal.status !== "countered") {
    res.status(400).json({ error: "No se puede contraoferta en el estado actual" });
    return;
  }

  const myRole = isClient ? "client" : "worker";
  if (proposal.lastCounterBy === myRole) {
    res.status(400).json({ error: "Ya enviaste la última oferta. Espera la respuesta." });
    return;
  }

  await db.update(proposalsTable).set({
    status: "countered",
    lastCounterBy: myRole,
  }).where(eq(proposalsTable.id, proposalId));

  const notifyUserId = isClient ? proposal.workerId : service.clientId;
  const senderLabel = isClient ? "El cliente" : "El profesional";
  await createNotification({
    userId: notifyUserId,
    title: "Contraoferta recibida",
    message: `${senderLabel} ha respondido con una nueva oferta. Abre el chat para verla.`,
    type: "counter_offer",
    relatedId: service.id,
    targetRole: isClient ? "worker" : "client",
    highPriority: true,
  });

  const result = await getProposalWithWorker(proposalId);
  emitToService(proposal.serviceId, "proposal_updated", { serviceId: proposal.serviceId, action: "countered" });
  emitToUser(service.clientId, "proposal_updated", { serviceId: proposal.serviceId, action: "countered" });
  emitToUser(proposal.workerId, "proposal_updated", { serviceId: proposal.serviceId, action: "countered" });
  res.json(result);
});

router.post("/proposals/:id/accept-counter", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const proposalId = parseInt(String(req.params.id), 10);
  const [proposal] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, proposalId)).limit(1);
  if (!proposal) { res.status(404).json({ error: "Propuesta no encontrada" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, proposal.serviceId)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  const isClient = service.clientId === req.userId;
  const isProposalWorker = proposal.workerId === req.userId;

  if (!isClient && !isProposalWorker) {
    res.status(403).json({ error: "No tienes permiso" }); return;
  }

  if (proposal.status !== "countered") {
    res.status(400).json({ error: "No hay contraoferta pendiente" }); return;
  }

  const myRole = isClient ? "client" : "worker";
  if (proposal.lastCounterBy === myRole) {
    res.status(400).json({ error: "No puedes aceptar tu propia contraoferta" }); return;
  }

  // Defensa en profundidad: el experto debe tener tarifa de visita y datos de
  // transferencia completos ANTES de ser asignado (ver /accept).
  if (!(await isWorkerPayoutComplete(proposal.workerId))) {
    res.status(409).json({
      error: "El experto aún no completa su tarifa de visita técnica y datos de transferencia. No se puede cerrar el trato por ahora.",
    });
    return;
  }

  let rejectedCounterProposals: Array<{ id: number; workerId: number }> = [];
  try {
    await db.transaction(async (tx) => {
      await tx.update(proposalsTable).set({ status: "accepted" }).where(eq(proposalsTable.id, proposalId));
      const r1 = await tx.update(proposalsTable).set({ status: "rejected" }).where(
        and(eq(proposalsTable.serviceId, proposal.serviceId), eq(proposalsTable.status, "pending"),
          ne(proposalsTable.id, proposalId))
      ).returning({ id: proposalsTable.id, workerId: proposalsTable.workerId });
      const r2 = await tx.update(proposalsTable).set({ status: "rejected" }).where(
        and(eq(proposalsTable.serviceId, proposal.serviceId), eq(proposalsTable.status, "countered"),
          ne(proposalsTable.id, proposalId))
      ).returning({ id: proposalsTable.id, workerId: proposalsTable.workerId });
      rejectedCounterProposals = [...r1, ...r2];
      // Update CONDICIONAL: si otro accept concurrente ya asignó el servicio,
      // rollback completo (ver /accept).
      const [assigned] = await tx.update(servicesTable).set({
        status: "in_progress",
        workerId: proposal.workerId,
        // La ventana comienza cuando ambas partes confirman el acuerdo en el
        // chat, no cuando se acepta la contraoferta.
        freeCancelUntil: null,
      }).where(and(
        eq(servicesTable.id, proposal.serviceId),
        notInArray(servicesTable.status, ["in_progress", "completed", "cancelled"]),
      )).returning({ id: servicesTable.id });
      if (!assigned) throw new Error("SERVICE_ALREADY_ASSIGNED");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SERVICE_ALREADY_ASSIGNED") {
      res.status(409).json({ error: "Este servicio ya fue asignado o cerrado" });
      return;
    }
    throw err;
  }

  await handleServiceTaken(proposal.serviceId, proposal.workerId);

  const notifyUserId = isClient ? proposal.workerId : service.clientId;
  const notifyOther2 = isClient ? service.clientId : proposal.workerId;
  await createNotification({
    userId: notifyUserId,
    title: "¡Conexión establecida! 💬",
    message: `El trato fue aceptado. El chat está abierto para coordinar los detalles.`,
    type: "proposal_accepted",
    relatedId: service.id,
    targetRole: isClient ? "worker" : "client",
    highPriority: true,
  });
  await createNotification({
    userId: notifyOther2,
    title: "Chat abierto 💬",
    message: `Ya puedes coordinar directamente con el profesional.`,
    type: "proposal_accepted",
    relatedId: service.id,
    targetRole: isClient ? "client" : "worker",
    highPriority: true,
  });

  const result = await getProposalWithWorker(proposalId);
  const serviceUpdatedPayload2 = { serviceId: proposal.serviceId, status: "in_progress", freeCancelUntil: null };
  emitToService(proposal.serviceId, "proposal_updated", { serviceId: proposal.serviceId, action: "accepted" });
  emitToService(proposal.serviceId, "service_updated", serviceUpdatedPayload2);
  emitToUser(service.clientId, "proposal_updated", { serviceId: proposal.serviceId, action: "accepted" });
  emitToUser(proposal.workerId, "proposal_updated", { serviceId: proposal.serviceId, action: "accepted" });
  emitToUser(service.clientId, "service_updated", serviceUpdatedPayload2);
  emitToUser(proposal.workerId, "service_updated", serviceUpdatedPayload2);
  res.json(result);

  notifyRejectedWorkers(proposal.serviceId, service.clientId, service.title, rejectedCounterProposals).catch(console.error);
});

router.post("/proposals/:id/reject-counter", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const proposalId = parseInt(String(req.params.id), 10);
  const [proposal] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, proposalId)).limit(1);
  if (!proposal) { res.status(404).json({ error: "Propuesta no encontrada" }); return; }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, proposal.serviceId)).limit(1);
  if (!service) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

  const isClient = service.clientId === req.userId;
  const isProposalWorker = proposal.workerId === req.userId;

  if (!isClient && !isProposalWorker) {
    res.status(403).json({ error: "No tienes permiso" }); return;
  }

  if (proposal.status !== "countered") {
    res.status(400).json({ error: "No hay contraoferta pendiente" }); return;
  }

  const myRole = isClient ? "client" : "worker";
  if (proposal.lastCounterBy === myRole) {
    res.status(400).json({ error: "No puedes rechazar tu propia contraoferta" }); return;
  }

  await db.update(proposalsTable).set({ status: "rejected" }).where(eq(proposalsTable.id, proposalId));

  const notifyUserId = isClient ? proposal.workerId : service.clientId;
  await createNotification({
    userId: notifyUserId,
    title: "Contraoferta rechazada",
    message: "La contraoferta ha sido rechazada",
    type: "proposal_rejected",
    relatedId: service.id,
    targetRole: isClient ? "worker" : "client",
  });

  const result = await getProposalWithWorker(proposalId);
  emitToService(proposal.serviceId, "proposal_updated", { serviceId: proposal.serviceId, action: "rejected" });
  emitToUser(service.clientId, "proposal_updated", { serviceId: proposal.serviceId, action: "rejected" });
  emitToUser(proposal.workerId, "proposal_updated", { serviceId: proposal.serviceId, action: "rejected" });
  res.json(result);
});

export default router;
