import http2 from "http2";
import jwt from "jsonwebtoken";
import { logger } from "./logger";

/**
 * Cliente APNs para enviar push VoIP (PushKit) al dispositivo iOS del
 * destinatario de una llamada. A diferencia de Android (que usa FCM data-only),
 * iOS NO puede despertar la app cerrada con un push normal para mostrar la
 * pantalla de llamada: requiere un push VoIP entregado por APNs directamente,
 * con `apns-push-type: voip` y el topic `<bundleId>.voip`. PushKit invoca al
 * delegate nativo aunque la app esté cerrada y este DEBE reportar la llamada a
 * CallKit de inmediato.
 *
 * Autenticación por token (APNs Auth Key .p8, ES256). Variables de entorno:
 *   - APNS_KEY_ID       → Key ID de la APNs Auth Key (10 caracteres)
 *   - APNS_TEAM_ID      → Apple Developer Team ID (10 caracteres)
 *   - APNS_PRIVATE_KEY  → contenido del archivo .p8 (con \n escapados o reales)
 *   - APNS_BUNDLE_ID    → bundle id de la app (default com.fixxer.app; se conserva por compatibilidad)
 *   - APNS_ENVIRONMENT  → "production" | "sandbox" (alias "development")
 *                          (default production)
 *
 * Si la configuración está incompleta, las funciones son no-op (igual que
 * Firebase cuando no está configurado), para no romper el resto del flujo.
 */

const PROD_HOST = "api.push.apple.com";
const SANDBOX_HOST = "api.sandbox.push.apple.com";

interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  host: string;
}

let configChecked = false;
let cachedConfig: ApnsConfig | null = null;

function getConfig(): ApnsConfig | null {
  if (configChecked) return cachedConfig;
  configChecked = true;

  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const bundleId = (process.env.APNS_BUNDLE_ID?.trim()) || "com.fixxer.app";
  const env = (process.env.APNS_ENVIRONMENT?.trim() || "production").toLowerCase();

  if (!keyId || !teamId || !privateKey) {
    logger.warn(
      "APNs no configurado — push VoIP de iOS deshabilitado. Configura APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY.",
    );
    cachedConfig = null;
    return null;
  }

  // "development" es alias de "sandbox" (así lo nombra Xcode en el entitlement
  // aps-environment). Cualquier otro valor cae en producción con aviso.
  const isSandbox = env === "sandbox" || env === "development";
  if (!isSandbox && env !== "production") {
    logger.warn(
      { env },
      "APNS_ENVIRONMENT inválido — usa 'production' o 'sandbox' (alias 'development'). Cayendo a producción.",
    );
  }

  cachedConfig = {
    keyId,
    teamId,
    privateKey,
    bundleId,
    host: isSandbox ? SANDBOX_HOST : PROD_HOST,
  };
  logger.info({ env, bundleId }, "APNs configurado — push VoIP de iOS habilitado");
  return cachedConfig;
}

/** El token JWT de APNs es válido hasta 60 min; lo cacheamos 50 min. */
let cachedJwt: { token: string; createdAt: number } | null = null;
const JWT_TTL_MS = 50 * 60 * 1000;

function getProviderToken(cfg: ApnsConfig): string {
  const now = Date.now();
  if (cachedJwt && now - cachedJwt.createdAt < JWT_TTL_MS) {
    return cachedJwt.token;
  }
  const token = jwt.sign({}, cfg.privateKey, {
    algorithm: "ES256",
    keyid: cfg.keyId,
    issuer: cfg.teamId,
    expiresIn: "1h",
  });
  cachedJwt = { token, createdAt: now };
  return token;
}

/** Indica si el push VoIP de iOS está disponible (config completa). */
export function isApnsConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Envía un push VoIP a un dispositivo iOS. El `payload` se entrega tal cual al
 * delegate de PushKit (debe incluir los datos de la llamada: callerId, calleeId,
 * serviceId, callerName, rejectToken y un `type`). Resuelve incluso ante error
 * (lo registra), igual que el envío FCM.
 */
export async function sendVoipPush(
  voipToken: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return;
  if (!voipToken) return;

  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    let client: http2.ClientHttp2Session | null = null;
    try {
      client = http2.connect(`https://${cfg.host}:443`);
    } catch (err) {
      logger.warn({ err }, "APNs connect falló");
      return done();
    }

    client.on("error", (err) => {
      logger.warn({ err: (err as Error).message }, "APNs sesión error");
      done();
    });

    const body = Buffer.from(JSON.stringify(payload));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${voipToken}`,
      authorization: `bearer ${getProviderToken(cfg)}`,
      "apns-topic": `${cfg.bundleId}.voip`,
      "apns-push-type": "voip",
      "apns-priority": "10",
      // Una llamada vieja no sirve: que APNs la descarte si no se entrega pronto.
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 60),
      "content-type": "application/json",
      "content-length": body.length,
    });

    let status = 0;
    let respBody = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      respBody += chunk;
    });
    req.on("end", () => {
      if (status !== 200) {
        // 410 = token ya no registrado; 400 BadDeviceToken, etc.
        logger.warn({ status, respBody: respBody.slice(0, 200) }, "APNs VoIP push no entregado");
      }
      try {
        req.close();
      } catch {}
      try {
        client?.close();
      } catch {}
      done();
    });
    req.on("error", (err) => {
      logger.warn({ err: (err as Error).message }, "APNs request error");
      try {
        client?.close();
      } catch {}
      done();
    });

    req.write(body);
    req.end();
  });
}
