import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { PersistentUploadStorageUnavailableError } from "./lib/objectStorage";

const app: Express = express();

// Confiar en Cloudflare como proxy para que rate-limit use la IP real
app.set("trust proxy", 1);

app.use(compression());

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => !req.url?.startsWith("/api"),
    },
    // Loguear 4xx como warn y 5xx como error (antes todo iba como "info")
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    // Incluir el mensaje de error en el log cuando existe
    customSuccessMessage(req, res) {
      if (res.statusCode >= 400) {
        return `${req.method} ${req.url?.split("?")[0]} → ${res.statusCode}`;
      }
      return "request completed";
    },
    customErrorMessage(req, res, err) {
      return `${req.method} ${req.url?.split("?")[0]} → ${res.statusCode} — ${err?.message ?? "error"}`;
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const capacitorOrigins = ["https://localhost", "capacitor://localhost", "http://localhost"];
const corsOrigin = process.env.APP_URL
  ? [process.env.APP_URL, ...capacitorOrigins]
  : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting general — protege contra abuso y ataques DDoS simples
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta en un momento." },
  skip: (req) => {
    return req.path === "/api/health" || !req.path.startsWith("/api");
  },
});

// Rate limit más estricto para auth — evita fuerza bruta
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos." },
});

// Rate limit para recuperación de contraseña — evita spam de emails
const passwordLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de recuperación. Espera 1 hora." },
});

app.use("/api", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", passwordLimiter);
app.use("/api/auth/reset-password", passwordLimiter);

app.use("/api", router);

// Nunca dejar que una ruta API desconocida caiga en el fallback de la SPA.
// Además de evitar respuestas HTML con status 200 para errores, esto impide
// que sondas como GET /api/.env parezcan endpoints válidos.
app.use("/api", (_req, res): void => {
  res.status(404).json({ error: "API route not found" });
});

// ─── Middleware global de errores ─────────────────────────────────────────────
// Captura cualquier error que llegue con next(err) o de handlers async sin try/catch
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const error = err instanceof Error ? err : new Error(String(err));

  if (error instanceof PersistentUploadStorageUnavailableError) {
    (req as Request & { log?: { warn: (...args: unknown[]) => void } }).log?.warn(
      { err: error },
      "Persistent upload storage is unavailable",
    );
    if (!res.headersSent) {
      res.status(503).json({ error: error.message, code: "PERSISTENT_STORAGE_UNAVAILABLE" });
    }
    return;
  }

  // req.log existe gracias a pino-http
  (req as Request & { log?: { error: (...args: unknown[]) => void } }).log?.error(
    { err: error, stack: error.stack },
    `Unhandled error in ${req.method} ${req.url?.split("?")[0]}`,
  ) ?? logger.error({ err: error, stack: error.stack, method: req.method, url: req.url?.split("?")[0] }, "Unhandled error");

  if (res.headersSent) return;

  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { status?: number; statusCode?: number })?.statusCode
    ?? 500;

  res.status(status).json({
    error: process.env.NODE_ENV === "production" ? "Error interno del servidor" : error.message,
  });
});

export default app;
