import { useRef, useState, useEffect, useCallback } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { toast } from "sonner";
import { getSocket, joinUserRoom } from "./use-socket";
import { APP_URL } from "@/lib/app-config";

export type CallState = "idle" | "calling" | "incoming" | "active" | "ended";
export type SignalQuality = "good" | "poor";

export interface IncomingCallData {
  fromUserId: number;
  serviceId: number;
  callerName: string;
  offer: RTCSessionDescriptionInit;
}

export interface UseCallReturn {
  callState: CallState;
  incomingCall: IncomingCallData | null;
  callDuration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  signalQuality: SignalQuality;
  remoteUserName: string;
  startCall: (toUserId: number, toUserName: string, serviceId: number) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
}

function applyOpusOptimizations(sdp: string): string {
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
  if (!opusMatch) return sdp;
  const opusPayload = opusMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${opusPayload} (.+)`);
  const existingFmtp = sdp.match(fmtpRegex);
  const opusParams = [
    "usedtx=1",
    "useinbandfec=1",
    "maxaveragebitrate=32000",
    "minptime=10",
    "maxptime=40",
    "stereo=0",
    "sprop-stereo=0",
  ].join(";");
  if (existingFmtp) {
    return sdp.replace(fmtpRegex, `a=fmtp:${opusPayload} $1;${opusParams}`);
  } else {
    return sdp.replace(
      `a=rtpmap:${opusPayload} opus/48000/2`,
      `a=rtpmap:${opusPayload} opus/48000/2\r\na=fmtp:${opusPayload} ${opusParams}`
    );
  }
}

// ── Auto-contestar tras "Contestar" en la pantalla nativa (app cerrada) ─────
// La Activity nativa de llamada entrante abre la app con un deep link
// `fixxer://call/answer?callerId=...`. Guardamos esa intención a nivel módulo
// para que el hook conteste automáticamente cuando llegue la oferta re-emitida
// por el servidor al reconectar el socket.
let pendingAutoAnswerCallerId: number | null = null;

export function armAutoAnswer(callerId: number): void {
  pendingAutoAnswerCallerId = callerId;
}

/** Parsea un deep link de la pantalla nativa; arma el auto-contestar si aplica. */
export function handleCallDeepLink(url: string): boolean {
  try {
    if (!url || !url.includes("call/answer")) return false;
    const q = url.split("?")[1] ?? "";
    const params = new URLSearchParams(q);
    const callerId = Number(params.get("callerId"));
    // Sólo armamos el auto-contestar con un callerId válido. Una URL malformada
    // NO debe habilitar un auto-contestar "comodín" para cualquier llamada.
    if (!Number.isFinite(callerId) || callerId <= 0) return false;
    armAutoAnswer(callerId);
    return true;
  } catch {
    return false;
  }
}

// ── Config ICE (STUN + TURN) ──────────────────────────────────────────────
// El audio entre dos teléfonos en redes móviles distintas requiere un servidor
// TURN. Se obtiene del backend (que puede inyectar credenciales TURN dedicadas);
// si la red falla, se usa este respaldo con TURN gratuito de OpenRelay.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ],
  },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

let cachedIceServers: RTCIceServer[] | null = null;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  try {
    const base = Capacitor.isNativePlatform() ? APP_URL : "";
    const token = localStorage.getItem("fixgo_token") ?? "";
    const res = await fetch(`${base}/api/calls/ice-servers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
        cachedIceServers = data.iceServers as RTCIceServer[];
        return cachedIceServers;
      }
    }
  } catch {
    // red caída → usamos el respaldo
  }
  return FALLBACK_ICE_SERVERS;
}

export function useCall(myUserId: number | null, myUserName: string = ""): UseCallReturn {
  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [signalQuality, setSignalQuality] = useState<SignalQuality>("good");
  const [remoteUserName, setRemoteUserName] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteUserIdRef = useRef<number | null>(null);
  const serviceIdRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceCandidateBuffer = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);
  const callingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringtoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tonePatternRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tonePulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTonesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
  const myUserNameRef = useRef<string>(myUserName);
  useEffect(() => { myUserNameRef.current = myUserName; }, [myUserName]);
  // Ref para hangUp — evita stale closure en callbacks de RTCPeerConnection
  const hangUpRef = useRef<() => void>(() => {});

  // ── Pre-calentamiento TURN agresivo (estilo WhatsApp) ───────────────────────
  // WhatsApp mantiene una conexión UDP activa al servidor TURN antes de que
  // el usuario llame. Cuando llega la llamada, el relay ya tiene un allocation
  // activo → los relay candidates llegan en <100ms en vez de 2-3 segundos.
  //
  // Implementamos esto creando una RTCPeerConnection temporal con
  // iceTransportPolicy="relay" que fuerza la apertura de la conexión UDP al
  // TURN. La cerramos a los 12s (el allocation TURN queda activo en el servidor
  // por su propio TTL, típicamente 10 min). Repetimos cada 8 minutos para
  // mantener el canal caliente mientras la app está en uso.
  useEffect(() => {
    if (!myUserId) return;
    let warmupPc: RTCPeerConnection | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const warmUp = async () => {
      if (cancelled) return;
      try {
        const iceServers = await fetchIceServers();
        if (cancelled) return;

        // Cerrar PC anterior si aún existe
        warmupPc?.close();
        warmupPc = new RTCPeerConnection({
          iceServers,
          // Solo relay → fuerza conexión al TURN inmediatamente
          iceTransportPolicy: "relay",
          // Un solo candidato es suficiente para abrir el canal UDP
          iceCandidatePoolSize: 1,
        } as RTCConfiguration);

        // Un data channel dummy dispara el gathering de ICE
        warmupPc.createDataChannel("__warmup__");
        const offer = await warmupPc.createOffer();
        await warmupPc.setLocalDescription(offer);

        // Esperar hasta tener un candidato relay (canal UDP abierto al TURN)
        let relayFound = false;
        warmupPc.onicecandidate = ({ candidate }) => {
          if (candidate?.type === "relay" && !relayFound) {
            relayFound = true;
            console.log("[turn-warmup] relay candidate ready — TURN channel open");
          }
        };

        // Cerrar el PC de warmup a los 12s. El TURN allocation sigue activo
        // en el servidor (TTL propio), por lo que la próxima llamada real
        // encontrará el canal UDP ya establecido y asignará el relay rápido.
        setTimeout(() => {
          warmupPc?.close();
          warmupPc = null;
        }, 12_000);
      } catch {
        // Sin internet o sin TURN configurado → ignorar silenciosamente
      }
    };

    // Primera calentada inmediata
    void warmUp();

    // Renovar cada 8 minutos para mantener el canal activo
    intervalId = setInterval(() => { void warmUp(); }, 8 * 60 * 1000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      warmupPc?.close();
      warmupPc = null;
    };
  }, [myUserId]);

  // ── Mantener ref sincronizado con callState para closures de socket ──────
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // ── Unirse al room personal para recibir llamadas ────────────────────────
  useEffect(() => {
    if (!myUserId) return;
    joinUserRoom(myUserId);
  }, [myUserId]);

  // ── Señalizar estado foreground/background al servidor ───────────────────
  // El servidor decide si enviar el push de llamada entrante NATIVO según este
  // estado: solo lo envía cuando la app NO está en primer plano. Así se evita
  // duplicar la pantalla (overlay web + nativa) cuando está en foreground, y se
  // garantiza el push de pantalla completa cuando está en background o cerrada.
  // Importante: NO se usa la conexión del socket como proxy — un socket puede
  // seguir vivo en background; aquí se reporta el estado real del ciclo de vida.
  useEffect(() => {
    if (!myUserId) return;
    const isForeground = () =>
      typeof document === "undefined" ? true : document.visibilityState === "visible";
    const emitState = (foreground: boolean) => {
      try { getSocket().emit("app:state", { foreground }); } catch { /* sin socket */ }
    };

    emitState(isForeground());

    const socket = getSocket();
    const onConnect = () => emitState(isForeground());
    socket.on("connect", onConnect);

    const onVisibility = () => emitState(isForeground());
    document.addEventListener("visibilitychange", onVisibility);

    let removeNative: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          const handler = await App.addListener("appStateChange", ({ isActive }) => {
            emitState(isActive);
          });
          removeNative = () => handler.remove();
        } catch { /* plugin no disponible */ }
      })();
    }

    return () => {
      socket.off("connect", onConnect);
      document.removeEventListener("visibilitychange", onVisibility);
      removeNative?.();
    };
  }, [myUserId]);

  // ── Desbloquear AudioContext con el PRIMER gesto global del usuario ──────
  // Necesario para que el receptor (que no hizo click para llamar) pueda oír
  // el timbre — los navegadores requieren un gesto previo para reproducir audio
  useEffect(() => {
    const unlock = () => {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        try { audioCtxRef.current = new Ctor(); } catch { return; }
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    const events: (keyof DocumentEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach(ev => document.addEventListener(ev, unlock, { once: false, passive: true }));
    return () => {
      events.forEach(ev => document.removeEventListener(ev, unlock));
    };
  }, []);

  // ── Audio tones (WebAudio) ────────────────────────────────────────────────
  const getAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const stopActiveTones = useCallback(() => {
    activeTonesRef.current.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(0, gain.context.currentTime);
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {}
    });
    activeTonesRef.current = [];
  }, []);

  const playTone = useCallback((freqs: number[], durationMs: number, volume = 0.15) => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.02);
      gain.gain.setValueAtTime(volume, now + durationMs / 1000 - 0.02);
      gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.05);
      activeTonesRef.current.push({ osc, gain });
    });
  }, [getAudioCtx]);

  // ── Stop todos los tonos + haptics ────────────────────────────────────────
  const stopRingtone = useCallback(() => {
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
    if (tonePatternRef.current) {
      clearInterval(tonePatternRef.current);
      tonePatternRef.current = null;
    }
    if (tonePulseTimeoutRef.current) {
      clearTimeout(tonePulseTimeoutRef.current);
      tonePulseTimeoutRef.current = null;
    }
    if (ringtoneTimeoutRef.current) {
      clearTimeout(ringtoneTimeoutRef.current);
      ringtoneTimeoutRef.current = null;
    }
    stopActiveTones();
  }, [stopActiveTones]);

  // ── Timbre para quien RECIBE la llamada (loud, alternante) ────────────────
  const startRingtone = useCallback(() => {
    // Limpiar cualquier patrón previo para evitar duplicados
    stopRingtone();
    // Patrón clásico de teléfono: 2s sonando + 4s silencio (ciclo cada 6s)
    const ring = () => {
      // Tono dual estilo teléfono (440Hz + 480Hz) — pulso 1
      playTone([440, 480], 900, 0.18);
      // Pulso 2 tras 1.1s
      tonePulseTimeoutRef.current = setTimeout(() => {
        playTone([440, 480], 900, 0.18);
        tonePulseTimeoutRef.current = null;
      }, 1100);
    };
    ring();
    tonePatternRef.current = setInterval(ring, 6000);

    if (Capacitor.isNativePlatform()) {
      hapticIntervalRef.current = setInterval(async () => {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await new Promise(r => setTimeout(r, 200));
        await Haptics.impact({ style: ImpactStyle.Medium });
      }, 6000);
    }

    // Auto-stop after 60 s si el socket pierde el call:ended
    ringtoneTimeoutRef.current = setTimeout(() => {
      stopRingtone();
      setCallState("idle");
      setIncomingCall(null);
      remoteUserIdRef.current = null;
      serviceIdRef.current = null;
    }, 60_000);
  }, [stopRingtone, playTone]);

  // ── Tono de marcado para quien LLAMA (ringback, suave) ────────────────────
  const startRingback = useCallback(() => {
    stopRingtone();
    const ring = () => playTone([420], 1200, 0.08);
    ring();
    tonePatternRef.current = setInterval(ring, 3000);
  }, [playTone, stopRingtone]);

  // ── Monitoreo de calidad ─────────────────────────────────────────────────
  const startQualityMonitoring = useCallback(() => {
    qualityIntervalRef.current = setInterval(async () => {
      if (!pcRef.current) return;
      const stats = await pcRef.current.getStats();
      stats.forEach((report: any) => {
        if (report.type === "inbound-rtp" && report.kind === "audio") {
          const packetsLost = report.packetsLost ?? 0;
          const packetsReceived = report.packetsReceived ?? 1;
          const lossRate = packetsLost / (packetsLost + packetsReceived);
          const jitter = report.jitter ?? 0;
          if (lossRate > 0.05 || jitter > 0.05) {
            setSignalQuality("poor");
          } else {
            setSignalQuality("good");
          }
        }
      });
    }, 5000);
  }, []);

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
  }, []);

  // ── Temporizador de duración ─────────────────────────────────────────────
  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // ── Crear RTCPeerConnection con configuración calidad WhatsApp ────────────
  const createPC = useCallback((iceServers: RTCIceServer[]) => {
    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all",
      // Pre-calentar 2 candidatos ICE (incluye TURN relay) antes de que el
      // usuario inicie la llamada. Esto reduce el tiempo de gathering en el
      // primer intento y evita que relay candidates lleguen tarde al offer/answer.
      iceCandidatePoolSize: 2,
    } as RTCConfiguration);

    // Audio remoto — reproducción correcta en iOS
    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    // Log de servidores ICE configurados al crear la PC.
    console.log("[call] ICE servers:", iceServers.map(s => ({
      urls: s.urls,
      user: (s as RTCIceServer & { username?: string }).username ?? "—",
    })));

    // Trickle ICE — emitir cada candidato al lado remoto.
    // Loguear tipo de candidato para diagnosticar si TURN relay está siendo usado.
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        const typ = candidate.type ?? candidate.candidate?.match(/typ (\w+)/)?.[1] ?? "?";
        const proto = candidate.protocol ?? "?";
        if (typ === "relay") {
          console.log(`[call] ✅ RELAY candidate gathered (TURN activo) proto=${proto} addr=${candidate.address}`);
        } else {
          console.log(`[call] ICE candidate: type=${typ} proto=${proto}`);
        }
        if (remoteUserIdRef.current !== null) {
          getSocket().emit("call:ice", {
            toUserId: remoteUserIdRef.current,
            candidate: candidate.toJSON(),
          });
        }
      } else {
        console.log("[call] ICE gathering complete");
      }
    };

    // Error en recolección de candidatos ICE.
    pc.onicecandidateerror = (event) => {
      const ev = event as RTCPeerConnectionIceErrorEvent;
      // Error 701 = STUN host lookup failed (DNS). No es fatal si hay relay.
      // Error 401 = TURN auth failed (credenciales incorrectas) — SÍ es problema.
      // Error 700 = TURN servidor no alcanzable.
      const level = ev.errorCode === 701 ? "warn" : "error";
      console[level](`[call] ICE candidate error: code=${ev.errorCode} url=${ev.url} msg="${ev.errorText}"`);
    };

    // Diagnóstico de ICE (visible en logs del WebView).
    pc.oniceconnectionstatechange = () => {
      console.log("[call] iceConnectionState:", pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log("[call] iceGatheringState:", pc.iceGatheringState);
    };

    // Manejo de estados de conexión.
    // Usamos hangUpRef.current (no hangUp directamente) para evitar el stale
    // closure: createPC tiene deps=[] y capturaría la versión de hangUp del
    // primer render, que no tiene acceso al estado/refs actualizados.
    //
    // IMPORTANTE: NO usar pc.restartIce() aquí.
    // restartIce() genera nuevas credenciales ICE localmente pero NO envía un
    // nuevo offer al lado remoto. Esto hace que los nuevos candidatos trickle
    // lleguen con un ufrag diferente al del offer original → addIceCandidate
    // falla silenciosamente en el remoto → ICE nunca conecta. El resultado es
    // que el primer intento de llamada SIEMPRE falla si la conexión TURN no
    // estaba caliente, porque restartIce sabotea los candidatos relay que llegan
    // tarde. La solución correcta es colgar y reintentar la llamada completa.
    pc.onconnectionstatechange = () => {
      console.log("[call] connectionState:", pc.connectionState);
      if (pc.connectionState === "failed") {
        // En redes móviles, ICE puede reportar "failed" mientras aún llegan
        // candidatos relay TURN que tardan más que los host candidates.
        // Damos 4 segundos de margen para que esos relay candidates lleguen
        // y resuelvan la conexión antes de colgar definitivamente.
        // NO usamos restartIce() — genera credenciales ICE locales nuevas sin
        // notificar al remoto, lo que hace que addIceCandidate falle en silencio.
        setTimeout(() => {
          if (pc.connectionState === "failed") {
            toast.error("No se pudo conectar la llamada");
            hangUpRef.current();
          }
        }, 4000);
      }
      if (pc.connectionState === "disconnected") {
        // Breve desconexión — esperar 8s y colgar si no se recupera sola
        setTimeout(() => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            toast.error("La llamada se perdió");
            hangUpRef.current();
          }
        }, 8000);
      }
    };

    return pc;
  }, []);

  // ── Obtener stream de micrófono con configuración óptima ─────────────────
  const getLocalStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
        latency: 0,
      } as any,
      video: false,
    });
    return stream;
  }, []);

  // ── Agregar tracks con prioridad alta ────────────────────────────────────
  const addTracksWithPriority = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = 32000;
      (params.encodings[0] as any).priority = "high";
      (params.encodings[0] as any).networkPriority = "high";
      sender.setParameters(params).catch(() => {});
    });
  }, []);

  // ── Aplicar ICE candidates bufferizados ──────────────────────────────────
  const flushIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const candidate of iceCandidateBuffer.current) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
    iceCandidateBuffer.current = [];
  }, []);

  // ── Cleanup global ────────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    stopRingtone();
    stopDurationTimer();
    stopQualityMonitoring();

    if (callingTimeoutRef.current) {
      clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = null;
    }

    if (Capacitor.isNativePlatform()) {
      await KeepAwake.allowSleep().catch(() => {});
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    remoteUserIdRef.current = null;
    serviceIdRef.current = null;
    remoteDescSet.current = false;
    iceCandidateBuffer.current = [];
    setSignalQuality("good");
    setCallDuration(0);
    setIsMuted(false);
  }, [stopRingtone, stopDurationTimer, stopQualityMonitoring]);

  // ── Iniciar llamada (caller) ──────────────────────────────────────────────
  // Ensure AudioContext is unlocked from user gesture (click on "call" button)
  const ensureAudioUnlocked = useCallback(() => {
    getAudioCtx();
  }, [getAudioCtx]);

  const startCall = useCallback(async (toUserId: number, toUserName: string, serviceId: number) => {
    ensureAudioUnlocked();
    if (callState !== "idle") return;

    // Verificar conexión antes de llamar
    const status = await Network.getStatus();
    if (!status.connected) {
      toast.error("Sin conexión a internet");
      return;
    }

    try {
      const stream = await getLocalStream();
      localStreamRef.current = stream;
      remoteUserIdRef.current = toUserId;
      serviceIdRef.current = serviceId;
      setRemoteUserName(toUserName);
      setCallState("calling");

      const iceServers = await fetchIceServers();
      const pc = createPC(iceServers);
      pcRef.current = pc;

      addTracksWithPriority(pc, stream);

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      const optimizedOffer = { ...offer, sdp: applyOpusOptimizations(offer.sdp!) };
      await pc.setLocalDescription(optimizedOffer);

      const callerName = (myUserNameRef.current || myUserName || "").trim();
      getSocket().emit("call:offer", {
        toUserId,
        serviceId,
        offer: optimizedOffer,
        callerName: callerName || "Llamada entrante",
      });

      startRingback();

      // Timeout automático si no hay respuesta en 45 segundos
      if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = setTimeout(() => {
        if (pcRef.current && pcRef.current.connectionState !== "connected") {
          toast.info("Sin respuesta");
          hangUp();
        }
      }, 45_000);
    } catch (err: any) {
      const name = err?.name as string | undefined;
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Permiso de micrófono denegado. Actívalo en los ajustes del teléfono para llamar.");
      } else if (name === "NotFoundError") {
        toast.error("No se encontró un micrófono en el dispositivo.");
      } else {
        toast.error("No se pudo acceder al micrófono");
      }
      await cleanup();
      setCallState("idle");
    }
  }, [callState, getLocalStream, createPC, addTracksWithPriority, cleanup, startRingback, ensureAudioUnlocked]);

  // ── Aceptar llamada entrante (callee) ────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone();

    try {
      const stream = await getLocalStream();
      localStreamRef.current = stream;
      remoteUserIdRef.current = incomingCall.fromUserId;
      serviceIdRef.current = incomingCall.serviceId;
      setRemoteUserName(incomingCall.callerName);

      const iceServers = await fetchIceServers();
      const pc = createPC(iceServers);
      pcRef.current = pc;

      addTracksWithPriority(pc, stream);

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      remoteDescSet.current = true;
      await flushIceCandidates(pc);

      const answer = await pc.createAnswer();
      const optimizedAnswer = { ...answer, sdp: applyOpusOptimizations(answer.sdp!) };
      await pc.setLocalDescription(optimizedAnswer);

      getSocket().emit("call:answer", {
        toUserId: incomingCall.fromUserId,
        answer: optimizedAnswer,
      });

      if (Capacitor.isNativePlatform()) {
        await KeepAwake.keepAwake();
      }

      setCallState("active");
      setIncomingCall(null);
      startDurationTimer();
      startQualityMonitoring();

      // TODO: CallKit iOS — instalar @anrok/capacitor-callkit-voip cuando esté disponible en npm
      // if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
      //   const { CallKitVoip } = await import("@anrok/capacitor-callkit-voip");
      //   await CallKitVoip.finishRinging();
      // }
    } catch (err) {
      toast.error("No se pudo iniciar la llamada");
      await cleanup();
      setCallState("idle");
      setIncomingCall(null);
    }
  }, [incomingCall, stopRingtone, getLocalStream, createPC, addTracksWithPriority, flushIceCandidates, cleanup, startDurationTimer, startQualityMonitoring]);

  // ── Rechazar llamada ──────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    stopRingtone();
    getSocket().emit("call:reject", { toUserId: incomingCall.fromUserId });
    setIncomingCall(null);
    setCallState("idle");
    remoteUserIdRef.current = null;
    serviceIdRef.current = null;
  }, [incomingCall, stopRingtone]);

  // ── Colgar ────────────────────────────────────────────────────────────────
  const hangUp = useCallback(async () => {
    if (remoteUserIdRef.current !== null) {
      getSocket().emit("call:end", { toUserId: remoteUserIdRef.current });
    }
    await cleanup();
    setCallState("idle");
    setIncomingCall(null);
  }, [cleanup]);

  // Mantener hangUpRef siempre apuntando a la versión más reciente de hangUp
  // para que los callbacks internos de RTCPeerConnection no usen stale closures.
  useEffect(() => {
    hangUpRef.current = hangUp;
  }, [hangUp]);

  // ── Silencio ──────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  }, [isMuted]);

  // ── Altavoz (solo nativo) ─────────────────────────────────────────────────
  const toggleSpeaker = useCallback(() => {
    setIsSpeaker(prev => !prev);
  }, []);

  // ── Escuchar eventos Socket.io entrantes ─────────────────────────────────
  useEffect(() => {
    if (!myUserId) return;
    const socket = getSocket();

    const onIncoming = (data: IncomingCallData) => {
      const state = callStateRef.current;
      // Re-emisión de la MISMA llamada entrante: el servidor reenvía la oferta
      // cada vez que el socket del destinatario se reconecta (muy frecuente en
      // web móvil). Solo aplica cuando SOMOS el destinatario (sonando o ya
      // atendiendo): la ignoramos. Sin esto, cada reconexión disparaba un
      // "call:reject" y el que llama veía "Llamada rechazada" repetidas veces
      // aunque el destinatario sí la aceptara. No se aplica en "calling" (somos
      // el emisor): ahí una entrante del mismo usuario es una colisión real
      // (glare) y debe rechazarse, no ignorarse.
      if (
        (state === "incoming" || state === "active") &&
        remoteUserIdRef.current === data.fromUserId
      ) {
        return;
      }
      // Ocupado con OTRA llamada (o glare mientras llamamos) → rechazar.
      if (state !== "idle") {
        getSocket().emit("call:reject", { toUserId: data.fromUserId });
        return;
      }
      remoteUserIdRef.current = data.fromUserId;
      serviceIdRef.current = data.serviceId;
      setIncomingCall(data);
      setCallState("incoming");
      startRingtone();

      // iOS (app cerrada): la pantalla nativa de llamada la muestra CallKit vía
      // el push VoIP de PushKit (plugin nativo CallKitVoip), no aquí. Cuando el
      // usuario toca "Contestar", `useCallKitIos` arma el auto-contestar y esta
      // oferta re-emitida por el servidor se acepta automáticamente.
    };

    const onAnswered = async ({ answer }: { fromUserId: number; answer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;

      // Cancelar el timeout de "sin respuesta" — la llamada fue contestada.
      // Sin esto, si ICE sigue negociando cuando expira el timer (45s desde la
      // oferta), el timeout veía connectionState !== "connected" y colgaba una
      // llamada que en realidad ya había sido aceptada.
      if (callingTimeoutRef.current) {
        clearTimeout(callingTimeoutRef.current);
        callingTimeoutRef.current = null;
      }

      stopRingtone();

      try {
        // Intentar con el SDP recibido tal cual.
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err1) {
        // Si falla (puede ocurrir si el SDP fue modificado con Opus opts y el
        // browser remoto lo rechaza), intentar con el SDP original sin modificar.
        console.warn("[call] setRemoteDescription falló con SDP optimizado, reintentando con SDP original:", err1);
        try {
          const plainAnswer: RTCSessionDescriptionInit = { type: answer.type, sdp: answer.sdp };
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(plainAnswer));
        } catch (err2) {
          // SDP completamente inválido — colgar limpiamente en lugar de quedarse
          // congelado en estado "calling" para siempre.
          console.error("[call] setRemoteDescription falló definitivamente:", err2);
          toast.error("Error al conectar la llamada");
          void hangUpRef.current();
          return;
        }
      }

      remoteDescSet.current = true;
      await flushIceCandidates(pcRef.current);

      if (Capacitor.isNativePlatform()) {
        await KeepAwake.keepAwake();
      }

      setCallState("active");
      startDurationTimer();
      startQualityMonitoring();
    };

    const onIce = async ({ candidate }: { fromUserId: number; candidate: RTCIceCandidateInit }) => {
      if (remoteDescSet.current && pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        iceCandidateBuffer.current.push(candidate);
      }
    };

    const onEnded = () => {
      cleanup();
      setCallState("idle");
      setIncomingCall(null);
    };

    const onRejected = () => {
      toast.info("Llamada rechazada");
      cleanup();
      setCallState("idle");
    };

    const onBlocked = ({ message }: { message?: string }) => {
      toast.info(message ?? "Las llamadas están disponibles desde el plan Pro.");
      cleanup();
      setCallState("idle");
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:answered", onAnswered);
    socket.on("call:ice", onIce);
    socket.on("call:ended", onEnded);
    socket.on("call:rejected", onRejected);
    socket.on("call:blocked", onBlocked);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:answered", onAnswered);
      socket.off("call:ice", onIce);
      socket.off("call:ended", onEnded);
      socket.off("call:rejected", onRejected);
      socket.off("call:blocked", onBlocked);
    };
  }, [myUserId, startRingtone, stopRingtone, flushIceCandidates, startDurationTimer, startQualityMonitoring, cleanup]);

  // ── Auto-contestar cuando la llamada llega tras abrir la app desde la ──────
  // pantalla nativa (deep link `call/answer`). El servidor re-emite la oferta
  // al reconectar el socket; aquí la aceptamos sin que el usuario toque de nuevo.
  useEffect(() => {
    if (callState === "incoming" && incomingCall && pendingAutoAnswerCallerId !== null) {
      const matches =
        pendingAutoAnswerCallerId === -1 ||
        pendingAutoAnswerCallerId === incomingCall.fromUserId;
      if (matches) {
        pendingAutoAnswerCallerId = null;
        void acceptCall();
      }
    }
  }, [callState, incomingCall, acceptCall]);

  return {
    callState,
    incomingCall,
    callDuration,
    isMuted,
    isSpeaker,
    signalQuality,
    remoteUserName,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    toggleSpeaker,
    remoteAudioRef,
  };
}
