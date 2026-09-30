import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCallContext } from "@/contexts/call-context";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Signal, WifiOff, ChevronLeft, ChevronRight } from "lucide-react";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function SoundWaves() {
  return (
    <div className="flex items-center gap-1 mt-2">
      {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-primary/60 animate-pulse"
          style={{
            height: `${h * 8}px`,
            animationDelay: `${i * 0.1}s`,
            animationDuration: "0.8s",
          }}
        />
      ))}
    </div>
  );
}

// ── Deslizar para contestar/rechazar (estilo WhatsApp) ────────────────────
function SlideToAnswer({
  onAnswer,
  onReject,
}: {
  onAnswer: () => void;
  onReject: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dxRef = useRef(0);
  const draggingRef = useRef(false);
  const firedRef = useRef(false);
  const startXRef = useRef(0);
  const [dx, setDx] = useState(0);

  const HANDLE = 64;

  const maxShift = () => {
    const w = trackRef.current?.clientWidth ?? 280;
    return (w - HANDLE) / 2 - 6;
  };

  const onDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    firedRef.current = false;
    startXRef.current = e.clientX;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const max = maxShift();
    const nx = Math.max(-max, Math.min(max, e.clientX - startXRef.current));
    dxRef.current = nx;
    setDx(nx);
  };

  const onUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const max = maxShift();
    const threshold = max * 0.6;
    const x = dxRef.current;
    dxRef.current = 0;
    setDx(0);
    if (firedRef.current) return;
    if (x >= threshold) { firedRef.current = true; onAnswer(); }
    else if (x <= -threshold) { firedRef.current = true; onReject(); }
  };

  const max = maxShift();
  const ratio = max ? dx / max : 0;
  const answering = ratio > 0.15;
  const rejecting = ratio < -0.15;

  return (
    <div className="w-full max-w-xs mx-auto select-none">
      <div
        ref={trackRef}
        className="relative h-20 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-sm overflow-hidden"
      >
        {/* Tintes de color al deslizar */}
        <div className="absolute inset-y-0 left-1/2 right-0 bg-green-500/25" style={{ opacity: Math.max(0, ratio) }} />
        <div className="absolute inset-y-0 left-0 right-1/2 bg-red-500/25" style={{ opacity: Math.max(0, -ratio) }} />

        {/* Lado izquierdo: rechazar */}
        <div className="absolute inset-y-0 left-5 flex items-center gap-1 text-red-400 pointer-events-none">
          <PhoneOff className="w-5 h-5" />
          <ChevronLeft className="w-4 h-4 animate-pulse" />
        </div>
        {/* Lado derecho: contestar */}
        <div className="absolute inset-y-0 right-5 flex items-center gap-1 text-green-400 pointer-events-none">
          <ChevronRight className="w-4 h-4 animate-pulse" />
          <Phone className="w-5 h-5" />
        </div>

        {/* Manija deslizable */}
        <button
          type="button"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Desliza a la derecha para contestar o a la izquierda para rechazar"
          className="absolute top-1/2 left-1/2 w-16 h-16 -mt-8 -ml-8 rounded-full shadow-2xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
          style={{
            transform: `translateX(${dx}px)`,
            transition: draggingRef.current ? "none" : "transform 0.25s ease",
            backgroundColor: answering ? "#22c55e" : rejecting ? "#ef4444" : "#1a8cf8",
          }}
        >
          {rejecting ? (
            <PhoneOff className="w-7 h-7 text-white" />
          ) : (
            <Phone className="w-7 h-7 text-white" />
          )}
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-3">
        Desliza para contestar o rechazar
      </p>
    </div>
  );
}

export function CallOverlay() {
  const {
    callState,
    incomingCall,
    callDuration,
    isMuted,
    signalQuality,
    remoteUserName,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
  } = useCallContext();

  if (callState === "idle" || callState === "ended") return null;

  const content = (
    <>
      {/* ── ENTRANTE — deslizar para contestar (estilo WhatsApp) ─────────── */}
      {callState === "incoming" && incomingCall && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-[#0a1628] via-[#0a0f1c] to-black">
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6 pt-[max(env(safe-area-inset-top),2rem)]">
            <div className="relative flex items-center justify-center w-40 h-40">
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
              <span className="absolute inset-3 rounded-full animate-ping bg-primary/15" style={{ animationDelay: "0.4s" }} />
              <div className="relative w-32 h-32 rounded-full bg-primary/20 border-4 border-primary flex items-center justify-center text-5xl font-bold text-primary z-10 shadow-2xl">
                {incomingCall.callerName.charAt(0).toUpperCase()}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-sm uppercase tracking-widest mb-2">Llamada entrante</p>
              <p className="text-3xl font-bold text-foreground">{incomingCall.callerName}</p>
              <p className="text-sm text-primary mt-1">Fixgo Voice</p>
            </div>
          </div>
          <div className="px-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] pt-6">
            <SlideToAnswer onAnswer={acceptCall} onReject={rejectCall} />
          </div>
        </div>
      )}

      {/* ── LLAMANDO ─────────────────────────────────────────────────────── */}
      {callState === "calling" && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 p-8 text-center">
            <div className="w-24 h-24 rounded-full bg-primary/20 border-4 border-primary/60 flex items-center justify-center text-4xl font-bold text-primary">
              {remoteUserName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-muted-foreground text-sm uppercase tracking-widest mb-1">Llamando a</p>
              <p className="text-2xl font-bold text-foreground">{remoteUserName}</p>
              <SoundWaves />
            </div>
            <div className="flex flex-col items-center gap-2 mt-4">
              <Button
                size="icon"
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl"
                onClick={hangUp}
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
              <span className="text-xs text-muted-foreground">Cancelar</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVA — pantalla completa estilo WhatsApp ──────────────────── */}
      {callState === "active" && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-[#0a1628] via-[#0a0f1c] to-black">
          {/* Top bar: señal + duración */}
          <div className="flex items-center justify-between px-6 pt-[max(env(safe-area-inset-top),1.5rem)] pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {signalQuality === "poor" ? (
                <>
                  <WifiOff className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-400">Señal débil</span>
                </>
              ) : (
                <>
                  <Signal className="w-4 h-4 text-green-400" />
                  <span>Buena señal</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
                {formatDuration(callDuration)}
              </span>
            </div>
          </div>

          {/* Centro: avatar + nombre + ondas */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-8">
            <div className="relative flex items-center justify-center w-48 h-48">
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/15" />
              <span
                className="absolute inset-4 rounded-full animate-ping bg-primary/10"
                style={{ animationDelay: "0.4s" }}
              />
              <div className="relative w-40 h-40 rounded-full bg-primary/20 border-4 border-primary/70 flex items-center justify-center text-6xl font-bold text-primary z-10 shadow-2xl">
                {remoteUserName.charAt(0).toUpperCase()}
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-foreground mb-2">{remoteUserName}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-widest">
                Fixgo Voice · En llamada
              </p>
              <div className="flex justify-center">
                <SoundWaves />
              </div>
            </div>
          </div>

          {/* Bottom: controles */}
          <div className="px-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] pt-6">
            <div className="flex items-center justify-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className={`w-16 h-16 rounded-full border ${
                    isMuted
                      ? "bg-white text-black border-white"
                      : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                  }`}
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {isMuted ? "Silenciado" : "Silenciar"}
                </span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <Button
                  size="icon"
                  className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-2xl"
                  onClick={hangUp}
                >
                  <PhoneOff className="w-8 h-8" />
                </Button>
                <span className="text-xs text-muted-foreground">Colgar</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(content, document.body);
}
