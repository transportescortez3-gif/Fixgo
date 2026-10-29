import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Capacitor } from "@capacitor/core";
import { APP_URL } from "@/lib/app-config";

const SOCKET_URL = Capacitor.isNativePlatform()
  ? APP_URL
  : window.location.origin;

let sharedSocket: Socket | null = null;
export type SocketAuthStatus = "checking" | "authenticated" | "unauthenticated" | "disconnected";

let socketAuthStatus: SocketAuthStatus = "checking";
const socketAuthStatusListeners = new Set<(status: SocketAuthStatus) => void>();

function updateSocketAuthStatus(status: SocketAuthStatus): void {
  socketAuthStatus = status;
  socketAuthStatusListeners.forEach((listener) => listener(status));
}

export function getSocketAuthStatus(): SocketAuthStatus {
  return socketAuthStatus;
}

export function subscribeSocketAuthStatus(listener: (status: SocketAuthStatus) => void): () => void {
  socketAuthStatusListeners.add(listener);
  listener(socketAuthStatus);
  return () => socketAuthStatusListeners.delete(listener);
}

// Reference-counted service/thread rooms so multiple components can join/leave safely.
// Key: "serviceId" or "serviceId_wWorkerId"
interface RoomEntry {
  serviceId: number;
  threadWorkerId: number | null;
  refs: number;
}
const serviceRoomRefs = new Map<string, RoomEntry>();

function buildRoomKey(serviceId: number, threadWorkerId: number | null): string {
  return threadWorkerId ? `${serviceId}_w${threadWorkerId}` : `${serviceId}`;
}

function buildJoinPayload(entry: RoomEntry): number | { serviceId: number; threadWorkerId: number } {
  if (entry.threadWorkerId) {
    return { serviceId: entry.serviceId, threadWorkerId: entry.threadWorkerId };
  }
  return entry.serviceId;
}

function buildLeavePayload(serviceId: number, threadWorkerId: number | null): number | { serviceId: number; threadWorkerId: number } {
  if (threadWorkerId) {
    return { serviceId, threadWorkerId };
  }
  return serviceId;
}

export function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: (cb) => cb({ token: localStorage.getItem("fixgo_token") ?? "" }),
    });

    // On every (re)connect: re-join all service/thread rooms still in use.
    // User rooms are auto-joined by the server (socket.join(`user_${uid}`) on connection).
    sharedSocket.on("connect", () => {
      updateSocketAuthStatus("checking");
      serviceRoomRefs.forEach((entry) => {
        sharedSocket!.emit("join_service", buildJoinPayload(entry));
      });
    });
    sharedSocket.on("disconnect", () => updateSocketAuthStatus("disconnected"));
    sharedSocket.on("connect_error", () => updateSocketAuthStatus("disconnected"));
    sharedSocket.on(
      "socket:auth_status",
      (data: { authenticated?: boolean }) =>
        updateSocketAuthStatus(data?.authenticated ? "authenticated" : "unauthenticated"),
    );
  }
  return sharedSocket;
}

/** Call after login, logout, or role change so the new JWT is used in the handshake. */
export function reconnectSocket(): void {
  const token = localStorage.getItem("fixgo_token") ?? "";
  if (sharedSocket) {
    sharedSocket.auth = { token };
    sharedSocket.disconnect().connect();
  }
}

/** Emits join_user — mostly a belt-and-suspenders signal; server auto-joins on connect. */
export function joinUserRoom(userId: number): void {
  getSocket().emit("join_user", userId);
}

interface UseSocketOptions {
  serviceId: number | null;
  /** For pending services: the worker's ID that identifies the chat thread.
   *  Causes the socket to join `service_${serviceId}_w${threadWorkerId}` instead
   *  of the shared `service_${serviceId}` room, preventing message leaks. */
  threadWorkerId?: number | null;
  onNewMessage?: (message: any) => void;
  onUserTyping?: (data: { userId: number; name: string }) => void;
  onUserStopTyping?: (data: { userId: number }) => void;
  onMessagesRead?: (data: { userId: number }) => void;
  onWorkerLocation?: (data: { lat: number; lng: number }) => void;
  onServiceUpdated?: (data: { serviceId: number; status?: string }) => void;
  onProposalUpdated?: (data: { serviceId: number; action: string }) => void;
  onPresenceUpdate?: (data: { userId: number; online: boolean; lastSeen: number | null }) => void;
}

export function useSocket(opts: UseSocketOptions) {
  const { serviceId, threadWorkerId = null } = opts;
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(opts);
  handlersRef.current = opts;

  useEffect(() => {
    if (!serviceId) return;

    const socket = getSocket();
    socketRef.current = socket;

    // Reference-count the room join so multiple callers share it safely
    const key = buildRoomKey(serviceId, threadWorkerId);
    const prev = serviceRoomRefs.get(key);
    serviceRoomRefs.set(key, {
      serviceId,
      threadWorkerId,
      refs: (prev?.refs ?? 0) + 1,
    });

    if (threadWorkerId) {
      socket.emit("join_service", { serviceId, threadWorkerId });
    } else {
      socket.emit("join_service", serviceId);
    }

    const onNewMessage      = (m: any) => handlersRef.current.onNewMessage?.(m);
    const onUserTyping      = (d: any) => handlersRef.current.onUserTyping?.(d);
    const onUserStopTyping  = (d: any) => handlersRef.current.onUserStopTyping?.(d);
    const onMessagesRead    = (d: any) => handlersRef.current.onMessagesRead?.(d);
    const onWorkerLocation  = (d: any) => handlersRef.current.onWorkerLocation?.(d);
    const onServiceUpdated  = (d: any) => handlersRef.current.onServiceUpdated?.(d);
    const onProposalUpdated = (d: any) => handlersRef.current.onProposalUpdated?.(d);
    const onPresenceUpdate  = (d: any) => handlersRef.current.onPresenceUpdate?.(d);

    socket.on("new_message",          onNewMessage);
    socket.on("user_typing",          onUserTyping);
    socket.on("user_stop_typing",     onUserStopTyping);
    socket.on("messages_read",        onMessagesRead);
    socket.on("worker_location_update", onWorkerLocation);
    socket.on("service_updated",      onServiceUpdated);
    socket.on("proposal_updated",     onProposalUpdated);
    socket.on("presence_update",      onPresenceUpdate);

    return () => {
      // Decrement ref count; only leave the room when no one is using it
      const entry = serviceRoomRefs.get(key);
      if (entry) {
        if (entry.refs <= 1) {
          serviceRoomRefs.delete(key);
          socket.emit("leave_service", buildLeavePayload(serviceId, threadWorkerId));
        } else {
          serviceRoomRefs.set(key, { ...entry, refs: entry.refs - 1 });
        }
      }

      socket.off("new_message",           onNewMessage);
      socket.off("user_typing",           onUserTyping);
      socket.off("user_stop_typing",      onUserStopTyping);
      socket.off("messages_read",         onMessagesRead);
      socket.off("worker_location_update", onWorkerLocation);
      socket.off("service_updated",       onServiceUpdated);
      socket.off("proposal_updated",      onProposalUpdated);
      socket.off("presence_update",       onPresenceUpdate);
    };
  }, [serviceId, threadWorkerId]);

  const queryPresence = useCallback((userId: number) => {
    (socketRef.current ?? getSocket()).emit("query_presence", userId);
  }, []);

  const unsubscribePresence = useCallback((userId: number) => {
    (socketRef.current ?? getSocket()).emit("unsubscribe_presence", userId);
  }, []);

  const emitTyping = useCallback((userId: number, name: string) => {
    if (!serviceId || !socketRef.current) return;
    socketRef.current.emit("typing", { serviceId, userId, name, threadWorkerId: threadWorkerId ?? undefined });
  }, [serviceId, threadWorkerId]);

  const emitStopTyping = useCallback((userId: number) => {
    if (!serviceId || !socketRef.current) return;
    socketRef.current.emit("stop_typing", { serviceId, userId, threadWorkerId: threadWorkerId ?? undefined });
  }, [serviceId, threadWorkerId]);

  const emitWorkerLocation = useCallback((lat: number, lng: number) => {
    if (!serviceId || !socketRef.current) return;
    socketRef.current.emit("worker_location", { serviceId, lat, lng });
  }, [serviceId]);

  return { emitTyping, emitStopTyping, emitWorkerLocation, queryPresence, unsubscribePresence };
}
