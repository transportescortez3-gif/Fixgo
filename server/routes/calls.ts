import { Router } from "express";
import { verifyToken } from "../lib/auth";
import { rejectPendingCall } from "../lib/socketio";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const GOOGLE_STUN: IceServer = {
  urls: [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
  ],
};

// Último recurso si no hay TURN propio configurado. Es un TURN compartido y
// "best-effort": puede saturarse o caerse. No garantiza llamadas fiables.
const OPENRELAY_FALLBACK: IceServer = {
  urls: [
    "turn:openrelay.metered.ca:80",
    "turn:openrelay.metered.ca:443",
    "turn:openrelay.metered.ca:443?transport=tcp",
  ],
  username: "openrelayproject",
  credential: "openrelayproject",
};

// Cache en memoria de las credenciales TURN dinámicas de Metered. Evita pegarle
// a la API de Metered en cada llamada (su plan gratuito limita las peticiones).
let meteredCache: { servers: IceServer[]; expiresAt: number } | null = null;

/**
 * Obtiene credenciales TURN dinámicas desde Metered.ca (plan gratuito ~50GB/mes,
 * fiable). Requiere los secrets METERED_TURN_DOMAIN (p.ej. "tuapp.metered.live")
 * y METERED_TURN_API_KEY. La API devuelve un arreglo de iceServers listo para
 * usar (STUN + TURN udp/tcp/tls). Devuelve null si no está configurado o falla.
 */
async function getMeteredIceServers(): Promise<IceServer[] | null> {
  const apiKey = process.env.METERED_TURN_API_KEY?.trim();
  const rawDomain = process.env.METERED_TURN_DOMAIN?.trim();
  if (!apiKey || !rawDomain) return null;

  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (meteredCache && meteredCache.expiresAt > Date.now()) return meteredCache.servers;

  try {
    const url = `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return meteredCache?.servers ?? null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      // Garantizamos STUN de Google además de lo que entregue Metered.
      const servers = [GOOGLE_STUN, ...(data as IceServer[])];
      meteredCache = { servers, expiresAt: Date.now() + 30 * 60 * 1000 };
      return servers;
    }
  } catch {
    return meteredCache?.servers ?? null;
  }
  return meteredCache?.servers ?? null;
}

/**
 * Config ICE para WebRTC. Sin un servidor TURN fiable, dos teléfonos en redes
 * móviles distintas (NAT simétrico / CGNAT) NO logran establecer la ruta de
 * audio: la llamada nunca conecta o "conecta" sin audio. STUN solo no basta.
 *
 * Orden de prioridad:
 *   1. Metered.ca (credenciales dinámicas) — recomendado, fiable, gratis.
 *   2. TURN estático por env (TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL).
 *   3. OpenRelay compartido — último recurso, no garantiza fiabilidad.
 */
router.get("/calls/ice-servers", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId ?? "?";

  // 1) Metered dinámico (preferido).
  const metered = await getMeteredIceServers();
  if (metered) {
    console.log(`[ice-servers] user=${userId} → Metered (${metered.length} servers)`);
    res.json({ iceServers: metered });
    return;
  }

  // 2) TURN estático por env. Solo si la config está COMPLETA (urls + credenciales);
  // un TURN sin credenciales es inservible y reintroduciría el "sin audio".
  const iceServers: IceServer[] = [GOOGLE_STUN];
  const turnUrls = process.env.TURN_URLS?.trim();
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();
  const parsedTurnUrls = turnUrls
    ? turnUrls.split(",").map((u) => u.trim()).filter(Boolean)
    : [];

  if (parsedTurnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: parsedTurnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
    console.log(`[ice-servers] user=${userId} → TURN propio: ${parsedTurnUrls.join(", ")}`);
  } else {
    // 3) Último recurso.
    iceServers.push(OPENRELAY_FALLBACK);
    console.warn(`[ice-servers] user=${userId} → ⚠️ OpenRelay (fallback) — configurar TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL`);
  }

  res.json({ iceServers });
});

/**
 * Rechazo de llamada desde el botón nativo "Rechazar" de la pantalla de llamada
 * entrante en Android (app cerrada/bloqueada). No usa la sesión web (la app
 * puede no estar abierta); en su lugar valida el `rejectToken` firmado que viajó
 * en el push FCM de la llamada. Notifica al que llama y genera el mensaje de
 * "llamada perdida" existente.
 */
router.post("/calls/reject", async (req, res): Promise<void> => {
  const { rejectToken } = req.body ?? {};
  if (!rejectToken || typeof rejectToken !== "string") {
    res.status(400).json({ error: "rejectToken requerido" });
    return;
  }

  const payload = verifyToken(rejectToken);
  if (!payload || payload.role !== "call_reject") {
    res.status(401).json({ error: "token inválido" });
    return;
  }

  // El email del token codifica "call_reject:<callerId>-><calleeId>".
  const match = /^call_reject:(\d+)->(\d+)$/.exec(payload.email ?? "");
  if (!match) {
    res.status(400).json({ error: "token mal formado" });
    return;
  }
  const callerId = Number(match[1]);
  const calleeId = Number(match[2]);

  // El `id` del token es el destinatario (quien rechaza) — debe coincidir.
  if (payload.id !== calleeId) {
    res.status(401).json({ error: "token inválido" });
    return;
  }

  await rejectPendingCall(callerId, calleeId);
  res.json({ ok: true });
});

export default router;
