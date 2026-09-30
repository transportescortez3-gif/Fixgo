/**
 * Visor de Logs — buffer circular en memoria + captura global.
 *
 * IMPORTANTE: este módulo debe ser el PRIMER import de server/index.ts para
 * capturar todo desde el arranque. Cero dependencias externas.
 *
 * Captura:
 *  - console.log/info/warn/error/debug (parchados globalmente)
 *  - pino (via hooks.logMethod en server/lib/logger.ts → pushLog)
 *  - uncaughtException (monitor, no altera el comportamiento del proceso)
 *  - unhandledRejection
 */

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";

export interface LogEntry {
  id: number;
  ts: string; // ISO timestamp
  level: LogLevel;
  source: string | null; // extraído del prefijo [fuente] del mensaje
  message: string;
}

const MAX_ENTRIES = 1000;

const buffer: LogEntry[] = [];
let nextId = 1;

type Subscriber = (entry: LogEntry) => void;
const subscribers = new Set<Subscriber>();

const SOURCE_RE = /^\[([\w.:\/-]+)\]\s*/;

function extractSource(message: string): { source: string | null; message: string } {
  const m = SOURCE_RE.exec(message);
  if (!m) return { source: null, message };
  return { source: m[1], message };
}

export function pushLog(level: LogLevel, rawMessage: string, source?: string | null): void {
  const extracted = source !== undefined ? { source, message: rawMessage } : extractSource(rawMessage);
  const entry: LogEntry = {
    id: nextId++,
    ts: new Date().toISOString(),
    level,
    source: extracted.source,
    message: extracted.message,
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  for (const fn of subscribers) {
    try { fn(entry); } catch { /* nunca romper el flujo por un suscriptor */ }
  }
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getEntries(opts?: {
  level?: LogLevel;
  search?: string;
  sinceId?: number;
  limit?: number;
}): LogEntry[] {
  let out = buffer;
  if (opts?.level) out = out.filter((e) => e.level === opts.level);
  if (opts?.sinceId != null) out = out.filter((e) => e.id > opts.sinceId!);
  if (opts?.search) {
    const q = opts.search.toLowerCase();
    out = out.filter(
      (e) => e.message.toLowerCase().includes(q) || (e.source ?? "").toLowerCase().includes(q),
    );
  }
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), MAX_ENTRIES);
  return out.slice(-limit);
}

export function getStats(): {
  total: number;
  byLevel: Record<LogLevel, number>;
  errorsLastHour: number;
  warnsLastHour: number;
  bufferSize: number;
} {
  const byLevel: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, http: 0, debug: 0 };
  const hourAgo = Date.now() - 60 * 60 * 1000;
  let errorsLastHour = 0;
  let warnsLastHour = 0;
  for (const e of buffer) {
    byLevel[e.level]++;
    if (new Date(e.ts).getTime() >= hourAgo) {
      if (e.level === "error") errorsLastHour++;
      else if (e.level === "warn") warnsLastHour++;
    }
  }
  return { total: buffer.length, byLevel, errorsLastHour, warnsLastHour, bufferSize: MAX_ENTRIES };
}

export function clearBuffer(): void {
  buffer.length = 0;
}

// ─── Serialización de argumentos de console.* ────────────────────────────────

function argToString(a: unknown): string {
  if (typeof a === "string") return a;
  if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
  if (a === undefined) return "undefined";
  try {
    const s = JSON.stringify(a);
    return s.length > 500 ? s.slice(0, 500) + "…" : s;
  } catch {
    return String(a);
  }
}

// ─── Parche global de console.* ──────────────────────────────────────────────

let patched = false;

function patchConsole(): void {
  if (patched) return;
  patched = true;

  const wrap = (level: LogLevel, original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        pushLog(level, args.map(argToString).join(" "));
      } catch { /* nunca romper console */ }
      original(...args);
    };

  /* eslint-disable no-console */
  console.log = wrap("info", console.log.bind(console));
  console.info = wrap("info", console.info.bind(console));
  console.warn = wrap("warn", console.warn.bind(console));
  console.error = wrap("error", console.error.bind(console));
  console.debug = wrap("debug", console.debug.bind(console));
  /* eslint-enable no-console */

  // Monitor-only: NO cambia el comportamiento del proceso ante el crash.
  process.on("uncaughtExceptionMonitor", (err) => {
    try {
      pushLog("error", `[uncaughtException] ${err?.stack ?? String(err)}`, "process");
    } catch { /* noop */ }
  });

  process.on("unhandledRejection", (reason) => {
    try {
      const msg = reason instanceof Error ? reason.stack ?? reason.message : argToString(reason);
      pushLog("error", `[unhandledRejection] ${msg}`, "process");
    } catch { /* noop */ }
  });
}

patchConsole();
pushLog("info", "Visor de logs iniciado — capturando console.* y pino", "logs");
