import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { verifyToken } from "../lib/auth";
import {
  getEntries,
  getStats,
  clearBuffer,
  subscribe,
  pushLog,
  type LogLevel,
} from "../lib/log-buffer";

const router = Router();

const VALID_LEVELS: LogLevel[] = ["error", "warn", "info", "http", "debug"];

// Últimas entradas del buffer con filtros ?level=&search=&since=&limit=
router.get("/admin/logs", authenticate, requireRole("admin"), (req, res): void => {
  const levelRaw = String(req.query.level ?? "");
  const level = VALID_LEVELS.includes(levelRaw as LogLevel) ? (levelRaw as LogLevel) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const sinceId = req.query.since ? parseInt(String(req.query.since), 10) : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 500;

  res.json(getEntries({
    level,
    search,
    sinceId: Number.isNaN(sinceId as number) ? undefined : sinceId,
    limit: Number.isNaN(limit) ? 500 : limit,
  }));
});

// KPIs: totales por nivel + errores/avisos de la última hora
router.get("/admin/logs/stats", authenticate, requireRole("admin"), (_req, res): void => {
  res.json(getStats());
});

// Vaciar el buffer en memoria
router.delete("/admin/logs", authenticate, requireRole("admin"), (req, res): void => {
  clearBuffer();
  pushLog("info", "Buffer de logs vaciado por un administrador", "logs");
  res.json({ ok: true });
});

// SSE en tiempo real. El token va por query string porque EventSource no
// soporta headers (mismo patrón que /api/storage/objects).
router.get("/admin/logs/stream", (req, res): void => {
  const token = String(req.query.token ?? "");
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.role !== "admin") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // El middleware compression() bufferiza — hay que hacer flush tras cada write.
  const flush = () => { (res as any).flush?.(); };

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    flush();
  };

  // Snapshot inicial: últimos 100 logs
  send("init", getEntries({ limit: 100 }));

  const unsubscribe = subscribe((entry) => send("log", entry));

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
    flush();
  }, 20_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
