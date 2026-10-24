import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { getSocket } from "@/hooks/use-socket";
import { useAuth } from "@/hooks/use-auth";
import { Star, MapPin, Crown, Zap, X, ArrowRight } from "lucide-react";
import { ClientIdentity } from "@/components/client-identity";
import { promptServiceRequestOverlayPermissionIfNeeded } from "@/plugins/service-request-alerts";
import {
  mergeIncomingServiceAlert,
  type QueuedServiceAlert,
  type ServiceAlertPayload,
} from "@/lib/service-alert-state";

async function patchAlertSession(serviceId: number, action: "skip" | "view") {
  const token = localStorage.getItem("fixgo_token") ?? "";
  await fetch(`/api/alert-sessions/${serviceId}/${action}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
    credentials: "include",
  }).catch(() => {});
}

// ─── Estado a nivel de módulo ─────────────────────────────────────────────────
// Persiste la cola de alertas a través de remounts (navegación entre páginas).
// Si el componente se desmonta y vuelve a montar (e.g. auth re-check), la cola
// y los expiresAt originales se conservan — el countdown NO se reinicia.
let _moduleQueue: QueuedServiceAlert[] = [];
const _moduleHandledIds = new Set<number>();

export default function ServiceAlertModal() {
  const { isWorker } = useAuth();
  const [, navigate] = useLocation();

  // Inicializar desde el módulo para que el remount recupere la cola existente
  const [queue, setQueueState] = useState<QueuedServiceAlert[]>(_moduleQueue);
  const [secondsLeft, setSecondsLeft] = useState(60);

  // Wrapper que sincroniza React state ↔ módulo en cada cambio
  const setQueue = useCallback((fn: QueuedServiceAlert[] | ((prev: QueuedServiceAlert[]) => QueuedServiceAlert[])) => {
    setQueueState(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      _moduleQueue = next;
      return next;
    });
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const handledRef = useRef(false);

  const currentAlert = queue[0] ?? null;
  const pendingCount = queue.length - 1;

  // ─── Audio ────────────────────────────────────────────────────────────────
  const playBeep = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (_) {}
  }, []);

  const stopAudio = useCallback(() => {
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null; }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startAudio = useCallback(() => {
    stopAudio();
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      playBeep();
      beepIntervalRef.current = setInterval(playBeep, 1200);
    } catch (_) {}
  }, [playBeep, stopAudio]);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const removeFromQueue = useCallback((serviceId: number) => {
    setQueue(prev => prev.filter(a => a.serviceId !== serviceId));
  }, []);

  const handleSkip = useCallback(async (serviceId: number) => {
    if (_moduleHandledIds.has(serviceId)) return;
    _moduleHandledIds.add(serviceId);
    removeFromQueue(serviceId);
    await patchAlertSession(serviceId, "skip");
  }, [removeFromQueue]);

  const handleView = useCallback(async (serviceId: number) => {
    if (_moduleHandledIds.has(serviceId)) return;
    _moduleHandledIds.add(serviceId);
    removeFromQueue(serviceId);
    await patchAlertSession(serviceId, "view");
    navigate(`/services/${serviceId}`);
    void promptServiceRequestOverlayPermissionIfNeeded();
  }, [removeFromQueue, navigate]);

  // ─── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isWorker) return;
    const socket = getSocket();
    if (!socket) return;

    const handleActiveAlert = (payload: ServiceAlertPayload) => {
      setQueue(prev => {
        const merged = mergeIncomingServiceAlert(prev, payload);
        if (merged.resetHandled) _moduleHandledIds.delete(payload.serviceId);
        return merged.queue;
      });
    };

    socket.on("service:active_alert", handleActiveAlert);
    socket.on("service:alert_expired", ({ serviceId }: { serviceId: number }) => removeFromQueue(serviceId));
    socket.on("service:taken", ({ serviceId }: { serviceId: number }) => removeFromQueue(serviceId));
    // Re-fetch an alert that arrived before authentication finished mounting this modal.
    socket.emit("service:replay_active_alerts");

    return () => {
      socket.off("service:active_alert", handleActiveAlert);
      socket.off("service:alert_expired");
      socket.off("service:taken");
    };
  }, [isWorker, removeFromQueue]);

  // ─── Countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentAlert) {
      stopAudio(); stopCountdown(); handledRef.current = false; return;
    }
    handledRef.current = false;
    const computeLeft = () => Math.max(0, Math.floor((currentAlert.expiresAt - Date.now()) / 1000));
    setSecondsLeft(computeLeft());
    startAudio();
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
    stopCountdown();
    countdownRef.current = setInterval(() => {
      const left = computeLeft();
      setSecondsLeft(left);
      if (left <= 0) { stopCountdown(); stopAudio(); handleSkip(currentAlert.serviceId); }
    }, 500);
    return () => { stopCountdown(); };
  }, [currentAlert?.serviceId, currentAlert?.expiresAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setQueue(prev => prev.filter(a => a.expiresAt > now));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  const isProMax = currentAlert?.phase === "promax";
  const totalSec = currentAlert?.totalSeconds ?? 60;
  const progress = currentAlert ? Math.max(0, Math.min(1, secondsLeft / totalSec)) : 1;
  const isUrgent = secondsLeft <= 10;

  // Colores según plan y urgencia
  const amber = "#f59e0b";
  const blue  = "#1a8cf8";
  const red   = "#ef4444";
  const mainColor = isUrgent ? red : isProMax ? amber : blue;

  // Timer circular
  const R = 18;
  const circ = 2 * Math.PI * R;
  const dash = circ * (1 - progress);

  return (
    <AnimatePresence>
      {currentAlert && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[9998]"
            style={{ background: "rgba(0,0,0,0.3)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => handleSkip(currentAlert.serviceId)}
          />

          {/* Tarjeta */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentAlert.serviceId}
              className="fixed z-[9999]"
              style={{
                top: 12,
                left: 12,
                right: 12,
                maxWidth: 420,
                margin: "0 auto",
              }}
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.75 }}
            >
              {/* Glow exterior */}
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  boxShadow: isProMax
                    ? `0 0 0 1px rgba(245,158,11,0.5), 0 20px 60px rgba(245,158,11,0.25)`
                    : `0 0 0 1px rgba(26,140,248,0.45), 0 20px 60px rgba(26,140,248,0.2)`,
                  borderRadius: 24,
                }}
              />

              <div
                className="relative overflow-hidden rounded-3xl"
                style={{
                  background: "#0c0e14",
                  border: isProMax
                    ? "1px solid rgba(245,158,11,0.4)"
                    : "1px solid rgba(26,140,248,0.35)",
                }}
              >
                {/* Barra de color superior */}
                <div
                  style={{
                    height: 4,
                    background: isProMax
                      ? "linear-gradient(90deg, #d97706, #f59e0b, #fbbf24)"
                      : "linear-gradient(90deg, #0050d0, #1a8cf8, #60c8ff)",
                  }}
                />

                {/* Header: badge + cerrar */}
                <div className="flex items-center justify-between px-4 pt-3 pb-0">
                  <div className="flex items-center gap-2">
                    {isProMax ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Para los Pro Max</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(26,140,248,0.12)", border: "1px solid rgba(26,140,248,0.25)" }}>
                        <motion.div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: blue }}
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ repeat: Infinity, duration: 1.2 }}
                        />
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Para Pro y Gratis</span>
                      </div>
                    )}

                    {pendingCount > 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(255,255,255,0.07)",
                          color: "rgba(255,255,255,0.5)",
                        }}
                      >
                        +{pendingCount} más
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleSkip(currentAlert.serviceId)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  >
                    <X className="w-3.5 h-3.5 text-white/50" />
                  </button>
                </div>

                {/* Cuerpo principal */}
                <div className="px-4 pt-4 pb-4">

                  {/* Timer + Título (la info más importante) */}
                  <div className="flex items-start gap-3 mb-4">
                    {/* Timer circular compacto */}
                    <div className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5">
                      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90 absolute inset-0">
                        <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
                        <circle
                          cx="22" cy="22" r={R} fill="none"
                          stroke={mainColor}
                          strokeWidth="3.5"
                          strokeDasharray={circ}
                          strokeDashoffset={dash}
                          strokeLinecap="round"
                          style={{ transition: "stroke-dashoffset 0.5s linear, stroke 0.3s" }}
                        />
                      </svg>
                      <span className="relative text-xs font-black tabular-nums" style={{ color: mainColor }}>
                        {secondsLeft}
                      </span>
                    </div>

                    {/* Título */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Trabajo solicitado
                      </p>
                      <h2 className="text-lg font-black text-white leading-snug line-clamp-2">
                        {currentAlert.title}
                      </h2>
                    </div>
                  </div>

                  {/* Badge Pro Max exclusividad */}
                  {isProMax && (
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-2xl mb-3"
                      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] text-amber-400 font-semibold">
                        Ves esta solicitud antes que otros trabajadores
                      </span>
                    </div>
                  )}

                  {/* Fila cliente: identidad y convivencia visibles antes de aceptar */}
                  <div
                    className="flex items-center justify-between gap-3 px-3 py-3 rounded-2xl mb-3"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <ClientIdentity
                      name={currentAlert.clientName}
                      score={currentAlert.convivenciaScore}
                      variant="modal"
                    />

                    {/* Distancia */}
                    <div
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl shrink-0"
                      style={{ background: `${mainColor}18`, border: `1px solid ${mainColor}30` }}
                    >
                      <MapPin className="w-3 h-3 shrink-0" style={{ color: mainColor }} />
                      <span className="text-xs font-bold tabular-nums" style={{ color: mainColor }}>
                        {currentAlert.distanceKm != null ? `${currentAlert.distanceKm} km` : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Bloque precio sugerido (solo PRO+ con presupuesto) */}
                  {isProMax && currentAlert.budgetNote && (
                    <div
                      className="flex flex-col gap-0.5 px-3 py-2.5 rounded-2xl mb-3"
                      style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}
                    >
                      <span className="text-[12px] text-amber-300 font-bold">
                        💰 Precio sugerido del cliente: {currentAlert.budgetNote}
                      </span>
                      <span className="text-[10px] text-amber-300/60">
                        (Valor Referencial propuesto por el usuario)
                      </span>
                      <span className="text-[10px] text-amber-300/75 font-medium">
                        Tú decides si aceptas o propones otro valor
                      </span>
                    </div>
                  )}

                  {/* Botón CTA principal */}
                  <motion.button
                    onClick={() => handleView(currentAlert.serviceId)}
                    className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 mb-2"
                    style={{
                      background: isProMax
                        ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                        : "linear-gradient(135deg, #1a8cf8 0%, #0050d0 100%)",
                      boxShadow: isProMax
                        ? "0 6px 24px rgba(245,158,11,0.4)"
                        : "0 6px 24px rgba(26,140,248,0.4)",
                      letterSpacing: "0.01em",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Ver solicitud
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>

                  {/* Omitir */}
                  <button
                    onClick={() => handleSkip(currentAlert.serviceId)}
                    className="w-full py-2.5 text-sm font-semibold rounded-2xl transition-colors"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    {pendingCount > 0 ? `Omitir — ver siguiente (+${pendingCount})` : "Omitir"}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
