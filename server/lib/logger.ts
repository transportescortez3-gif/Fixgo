import pino from "pino";
import { pushLog, type LogLevel } from "./log-buffer";

const isProduction = process.env.NODE_ENV === "production";

// pino level numérico → nivel del visor de logs
const LEVEL_MAP: Record<number, LogLevel> = {
  10: "debug",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "error",
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  hooks: {
    // Alimenta el visor de logs del panel admin (server/lib/log-buffer.ts)
    // sin alterar la salida normal de pino.
    logMethod(args, method, level) {
      try {
        const obj = args[0] as any;
        const msg =
          typeof args[0] === "string" ? (args[0] as string)
          : typeof args[1] === "string" ? (args[1] as string)
          : "";

        // pino-http pasa { res, responseTime, err } (el req viene como binding
        // del child logger o via res.req), por eso se detecta req O res.
        const httpReq = obj && typeof obj === "object" ? (obj.req ?? obj.res?.req) : undefined;
        if (obj && typeof obj === "object" && (httpReq || obj.res)) {
          // Log de pino-http: formatear como METHOD /ruta → STATUS (Xms).
          // OJO: recortar el query string (puede traer ?token=...).
          const url = String(httpReq?.url ?? "").split("?")[0];
          const status = obj.res?.statusCode ?? "?";
          const rt = obj.responseTime != null ? ` (${obj.responseTime}ms)` : "";
          const errMsg = obj.err?.message ? ` — ${obj.err.message}` : "";
          pushLog("http", `${httpReq?.method ?? "?"} ${url} → ${status}${rt}${errMsg}`, "http");
        } else {
          let extra = "";
          if (obj && typeof obj === "object") {
            try {
              const s = JSON.stringify(obj);
              if (s && s !== "{}") extra = " " + (s.length > 300 ? s.slice(0, 300) + "…" : s);
            } catch { /* objetos circulares: ignorar */ }
          }
          pushLog(LEVEL_MAP[level] ?? "info", (msg || "(sin mensaje)") + extra);
        }
      } catch { /* nunca romper el logging real */ }
      return method.apply(this, args);
    },
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
