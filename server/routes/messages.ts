import { Router } from "express";
import { db, messagesTable, usersTable, servicesTable, userCryptoKeysTable, proposalsTable, chatAttachmentsTable } from "../db";
import { eq, and, ne, or, isNull, inArray } from "drizzle-orm";
import { createNotification } from "../lib/createNotification";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { ListMessagesParams, CreateMessageParams, CreateMessageBody } from "../zod";
import { emitToService, emitToUser, emitToServiceThread } from "../lib/socketio";
import { isWorkerPayoutComplete, PROFILE_INCOMPLETE_MESSAGE } from "../lib/worker-eligibility";
import { toPublicChatAttachment } from "../lib/chat-attachments";

const router = Router();

// Las respuestas E2E pueden cambiar durante el mismo login. Nunca permitir
// ETag/304: el cliente necesita el JSON completo para
// decidir si restaura la llave con la contraseña de la cuenta.
router.use("/messages/keys", (req, res, next) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  next();
});

const userSelect = {
  id: usersTable.id, name: usersTable.name, email: usersTable.email,
  role: usersTable.role, status: usersTable.status, phone: usersTable.phone,
  avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, skills: usersTable.skills,
  rating: usersTable.rating, totalReviews: usersTable.totalReviews,
  isAvailable: usersTable.isAvailable, lat: usersTable.lat, lng: usersTable.lng,
  createdAt: usersTable.createdAt,
};

// Respaldo cifrado de la llave privada del PROPIO usuario autenticado. Se define
// antes de la ruta dinámica `:userId` para que "backup" no sea capturado como id.
router.get("/messages/keys/backup", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const [row] = await db.select({
    encryptedPrivateKey: userCryptoKeysTable.encryptedPrivateKey,
    kdfSalt: userCryptoKeysTable.kdfSalt,
    kdfIv: userCryptoKeysTable.kdfIv,
    kdfIterations: userCryptoKeysTable.kdfIterations,
  })
    .from(userCryptoKeysTable)
    .where(eq(userCryptoKeysTable.userId, req.userId!))
    .limit(1);

  if (!row || !row.encryptedPrivateKey || !row.kdfSalt || !row.kdfIv) {
    res.json({ hasBackup: false });
    return;
  }

  res.json({
    hasBackup: true,
    encryptedPrivateKey: row.encryptedPrivateKey,
    kdfSalt: row.kdfSalt,
    kdfIv: row.kdfIv,
    kdfIterations: row.kdfIterations,
  });
});

router.get("/messages/keys/:userId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const userId = parseInt(String(req.params.userId), 10);
  if (isNaN(userId)) { res.status(400).json({ error: "userId inválido" }); return; }

  const [row] = await db.select({ publicKey: userCryptoKeysTable.publicKey })
    .from(userCryptoKeysTable)
    .where(eq(userCryptoKeysTable.userId, userId))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Clave pública no encontrada" }); return; }

  res.json({ publicKey: row.publicKey });
});

router.post("/messages/keys", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { publicKey, encryptedPrivateKey, kdfSalt, kdfIv, kdfIterations } = req.body;
  if (!publicKey || typeof publicKey !== "string") {
    res.status(400).json({ error: "publicKey requerido" });
    return;
  }

  // El respaldo cifrado es opcional: las llamadas "solo pública" (legacy) NO deben
  // borrar un respaldo existente, así que solo se actualizan esos campos si vienen.
  const hasBackup =
    typeof encryptedPrivateKey === "string" &&
    typeof kdfSalt === "string" &&
    typeof kdfIv === "string";

  // Blindaje: una subida "solo pública" (sin respaldo) NUNCA debe sobrescribir
  // una llave pública DISTINTA ya almacenada. Esto cubre el caso crítico en que
  // un dispositivo sin la llave original (y sin respaldo para restaurarla) genera
  // una llave nueva ad-hoc al abrir un chat o iniciar sesión: si se permitiera,
  // la pública del servidor rotaría y dejaría TODO el historial indescifrable
  // para el propio usuario y para el otro interlocutor. La única forma legítima
  // de cambiar la pública es adjuntando el respaldo cifrado correspondiente
  // (hasBackup), lo que ocurre al crear el respaldo desde el dispositivo que sí
  // conserva la llave original.
  if (!hasBackup) {
    const [existing] = await db.select({
      publicKey: userCryptoKeysTable.publicKey,
    })
      .from(userCryptoKeysTable)
      .where(eq(userCryptoKeysTable.userId, req.userId!))
      .limit(1);
    if (existing && existing.publicKey !== publicKey) {
      res.status(409).json({
        error: "La llave pública está bloqueada; restaura tu llave desde tu dispositivo original",
      });
      return;
    }
  }

  const insertValues: typeof userCryptoKeysTable.$inferInsert = { userId: req.userId!, publicKey };
  const updateSet: Partial<typeof userCryptoKeysTable.$inferInsert> = { publicKey, updatedAt: new Date() };

  if (hasBackup) {
    const iters = typeof kdfIterations === "number" ? kdfIterations : null;
    insertValues.encryptedPrivateKey = encryptedPrivateKey;
    insertValues.kdfSalt = kdfSalt;
    insertValues.kdfIv = kdfIv;
    insertValues.kdfIterations = iters;
    updateSet.encryptedPrivateKey = encryptedPrivateKey;
    updateSet.kdfSalt = kdfSalt;
    updateSet.kdfIv = kdfIv;
    updateSet.kdfIterations = iters;
  }

  await db.insert(userCryptoKeysTable)
    .values(insertValues)
    .onConflictDoUpdate({
      target: userCryptoKeysTable.userId,
      set: updateSet,
    });

  res.json({ ok: true });
});

// Permite al propio usuario borrar su llave E2E del servidor para regenerarla
// en casos donde no hay respaldo y la clave local se perdió (sesión nueva).
router.delete("/messages/keys", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await db.delete(userCryptoKeysTable).where(eq(userCryptoKeysTable.userId, req.userId!));
  res.json({ ok: true });
});

router.get("/services/:serviceId/messages", authenticate, async (req: AuthRequest, res): Promise<void> => {
  // Los mensajes están cifrados de extremo a extremo. Administración puede
  // revisar el servicio y sus metadatos, pero no debe descargar ciphertext ni
  // intentar abrir conversaciones que no puede descifrar.
  if (req.userRole === "admin") {
    res.status(403).json({ error: "Los chats cifrados no están disponibles para administración" });
    return;
  }

  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [service] = await db.select({
    clientId: servicesTable.clientId,
    workerId: servicesTable.workerId,
    status: servicesTable.status,
  })
    .from(servicesTable)
    .where(eq(servicesTable.id, params.data.serviceId))
    .limit(1);

  if (!service) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }

  const myId = req.userId!;
  // "open", "alerting" y "pending" son todos estados donde el servicio está
  // buscando trabajador: cualquier worker autenticado puede leer/escribir su hilo.
  const isPending = ["pending", "alerting", "open"].includes(service.status ?? "");

  // Para servicios pendientes, cualquier trabajador autenticado puede leer su hilo
  if (isPending) {
    if (req.userRole === "admin") {
      // admin siempre puede
    } else if (service.clientId === myId) {
      // cliente puede acceder
    } else if (req.userRole !== "worker") {
      res.status(403).json({ error: "No tienes acceso a esta conversación" });
      return;
    }
    // Cualquier trabajador puede ver su propio hilo (vacío si aún no ha chateado)
  } else {
    // Servicio no pendiente: solo los participantes asignados
    const isParticipant = service.clientId === myId || service.workerId === myId;
    if (!isParticipant && req.userRole !== "admin") {
      res.status(403).json({ error: "No tienes acceso a esta conversación" });
      return;
    }
  }

  // Construir condición de filtro por workerId para servicios pendientes
  let whereCondition;
  if (isPending) {
    if (service.clientId === myId) {
      // El cliente puede filtrar por un trabajador específico (query param)
      const filterWorkerId = req.query.workerId ? parseInt(req.query.workerId as string, 10) : null;
      if (filterWorkerId && !isNaN(filterWorkerId)) {
        whereCondition = and(
          eq(messagesTable.serviceId, params.data.serviceId),
          eq(messagesTable.workerId, filterWorkerId)
        );
      } else {
        whereCondition = eq(messagesTable.serviceId, params.data.serviceId);
      }
    } else {
      // Trabajador solo ve su propio hilo
      whereCondition = and(
        eq(messagesTable.serviceId, params.data.serviceId),
        eq(messagesTable.workerId, myId)
      );
    }
  } else {
    // Servicio no pendiente (in_progress, etc.): filtrar por hilo según rol
    // - Cliente → ve el hilo del trabajador asignado
    // - Trabajador asignado → ve su propio hilo
    // - Trabajador rechazado (sigue en la app 20 min) → ve su propio hilo con el mensaje ⛔
    // - Admin → ve todo
    if (req.userRole === "admin") {
      whereCondition = eq(messagesTable.serviceId, params.data.serviceId);
    } else if (myId === service.clientId) {
      // Cliente: muestra solo el hilo del trabajador elegido
      whereCondition = and(
        eq(messagesTable.serviceId, params.data.serviceId),
        eq(messagesTable.workerId, service.workerId!)
      );
    } else {
      // Trabajador (asignado o rechazado): muestra su propio hilo
      whereCondition = and(
        eq(messagesTable.serviceId, params.data.serviceId),
        eq(messagesTable.workerId, myId)
      );
    }
  }

  const rows = await db.select({
    message: messagesTable,
    sender: userSelect,
  })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(whereCondition)
    .orderBy(messagesTable.createdAt);

  const messageIds = rows.map(r => r.message.id);
  const attachmentRows = messageIds.length
    ? await db.select().from(chatAttachmentsTable).where(and(
      inArray(chatAttachmentsTable.messageId, messageIds),
      eq(chatAttachmentsTable.status, "ready"),
    ))
    : [];
  const attachmentsByMessage = new Map<number, any[]>();
  for (const row of attachmentRows) {
    const list = attachmentsByMessage.get(row.messageId!) ?? [];
    list.push(toPublicChatAttachment(row));
    attachmentsByMessage.set(row.messageId!, list);
  }
  const messages = rows.map(r => ({
    ...r.message,
    sender: r.sender,
    attachments: attachmentsByMessage.get(r.message.id) ?? [],
  }));

  // Marcar como leídos
  if (whereCondition) {
    await db.update(messagesTable).set({ isRead: true }).where(
      and(
        whereCondition,
        ne(messagesTable.senderId, myId),
        eq(messagesTable.isRead, false)
      )
    );
  }

  res.json({ messages, typingUsers: [] });
});

router.post("/services/:serviceId/messages", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole === "admin") {
    res.status(403).json({ error: "Administración no puede enviar mensajes en chats cifrados" });
    return;
  }

  const params = CreateMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.serviceId)).limit(1);
  if (!service) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }

  const myId = req.userId!;

  const isPending = ["pending", "alerting", "open"].includes(service.status ?? "");

  if (isPending) {
    if (req.userRole === "admin") {
      // ok
    } else if (service.clientId === myId) {
      // cliente puede enviar (necesita workerId en el body para saber a quién responde)
    } else if (req.userRole === "worker") {
      // Sistema de cancelación tardía: para contactar clientes el experto debe
      // tener tarifa de visita técnica y datos de transferencia completos
      // (el primer mensaje crea/activa su propuesta automáticamente).
      if (!(await isWorkerPayoutComplete(myId))) {
        res.status(403).json({
          error: PROFILE_INCOMPLETE_MESSAGE,
          code: "PROFILE_INCOMPLETE_VISIT_FEE",
        });
        return;
      }
      // Si el trabajador no tiene propuesta aún, se crea automáticamente al enviar el primer mensaje
      const [existing] = await db.select({ id: proposalsTable.id })
        .from(proposalsTable)
        .where(and(
          eq(proposalsTable.serviceId, params.data.serviceId),
          eq(proposalsTable.workerId, myId)
        ))
        .limit(1);

      if (!existing) {
        await db.insert(proposalsTable).values({
          serviceId: params.data.serviceId,
          workerId: myId,
          proposedPrice: null,
          message: null,
          estimatedTime: null,
          status: "pending",
        } as any);
        emitToUser(service.clientId, "proposal_updated", { serviceId: params.data.serviceId, action: "new" });
      } else {
        // Si la propuesta existe en open_chat (trabajador revisó la alerta pero aún no
        // había confirmado interés), el primer mensaje confirma su interés → pasar a pending
        // para que la tarjeta aparezca en el panel del cliente.
        const [row] = await db.select({ status: proposalsTable.status })
          .from(proposalsTable)
          .where(eq(proposalsTable.id, existing.id))
          .limit(1);
        if (row?.status === "open_chat") {
          await db.update(proposalsTable)
            .set({ status: "pending" })
            .where(eq(proposalsTable.id, existing.id));
          emitToUser(service.clientId, "proposal_updated", { serviceId: params.data.serviceId, action: "new" });
        }
      }
    } else {
      res.status(403).json({ error: "No tienes acceso a esta conversación" });
      return;
    }
  } else {
    const isParticipant = service.clientId === myId || service.workerId === myId;
    if (!isParticipant && req.userRole !== "admin") {
      res.status(403).json({ error: "No tienes acceso a esta conversación" });
      return;
    }
  }

  // Conversación cerrada: un servicio cancelado o completado no acepta mensajes
  // nuevos (antes se seguían insertando y el otro participante nunca los veía
  // en contexto — p. ej. el experto escribiendo tras la cancelación).
  // IMPORTANTE: este check va DESPUÉS de la autorización — responder 409 antes
  // del 403 filtraría la existencia/estado del servicio a no participantes.
  if (["cancelled", "completed"].includes(service.status ?? "")) {
    res.status(409).json({
      error: service.status === "cancelled"
        ? "El servicio fue cancelado — la conversación está cerrada"
        : "El trabajo finalizó — la conversación está cerrada",
    });
    return;
  }

  const content = parsed.data.content;
  const imageUrl = (req.body as any).imageUrl || null;
  const attachmentIds = parsed.data.attachmentIds ?? [];
  if (attachmentIds.length > 0 && attachmentIds.length > 5) {
    res.status(400).json({ error: "Máximo 5 adjuntos por mensaje" });
    return;
  }
  const bodyMessageType = (req.body as any).messageType;
  const isAgreementMsg = bodyMessageType === "agreement";
  // Persistir el tipo real del mensaje: "agreement" (tarjeta de ubicación/acuerdo)
  // antes se degradaba a "text" y el historial perdía la señal del tipo.
  const messageType = imageUrl
    ? "image"
    : (bodyMessageType === "price_proposal" || bodyMessageType === "agreement" ? bodyMessageType : "text");

  // La confirmación del acuerdo es el instante común que inicia el contador
  // de 10 minutos para ambas partes. El update condicional evita reiniciarlo
  // si un cliente reintenta el envío por una respuesta de red tardía.
  let agreementFreeCancelUntil: Date | null = null;
  if (isAgreementMsg && service.clientId === myId && service.status === "in_progress") {
    const candidate = new Date(Date.now() + 10 * 60 * 1000);
    const [updatedService] = await db.update(servicesTable)
      .set({ freeCancelUntil: candidate })
      .where(and(
        eq(servicesTable.id, params.data.serviceId),
        eq(servicesTable.status, "in_progress"),
        isNull(servicesTable.freeCancelUntil),
      ))
      .returning({ freeCancelUntil: servicesTable.freeCancelUntil });
    agreementFreeCancelUntil = updatedService?.freeCancelUntil ?? null;
  }

  // Para servicios pendientes, determinar el workerId del hilo
  let threadWorkerId: number | undefined = undefined;
  if (isPending) {
    if (service.clientId === myId) {
      // Cliente responde: usa el workerId pasado en el body. Es OBLIGATORIO:
      // sin él, el mensaje se guardaría con workerId NULL y quedaría fuera
      // de todos los hilos (invisible en el historial de cualquier trabajador).
      const bodyWorkerId = parseInt(String((req.body as any).workerId ?? ""), 10);
      if (!Number.isInteger(bodyWorkerId) || bodyWorkerId <= 0) {
        res.status(400).json({ error: "Falta el trabajador del hilo (workerId)" });
        return;
      }
      threadWorkerId = bodyWorkerId;
    } else {
      // Trabajador envía: el workerId del hilo es su propio userId
      threadWorkerId = myId;
    }
  } else {
    // Servicio ya asignado (accepted/in_progress/completed/...): el hilo es
    // SIEMPRE el del trabajador asignado. Sin esto, los mensajes enviados
    // después de aceptar la propuesta se guardaban con workerId NULL y el
    // historial (que filtra por workerId) nunca los devolvía: solo se veían
    // por socket mientras ambos estaban dentro del chat y "se perdían" al salir.
    if (service.workerId == null) {
      // Servicio no pendiente y sin trabajador asignado (ej. cancelado antes
      // de asignar): no hay hilo válido donde persistir el mensaje.
      res.status(409).json({ error: "Esta conversación no tiene un experto asignado" });
      return;
    }
    threadWorkerId = service.workerId;
  }

  const attachments = attachmentIds.length
    ? await db.select().from(chatAttachmentsTable).where(and(
      inArray(chatAttachmentsTable.id, attachmentIds),
      eq(chatAttachmentsTable.serviceId, params.data.serviceId),
      eq(chatAttachmentsTable.workerId, threadWorkerId),
      eq(chatAttachmentsTable.uploaderId, myId),
      eq(chatAttachmentsTable.status, "ready"),
    ))
    : [];
  if (attachments.length !== attachmentIds.length) {
    res.status(400).json({ error: "Uno o más adjuntos no están listos para enviar en este hilo" });
    return;
  }
  if (attachments.some(attachment => attachment.messageId !== null)) {
    res.status(409).json({ error: "Uno de los adjuntos ya fue enviado; reintenta con la lista actualizada" });
    return;
  }
  if (attachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) {
    res.status(400).json({ error: "Máximo 100 MB acumulados por mensaje" });
    return;
  }

  const [message] = await db.insert(messagesTable).values({
    serviceId: params.data.serviceId,
    senderId: myId,
    workerId: threadWorkerId,
    content,
    imageUrl,
    messageType,
  }).returning();
  if (attachments.length > 0) {
    await db.update(chatAttachmentsTable)
      .set({ messageId: message.id })
      .where(and(
        inArray(chatAttachmentsTable.id, attachmentIds),
        isNull(chatAttachmentsTable.messageId),
      ));
  }

  // Determinar destinatario para notificación
  let recipientId: number | null = null;
  if (isPending) {
    if (service.clientId === myId) {
      // cliente envió → notificar al trabajador (threadWorkerId)
      recipientId = threadWorkerId ?? null;
    } else {
      // trabajador envió → notificar al cliente
      recipientId = service.clientId;
    }
  } else {
    recipientId = service.clientId === myId ? service.workerId : service.clientId;
  }

  const [sender] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, myId)).limit(1);
  const fullMessage = {
    ...message,
    sender,
    attachments: attachments.map(toPublicChatAttachment),
  };

  // Publicar primero el inicio del contador para que el experto nunca
  // renderice la dirección antes de recibir la protección de 10 minutos.
  if (agreementFreeCancelUntil) {
    const serviceUpdatedPayload = {
      serviceId: params.data.serviceId,
      status: "in_progress",
      freeCancelUntil: agreementFreeCancelUntil.toISOString(),
    };
    emitToService(params.data.serviceId, "service_updated", serviceUpdatedPayload);
    emitToUser(service.clientId, "service_updated", serviceUpdatedPayload);
    if (service.workerId) emitToUser(service.workerId, "service_updated", serviceUpdatedPayload);
  }

  if (isPending && threadWorkerId) {
    // Servicios pendientes: emitir SOLO al hilo de este trabajador-cliente.
    // Otros trabajadores que también están chateando con el mismo cliente
    // tienen su propia sala aislada y NO deben recibir este mensaje.
    emitToServiceThread(params.data.serviceId, threadWorkerId, "new_message", fullMessage);
  } else {
    emitToService(params.data.serviceId, "new_message", fullMessage);
  }
  // También al room del destinatario para que reciba el push aunque
  // el chat no esté abierto (badge en "Mis Conversaciones", toast, etc.)
  if (recipientId) {
    emitToUser(recipientId, "new_message", fullMessage);
  }

  if (recipientId) {
    const msgTargetRole: "client" | "worker" = recipientId === service.clientId ? "client" : "worker";

    if (isAgreementMsg) {
      await createNotification({
        userId: recipientId,
        title: "✅ Trabajo Pactado",
        message: `${sender?.name || "El cliente"} confirmó el acuerdo. Revisa el chat para ver la dirección.`,
        type: "new_message",
        relatedId: service.id,
        targetRole: msgTargetRole,
        highPriority: true,
      });
    } else {
      await createNotification({
        userId: recipientId,
        title: "Nuevo mensaje",
        message: `${sender?.name || "Alguien"} te ha enviado un mensaje`,
        type: "new_message",
        relatedId: service.id,
        targetRole: msgTargetRole,
      });
    }
  }

  res.status(201).json(fullMessage);
});

router.post("/services/:serviceId/typing", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseInt(String(req.params.serviceId), 10);
  if (isNaN(serviceId)) { res.status(400).json({ error: "Invalid serviceId" }); return; }

  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  emitToService(serviceId, "user_typing", { userId: req.userId, name: user?.name || "" });

  res.json({ ok: true });
});

router.patch("/services/:serviceId/messages/read", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseInt(String(req.params.serviceId), 10);
  if (isNaN(serviceId)) { res.status(400).json({ error: "Invalid serviceId" }); return; }

  await db.update(messagesTable).set({ isRead: true }).where(
    and(
      eq(messagesTable.serviceId, serviceId),
      ne(messagesTable.senderId, req.userId!),
      eq(messagesTable.isRead, false)
    )
  );

  emitToService(serviceId, "messages_read", { userId: req.userId });
  res.json({ ok: true });
});

export default router;
