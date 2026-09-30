import { Server as SocketServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import { verifyToken } from "./auth";
import { db } from "../db";
import { messagesTable } from "../db/schema/messages";
import { usersTable } from "../db/schema/users";
import { servicesTable } from "../db/schema/services";
import { proposalsTable } from "../db/schema/proposals";
import { and, eq, or, sql } from "drizzle-orm";
import { createNotification } from "./createNotification";
import { sendDataMessage } from "./firebase";
import { sendVoipPush } from "./apns";
import { signToken } from "./auth";
import { featureEnabled, getActivePlanForUser } from "./subscription-access";

let io: SocketServer | null = null;

const onlineUsers = new Map<number, number>();
// Sockets confirmados en PRIMER PLANO por usuario (reportado explícitamente por
// el cliente vía `app:state`). NO es lo mismo que "tener socket conectado": un
// socket puede seguir vivo con la app en background. Se usa para decidir si se
// envía el push de llamada entrante nativo (solo cuando NO hay foreground).
const foregroundSockets = new Map<number, Set<string>>();
const lastSeenAt = new Map<number, number>();
const presenceSubscribers = new Map<number, Set<number>>();
const allowedPairCache = new Map<string, number>();
const ALLOWED_PAIR_TTL_MS = 5 * 60 * 1000;
const workerAvailableCache = new Map<number, { available: boolean; ts: number }>();
const workerLastPersist = new Map<number, number>();
const WORKER_CACHE_TTL_MS = 60_000;

// ─── Viewers en tiempo real por servicio ────────────────────────────────────
// serviceId → Set<workerId> de workers que están mirando esa solicitud ahora
const serviceViewers = new Map<number, Set<number>>();
// workerId → Set<serviceId> para limpiar al desconectar
const workerViewedServices = new Map<number, Set<number>>();

async function notifyServiceViewers(serviceId: number): Promise<void> {
  if (!io || !Number.isInteger(serviceId) || serviceId <= 0) return;
  try {
    const rows = await db.execute(sql`SELECT client_id FROM services WHERE id = ${serviceId} LIMIT 1`);
    const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0];
    if (!row) return;
    const clientId = row.client_id ?? row.clientId;
    if (!clientId) return;
    const viewers = serviceViewers.get(serviceId);
    const count = viewers?.size ?? 0;
    const viewerIds = viewers ? [...viewers] : [];
    io.to(`user_${clientId}`).emit("service:viewers_count", { serviceId, count, viewerIds });
  } catch (err) {
    console.error("notifyServiceViewers failed:", err);
  }
}

// ─── Seguimiento de llamadas para registrar "llamada perdida" ───────────────
interface PendingCall {
  callerId: number;
  calleeId: number;
  serviceId: number;
  callerName: string;
  // Guardamos la oferta SDP para poder re-emitir `call:incoming` cuando el
  // destinatario abre la app (p.ej. tras tocar "Contestar" en la pantalla
  // nativa de llamada con la app cerrada) y su socket recién se conecta.
  offer: RTCSessionDescriptionInit | null;
  // Guardamos el answer SDP para poder re-emitir `call:answered` si el caller
  // pierde el socket en el momento exacto en que contestaron y no lo recibió.
  answerSdp: RTCSessionDescriptionInit | null;
  answered: boolean;
  finalized: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  // Timestamp en que se contestó (para limpiar answered calls después de ~2 min)
  answeredAt: number | null;
}
const pendingCalls = new Map<string, PendingCall>();
const CALL_RING_TIMEOUT_MS = 75_000;
// Tiempo máximo que guardamos un call ya contestado (para re-enviar call:answered
// si el caller reconecta). Después de esto ya no tiene sentido guardarlo.
const ANSWERED_CALL_CLEANUP_MS = 2 * 60_000;

function callKey(callerId: number, calleeId: number): string {
  return `call:${callerId}->${calleeId}`;
}

/**
 * Despierta al dispositivo Android del destinatario aunque la app esté cerrada,
 * enviando un push FCM data-only de alta prioridad. El servicio nativo
 * (FixgoMessagingService) muestra la pantalla de llamada entrante. Incluye un
 * `rejectToken` firmado de corta duración para que el botón "Rechazar" pueda
 * registrar la llamada perdida vía HTTP sin necesitar la sesión web.
 */
async function sendIncomingCallPush(call: PendingCall): Promise<void> {
  try {
    const [callee] = await db
      .select({ fcmToken: usersTable.fcmToken, voipToken: usersTable.voipToken })
      .from(usersTable)
      .where(eq(usersTable.id, call.calleeId))
      .limit(1);
    if (!callee?.fcmToken && !callee?.voipToken) return;

    // Token de rechazo de corta duración (la llamada suena ~75s); limita la
    // ventana de replay vs. el JWT de sesión de 7 días.
    const rejectToken = signToken({
      id: call.calleeId,
      email: `call_reject:${call.callerId}->${call.calleeId}`,
      role: "call_reject",
    }, "120s");

    const data = {
      type: "incoming_call",
      callerId: String(call.callerId),
      calleeId: String(call.calleeId),
      serviceId: String(call.serviceId),
      callerName: call.callerName || "Llamada entrante",
      rejectToken,
    };

    // Android: FCM data-only (despierta FixgoMessagingService).
    // iOS: push VoIP por APNs (despierta PushKit → CallKit). Cada plataforma usa
    // su propio token; un usuario puede tener uno, otro o ambos.
    if (callee.fcmToken) {
      await sendDataMessage(callee.fcmToken, data);
    }
    if (callee.voipToken) {
      await sendVoipPush(callee.voipToken, data);
    }
  } catch (err) {
    console.error("sendIncomingCallPush failed:", err);
  }
}

/** Dismiss de la pantalla de llamada nativa (caller colgó / contestó / etc.). */
async function sendCancelCallPush(calleeId: number, callerId: number): Promise<void> {
  try {
    const [callee] = await db
      .select({ fcmToken: usersTable.fcmToken, voipToken: usersTable.voipToken })
      .from(usersTable)
      .where(eq(usersTable.id, calleeId))
      .limit(1);
    if (!callee?.fcmToken && !callee?.voipToken) return;
    const data = {
      type: "cancel_call",
      callerId: String(callerId),
      calleeId: String(calleeId),
    };
    if (callee.fcmToken) {
      await sendDataMessage(callee.fcmToken, data);
    }
    // iOS: un nuevo push VoIP DEBE reportar una llamada a CallKit; el delegate
    // nativo distingue por `type` y, si es cancel_call, cierra la llamada en
    // curso (CXEndCall) en vez de reportar una nueva entrante.
    if (callee.voipToken) {
      await sendVoipPush(callee.voipToken, data);
    }
  } catch (err) {
    console.error("sendCancelCallPush failed:", err);
  }
}

/**
 * Re-emite `call:incoming` a un destinatario que acaba de conectar su socket si
 * tiene una llamada pendiente sin contestar. Esto entrega la oferta SDP a la app
 * recién abierta para que pueda contestar (flujo "app cerrada → Contestar").
 */
function reemitPendingIncoming(calleeId: number): void {
  if (!io) return;
  for (const call of pendingCalls.values()) {
    if (call.calleeId === calleeId && !call.answered && !call.finalized && call.offer) {
      io.to(`user_${calleeId}`).emit("call:incoming", {
        fromUserId: call.callerId,
        serviceId: call.serviceId,
        offer: call.offer,
        callerName: call.callerName,
      });
    }
  }
}

/**
 * Re-emite `call:answered` al caller que acaba de reconectar su socket si la
 * llamada fue contestada mientras estaba desconectado. Soluciona el caso en que
 * el callee contestó, el servidor emitió `call:answered`, pero el caller tuvo
 * una caída momentánea del socket en ese instante y perdió el evento.
 * El answer SDP se guarda hasta 2 minutos después de contestarse.
 */
function reemitPendingAnswered(callerId: number): void {
  if (!io) return;
  const now = Date.now();
  for (const [key, call] of pendingCalls.entries()) {
    if (call.callerId !== callerId || !call.answered || call.finalized || !call.answerSdp || !call.answeredAt) continue;
    if (now - call.answeredAt >= ANSWERED_CALL_CLEANUP_MS) {
      pendingCalls.delete(key);
      continue;
    }
    io.to(`user_${callerId}`).emit("call:answered", {
      fromUserId: call.calleeId,
      answer: call.answerSdp,
    });
  }
}

/**
 * Registra el rechazo de una llamada desde el botón nativo "Rechazar" (vía HTTP
 * con rejectToken). Notifica al que llama y genera el mensaje de llamada perdida.
 */
export async function rejectPendingCall(callerId: number, calleeId: number): Promise<void> {
  const call = pendingCalls.get(callKey(callerId, calleeId));
  // Solo notificar el rechazo si la llamada sigue PENDIENTE y SIN contestar.
  // Un reject tardío o reenviado (replay dentro del TTL del token) sobre una
  // llamada ya contestada/finalizada no debe emitir `call:rejected`, porque eso
  // tiraría abajo una llamada activa en el lado del que llama.
  if (!call || call.answered || call.finalized) return;
  if (io) io.to(`user_${callerId}`).emit("call:rejected", { fromUserId: calleeId });
  await finalizeMissedCall(callKey(callerId, calleeId));
}

async function finalizeMissedCall(key: string): Promise<void> {
  const call = pendingCalls.get(key);
  if (!call || call.finalized) return;
  call.finalized = true;
  if (call.timer) clearTimeout(call.timer);
  pendingCalls.delete(key);
  if (call.answered) return; // contestada → no es perdida

  // Cierre garantizado de la pantalla de llamada nativa del destinatario en
  // CUALQUIER final no contestado (timeout 75s, rechazo web/nativo, o el caller
  // que cuelga/se cae). Es el único punto donde convergen todos esos casos.
  void sendCancelCallPush(call.calleeId, call.callerId);

  try {
    const [service] = await db.select({
      clientId: servicesTable.clientId,
      workerId: servicesTable.workerId,
      status: servicesTable.status,
    }).from(servicesTable).where(eq(servicesTable.id, call.serviceId)).limit(1);
    if (!service) return;

    // Autorización: ambos usuarios deben ser participantes legítimos del
    // servicio antes de persistir el mensaje (evita IDOR vía señalización).
    const ids = [call.callerId, call.calleeId];
    const isPending = service.status === "pending";
    let threadWorkerId: number | undefined = undefined;
    let authorized = false;

    if (!isPending) {
      // Servicio asignado: solo cliente y trabajador asignado son participantes.
      authorized =
        service.workerId != null &&
        service.clientId !== service.workerId &&
        ids.includes(service.clientId) &&
        ids.includes(service.workerId);
      // El hilo post-aceptación es siempre el del trabajador asignado; sin esto
      // el mensaje "Llamada perdida" se guardaba con workerId NULL y el
      // historial (que filtra por workerId) nunca lo devolvía.
      if (authorized) threadWorkerId = service.workerId ?? undefined;
    } else if (ids.includes(service.clientId)) {
      // Pendiente: un lado es el cliente, el otro un trabajador con propuesta.
      const workerSide = call.callerId === service.clientId ? call.calleeId : call.callerId;
      if (workerSide !== service.clientId) {
        const [prop] = await db.select({ id: proposalsTable.id })
          .from(proposalsTable)
          .where(and(
            eq(proposalsTable.serviceId, call.serviceId),
            eq(proposalsTable.workerId, workerSide),
          )).limit(1);
        if (prop) {
          authorized = true;
          threadWorkerId = workerSide;
        }
      }
    }

    if (!authorized) return;

    const [message] = await db.insert(messagesTable).values({
      serviceId: call.serviceId,
      senderId: call.callerId,
      workerId: threadWorkerId,
      content: "Llamada perdida",
      messageType: "missed_call",
    } as any).returning();

    const [sender] = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
    }).from(usersTable).where(eq(usersTable.id, call.callerId)).limit(1);

    const fullMessage = { ...message, sender };
    if (isPending && threadWorkerId) {
      // Fase pendiente: emitir solo al hilo cliente↔trabajador, igual que los
      // mensajes de texto (otros trabajadores no deben ver esta llamada perdida).
      emitToServiceThread(call.serviceId, threadWorkerId, "new_message", fullMessage);
    } else {
      emitToService(call.serviceId, "new_message", fullMessage);
    }
    emitToUser(call.calleeId, "new_message", fullMessage);

    // Determinar el rol del destinatario dentro del servicio para aislar
    // la notificación al rol correcto (evita que se cruce entre cliente y experto).
    const calleeTargetRole: "client" | "worker" =
      call.calleeId === service.clientId ? "client" : "worker";

    await createNotification({
      userId: call.calleeId,
      title: "Llamada perdida",
      message: `Tienes una llamada perdida de ${call.callerName || sender?.name || "alguien"}`,
      type: "new_message",
      relatedId: call.serviceId,
      targetRole: calleeTargetRole,
    });
  } catch (err) {
    console.error("finalizeMissedCall failed:", err);
  }
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function canViewPresence(requesterId: number, targetId: number): Promise<boolean> {
  if (requesterId === targetId) return true;
  const key = pairKey(requesterId, targetId);
  const cached = allowedPairCache.get(key);
  if (cached && Date.now() - cached < ALLOWED_PAIR_TTL_MS) return true;
  try {
    const [reqUser] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, requesterId)).limit(1);
    if (reqUser?.role === "admin") {
      allowedPairCache.set(key, Date.now());
      return true;
    }
    const [row] = await db.select({ id: messagesTable.id }).from(messagesTable).where(
      or(
        and(eq(messagesTable.senderId, requesterId), eq(messagesTable.workerId, targetId)),
        and(eq(messagesTable.senderId, targetId), eq(messagesTable.workerId, requesterId)),
      ),
    ).limit(1);
    if (row) {
      allowedPairCache.set(key, Date.now());
      return true;
    }
  } catch (err) {
    console.error("canViewPresence error:", err);
  }
  return false;
}

function emitPresenceToUser(targetUserId: number, recipientUserId: number): void {
  if (!io) return;
  const online = (onlineUsers.get(targetUserId) || 0) > 0;
  const payload = {
    userId: targetUserId,
    online,
    lastSeen: online ? null : (lastSeenAt.get(targetUserId) || null),
  };
  io.to(`user_${recipientUserId}`).emit("presence_update", payload);
}

function notifySubscribers(userId: number): void {
  const subs = presenceSubscribers.get(userId);
  if (!subs || subs.size === 0) return;
  subs.forEach((subId) => emitPresenceToUser(userId, subId));
}

export async function initSocketIO(httpServer: HTTPServer): Promise<SocketServer> {
  const capacitorOrigins = ["https://localhost", "capacitor://localhost", "http://localhost"];
  const corsOrigin = process.env.APP_URL
    ? [process.env.APP_URL, ...capacitorOrigins]
    : "*";

  io = new SocketServer(httpServer, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
    path: "/socket.io",
    // Optimizaciones para alta concurrencia
    pingTimeout: 20_000,
    pingInterval: 25_000,
    upgradeTimeout: 10_000,
    maxHttpBufferSize: 1e6, // 1 MB
  });

  // Redis adapter — si REDIS_URL está configurada, Socket.io puede escalar
  // horizontalmente en múltiples instancias de Railway sin perder mensajes
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = await import("redis");
      const { createAdapter } = await import("@socket.io/redis-adapter");

      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      pubClient.on("error", (err: Error) => console.error("Redis pub error:", err.message));
      subClient.on("error", (err: Error) => console.error("Redis sub error:", err.message));

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.info("Socket.io usando Redis adapter (modo multi-instancia)");
    } catch (err) {
      console.error("Redis adapter no pudo inicializarse, usando modo single-process:", err);
    }
  } else {
    console.info("Socket.io en modo single-process (configura REDIS_URL para multi-instancia)");
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token && typeof token === "string") {
      const payload = verifyToken(token);
      if (payload) {
        socket.data.userId = payload.id;
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    const uid = socket.data.userId as number | undefined;
    if (uid) {
      socket.join(`user_${uid}`);
      onlineUsers.set(uid, (onlineUsers.get(uid) || 0) + 1);
      notifySubscribers(uid);
      // Si la app se acaba de abrir (p.ej. tras "Contestar" en la pantalla
      // nativa con la app cerrada), entregar la oferta de cualquier llamada
      // pendiente para que pueda contestarse.
      reemitPendingIncoming(uid);
      // Si el caller reconecta y la llamada ya fue contestada pero él perdió
      // el call:answered por la caída del socket, reenviarlo ahora.
      reemitPendingAnswered(uid);
      // Re-emitir alertas activas pendientes para workers que abren la app
      // después de que se publicaron órdenes cercanas (import dinámico para
      // evitar dependencia circular con service-motor que importa de socketio).
      setTimeout(() => {
        import("./service-motor").then(({ reemitActiveAlertsForWorker, reemitOpenServicesForWorker }) => {
          reemitActiveAlertsForWorker(uid!).catch(() => {});
          reemitOpenServicesForWorker(uid!).catch(() => {});
        });
      }, 800);
    }

    // Estado de ciclo de vida de la app (foreground/background) reportado por el
    // cliente. Default conservador: un socket recién conectado NO se asume en
    // foreground; solo este evento explícito lo marca. Así la supresión del push
    // nativo depende de un foreground CONFIRMADO, nunca de la conectividad.
    socket.on("app:state", (data: { foreground?: boolean }) => {
      if (!uid) return;
      let set = foregroundSockets.get(uid);
      if (data?.foreground) {
        if (!set) { set = new Set(); foregroundSockets.set(uid, set); }
        set.add(socket.id);
      } else if (set) {
        set.delete(socket.id);
        if (set.size === 0) foregroundSockets.delete(uid);
      }
    });

    socket.on("disconnect", () => {
      if (!uid) return;
      const fg = foregroundSockets.get(uid);
      if (fg) {
        fg.delete(socket.id);
        if (fg.size === 0) foregroundSockets.delete(uid);
      }
      const count = (onlineUsers.get(uid) || 1) - 1;
      if (count <= 0) {
        onlineUsers.delete(uid);
        lastSeenAt.set(uid, Date.now());
        presenceSubscribers.forEach((subs, targetId) => {
          if (subs.delete(uid) && subs.size === 0) presenceSubscribers.delete(targetId);
        });
      } else {
        onlineUsers.set(uid, count);
      }
      // Limpiar viewers de servicios al desconectar
      const viewedSvcs = workerViewedServices.get(uid);
      if (viewedSvcs && viewedSvcs.size > 0) {
        const svcIds = [...viewedSvcs];
        workerViewedServices.delete(uid);
        for (const sid of svcIds) {
          serviceViewers.get(sid)?.delete(uid);
          void notifyServiceViewers(sid);
        }
      }
      notifySubscribers(uid);
    });

    socket.on("query_presence", async (userId: number) => {
      if (typeof userId !== "number" || !uid) return;
      const allowed = await canViewPresence(uid, userId);
      if (!allowed) return;
      let subs = presenceSubscribers.get(userId);
      if (!subs) { subs = new Set(); presenceSubscribers.set(userId, subs); }
      subs.add(uid);
      emitPresenceToUser(userId, uid);
    });

    socket.on("unsubscribe_presence", (userId: number) => {
      if (typeof userId !== "number" || !uid) return;
      const subs = presenceSubscribers.get(userId);
      if (subs) {
        subs.delete(uid);
        if (subs.size === 0) presenceSubscribers.delete(userId);
      }
    });

    socket.on("join_service", async (payload: number | { serviceId: number; threadWorkerId?: number | null }) => {
      const userId = socket.data.userId;
      if (!userId) return;

      let serviceId: number;
      let threadWorkerId: number | null = null;

      if (typeof payload === "number") {
        serviceId = payload;
      } else if (payload && typeof payload === "object" && typeof (payload as any).serviceId === "number") {
        serviceId = (payload as any).serviceId;
        const tw = (payload as any).threadWorkerId;
        threadWorkerId = typeof tw === "number" ? tw : null;
      } else {
        return;
      }

      if (!Number.isInteger(serviceId) || serviceId <= 0) return;

      try {
        const [service] = await db.select({
          clientId: servicesTable.clientId,
          workerId: servicesTable.workerId,
          status: servicesTable.status,
        }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);

        if (!service) return;

        const isPending = ["pending", "alerting", "open"].includes(service.status ?? "");
        const isClient = service.clientId === userId;
        const isAssignedWorker = service.workerId === userId;

        if (isPending) {
          if (isClient) {
            // El cliente puede unirse al hilo de un trabajador específico o a la sala general
            if (threadWorkerId) {
              socket.join(`service_${serviceId}_w${threadWorkerId}`);
            } else {
              socket.join(`service_${serviceId}`);
            }
          } else {
            // Trabajador: solo puede unirse a SU PROPIO hilo, nunca al de otro
            const myThread = threadWorkerId ?? userId;
            if (myThread !== userId) return; // intento de acceso a hilo ajeno
            socket.join(`service_${serviceId}_w${userId}`);
          }
        } else {
          // Servicio aceptado/en-progreso: solo los participantes asignados
          if (!isClient && !isAssignedWorker) return;
          socket.join(`service_${serviceId}`);
        }
      } catch (err) {
        console.error("[join_service] auth error:", err);
      }
    });

    socket.on("leave_service", (payload: number | { serviceId: number; threadWorkerId?: number | null }) => {
      if (!socket.data.userId) return;

      let serviceId: number;
      let threadWorkerId: number | null = null;

      if (typeof payload === "number") {
        serviceId = payload;
      } else if (payload && typeof payload === "object" && typeof (payload as any).serviceId === "number") {
        serviceId = (payload as any).serviceId;
        const tw = (payload as any).threadWorkerId;
        threadWorkerId = typeof tw === "number" ? tw : null;
      } else {
        return;
      }

      if (threadWorkerId) {
        socket.leave(`service_${serviceId}_w${threadWorkerId}`);
      } else {
        socket.leave(`service_${serviceId}`);
      }
    });

    socket.on("join_direct", (conversationId: number) => {
      if (!socket.data.userId) return;
      socket.join(`direct_${conversationId}`);
    });

    socket.on("leave_direct", (conversationId: number) => {
      if (!socket.data.userId) return;
      socket.leave(`direct_${conversationId}`);
    });

    // ── Tracking de viewers en tiempo real por servicio ──────────────────────
    socket.on("service:view_start", (serviceId: number) => {
      const workerId = socket.data.userId;
      if (!workerId || typeof serviceId !== "number" || !Number.isInteger(serviceId)) return;
      let viewers = serviceViewers.get(serviceId);
      if (!viewers) { viewers = new Set(); serviceViewers.set(serviceId, viewers); }
      viewers.add(workerId);
      let viewed = workerViewedServices.get(workerId);
      if (!viewed) { viewed = new Set(); workerViewedServices.set(workerId, viewed); }
      viewed.add(serviceId);
      void notifyServiceViewers(serviceId);
    });

    socket.on("service:view_end", (serviceId: number) => {
      const workerId = socket.data.userId;
      if (!workerId || typeof serviceId !== "number") return;
      serviceViewers.get(serviceId)?.delete(workerId);
      workerViewedServices.get(workerId)?.delete(serviceId);
      void notifyServiceViewers(serviceId);
    });

    socket.on("join_user", (userId: number) => {
      if (socket.data.userId === userId) {
        socket.join(`user_${userId}`);
      }
    });

    socket.on("leave_user", (userId: number) => {
      if (socket.data.userId === userId) {
        socket.leave(`user_${userId}`);
      }
    });

    socket.on("typing", ({ serviceId, name, threadWorkerId }: { serviceId: number; userId: number; name: string; threadWorkerId?: number | null }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const room = threadWorkerId ? `service_${serviceId}_w${threadWorkerId}` : `service_${serviceId}`;
      socket.to(room).emit("user_typing", { userId, name });
    });

    socket.on("stop_typing", ({ serviceId, threadWorkerId }: { serviceId: number; userId: number; threadWorkerId?: number | null }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const room = threadWorkerId ? `service_${serviceId}_w${threadWorkerId}` : `service_${serviceId}`;
      socket.to(room).emit("user_stop_typing", { userId });
    });

    socket.on("direct_typing", ({ conversationId, name }: { conversationId: number; name: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      socket.to(`direct_${conversationId}`).emit("direct_user_typing", { userId, name });
    });

    socket.on("direct_stop_typing", ({ conversationId }: { conversationId: number }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      socket.to(`direct_${conversationId}`).emit("direct_user_stop_typing", { userId });
    });

    socket.on("worker_location", ({ serviceId, lat, lng }: { serviceId: number; lat: number; lng: number }) => {
      // Sólo workers autenticados pueden enviar actualizaciones de ubicación
      if (!socket.data.userId) return;
      socket.to(`service_${serviceId}`).emit("worker_location_update", { lat, lng });
    });

    // ── Ubicación en vivo de workers (broadcast global) ───────────────────
    // Permite que los clientes vean en su mapa los workers cercanos moviéndose
    // en tiempo real (sin esperar al polling de 8s).
    socket.on("worker:live_location", async ({ lat, lng }: { lat: number; lng: number }) => {
      const workerId = socket.data.userId;
      if (!workerId || typeof lat !== "number" || typeof lng !== "number") return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

      // Verificar que es un worker disponible (cache simple para evitar query por cada update)
      const cached = workerAvailableCache.get(workerId);
      const now = Date.now();
      let isWorkerAvailable = cached?.available ?? false;
      if (!cached || now - cached.ts > WORKER_CACHE_TTL_MS) {
        try {
          const [row] = await db
            .select({ role: usersTable.role, isAvailable: usersTable.isAvailable })
            .from(usersTable)
            .where(eq(usersTable.id, workerId))
            .limit(1);
          isWorkerAvailable = !!(row && row.role === "worker" && row.isAvailable);
          workerAvailableCache.set(workerId, { available: isWorkerAvailable, ts: now });
        } catch (err) {
          console.error("worker:live_location availability check failed:", err);
          return;
        }
      }
      if (!isWorkerAvailable) return;

      // Broadcast global a todos los clientes conectados
      io!.emit("worker:moved", { workerId, lat, lng });

      // Persistir en DB (throttled — máx 1 update cada 30s por worker)
      const lastPersist = workerLastPersist.get(workerId) || 0;
      if (now - lastPersist >= 30_000) {
        workerLastPersist.set(workerId, now);
        db.update(usersTable)
          .set({ lat, lng })
          .where(eq(usersTable.id, workerId))
          .catch((err) => console.error("worker location persist failed:", err));
      }
    });

    // ─── Señalización WebRTC para llamadas de voz ───────────────────────────
    function validTarget(toUserId: unknown, selfId: number | undefined): toUserId is number {
      return (
        typeof toUserId === "number" &&
        Number.isInteger(toUserId) &&
        toUserId > 0 &&
        toUserId !== selfId
      );
    }

    socket.on("call:offer", async ({ toUserId, serviceId, offer, callerName }: {
      toUserId: number; serviceId: number;
      offer: RTCSessionDescriptionInit; callerName: string;
    }) => {
      const callerId = socket.data.userId;
      if (!callerId || !validTarget(toUserId, callerId)) return;
      const callerPlan = await getActivePlanForUser(callerId);
      if (!featureEnabled(callerPlan, "voice_calls")) {
        socket.emit("call:blocked", { message: "Las llamadas están disponibles desde el plan Pro." });
        return;
      }
      console.log(`[call:offer] caller=${callerId} → callee=${callerId}->${toUserId} service=${serviceId}`);
      io!.to(`user_${toUserId}`).emit("call:incoming", { fromUserId: callerId, serviceId, offer, callerName });

      // Registrar llamada pendiente para detectar "llamada perdida"
      const key = callKey(callerId, toUserId);
      const existing = pendingCalls.get(key);
      if (existing?.timer) clearTimeout(existing.timer);
      const timer = setTimeout(() => { void finalizeMissedCall(key); }, CALL_RING_TIMEOUT_MS);
      const pending: PendingCall = {
        callerId, calleeId: toUserId, serviceId, offer: offer ?? null,
        callerName: callerName || "", answered: false, finalized: false, timer,
        answerSdp: null, answeredAt: null,
      };
      pendingCalls.set(key, pending);

      // Despertar al dispositivo del destinatario con el push de pantalla
      // completa SOLO si NO tiene la app en primer plano (background, bloqueada
      // o cerrada). Si está en foreground confirmado, el relay por socket de
      // arriba ya muestra el overlay web; enviar también el push duplicaría la
      // pantalla. Se usa el estado real del ciclo de vida (reportado por
      // `app:state`), NO la mera conectividad del socket.
      const calleeForeground = (foregroundSockets.get(toUserId)?.size || 0) > 0;
      if (!calleeForeground) {
        void sendIncomingCallPush(pending);
      }
    });

    socket.on("call:answer", ({ toUserId, answer }: { toUserId: number; answer: RTCSessionDescriptionInit }) => {
      const selfId = socket.data.userId;
      if (!selfId || !validTarget(toUserId, selfId)) return;
      console.log(`[call:answer] callee=${selfId} → caller=${toUserId}`);
      io!.to(`user_${toUserId}`).emit("call:answered", { fromUserId: selfId, answer });

      // Quien contesta es el destinatario (selfId); el caller es toUserId
      const key = callKey(toUserId, selfId);
      const call = pendingCalls.get(key);
      if (call) {
        call.answered = true;
        call.answerSdp = answer ?? null;
        call.answeredAt = Date.now();
        if (call.timer) clearTimeout(call.timer);
        // NO borramos el pendingCall aquí. Lo guardamos 2 minutos para poder
        // re-emitir call:answered si el caller reconecta y perdió el evento
        // (caída momentánea del socket justo en el momento de contestar).
        // reemitPendingAnswered limpia los calls viejos al reconectar el caller.
      }
      // Dismiss la pantalla nativa de llamada en los dispositivos del callee
      // (necesario cuando contestó desde la web overlay y CallKit aún mostraba
      // la pantalla entrante). En iOS, reportCall(endedAt:.remoteEnded) cierra
      // CallKit sin disparar CXEndCallAction ni el evento JS callEnded, por lo
      // que esto NO interrumpe la llamada WebRTC activa.
      void sendCancelCallPush(selfId, toUserId);
    });

    socket.on("call:ice", ({ toUserId, candidate }: { toUserId: number; candidate: RTCIceCandidateInit }) => {
      const selfId = socket.data.userId;
      if (!selfId || !validTarget(toUserId, selfId)) return;
      const typ = candidate?.candidate?.match(/typ (\w+)/)?.[1] ?? "?";
      const proto = candidate?.candidate?.match(/UDP|TCP/i)?.[0]?.toLowerCase() ?? "?";
      if (typ === "relay") {
        console.log(`[call:ice] ✅ RELAY candidate user=${selfId}→${toUserId} proto=${proto}`);
      }
      io!.to(`user_${toUserId}`).emit("call:ice", { fromUserId: selfId, candidate });
    });

    socket.on("call:end", ({ toUserId }: { toUserId: number }) => {
      const selfId = socket.data.userId;
      if (!selfId || !validTarget(toUserId, selfId)) return;
      console.log(`[call:end] user=${selfId} → user=${toUserId}`);
      io!.to(`user_${toUserId}`).emit("call:ended", { fromUserId: selfId });

      // El que cuelga puede ser el caller o el callee — intentar ambas claves.
      // finalizeMissedCall es idempotente y no crea mensaje si fue contestada.
      // El dismiss de la pantalla nativa lo emite finalizeMissedCall (único
      // chokepoint) cuando la llamada no fue contestada.
      void finalizeMissedCall(callKey(selfId, toUserId));
      void finalizeMissedCall(callKey(toUserId, selfId));
    });

    socket.on("call:reject", ({ toUserId }: { toUserId: number }) => {
      const selfId = socket.data.userId;
      if (!selfId || !validTarget(toUserId, selfId)) return;
      io!.to(`user_${toUserId}`).emit("call:rejected", { fromUserId: selfId });

      // Quien rechaza es el destinatario (selfId); el caller es toUserId
      void finalizeMissedCall(callKey(toUserId, selfId));
    });
    // ───────────────────────────────────────────────────────────────────────
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

export function emitToService(serviceId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`service_${serviceId}`).emit(event, data);
}

export function emitToServiceThread(serviceId: number, threadWorkerId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`service_${serviceId}_w${threadWorkerId}`).emit(event, data);
}

export function emitToUser(userId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user_${userId}`).emit(event, data);
}

export function emitToDirect(conversationId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`direct_${conversationId}`).emit(event, data);
}

export function emitToWorkers(workerIds: number[], event: string, data: unknown): void {
  if (!io) return;
  workerIds.forEach(id => io!.to(`user_${id}`).emit(event, data));
}

export function getOnlineUserSet(): Set<number> {
  return new Set(onlineUsers.keys());
}
