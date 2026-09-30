import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Terminal, Pause, Play, Download, RefreshCw, Trash2, Search,
  AlertCircle, AlertTriangle, Activity, Clock, ArrowDown,
} from "lucide-react";

type LogLevel = "error" | "warn" | "info" | "http" | "debug";

interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  source: string | null;
  message: string;
}

interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  errorsLastHour: number;
  warnsLastHour: number;
  bufferSize: number;
}

const LEVEL_TABS: Array<{ key: LogLevel | "all"; label: string }> = [
  { key: "all", label: "Todo" },
  { key: "error", label: "Error" },
  { key: "warn", label: "Aviso" },
  { key: "info", label: "Info" },
  { key: "http", label: "HTTP" },
  { key: "debug", label: "Debug" },
];

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-sky-400",
  http: "text-teal-400",
  debug: "text-gray-500",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  error: "ERROR",
  warn: "WARN ",
  info: "INFO ",
  http: "HTTP ",
  debug: "DEBUG",
};

const MAX_CLIENT_ENTRIES = 2000;

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/80 text-black rounded px-0.5">{text.slice(idx, idx + term.length)}</mark>
      {highlight(text.slice(idx + term.length), term)}
    </>
  );
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-CL", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function AdminLogs() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);

  const pausedRef = useRef(false);
  const queueRef = useRef<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  pausedRef.current = paused;
  autoScrollRef.current = autoScroll;

  const token = localStorage.getItem("fixgo_token");

  const appendEntries = useCallback((incoming: LogEntry[]) => {
    if (incoming.length === 0) return;
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const merged = [...prev, ...incoming.filter((e) => !seen.has(e.id))];
      merged.sort((a, b) => a.id - b.id);
      return merged.slice(-MAX_CLIENT_ENTRIES);
    });
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/logs/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch { /* silencio: el badge de conexión ya informa */ }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/logs?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: LogEntry[] = await res.json();
        setEntries(data);
      }
    } catch { /* noop */ }
    fetchStats();
  }, [token, fetchStats]);

  // Conexión SSE con reconexión automática cada 5s
  useEffect(() => {
    if (!user || (user as any).role !== "admin" || !token) return;

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const es = new EventSource(`/api/admin/logs/stream?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.addEventListener("init", (ev) => {
        try { appendEntries(JSON.parse((ev as MessageEvent).data)); } catch { /* noop */ }
      });

      es.addEventListener("log", (ev) => {
        try {
          const entry: LogEntry = JSON.parse((ev as MessageEvent).data);
          if (pausedRef.current) {
            queueRef.current.push(entry);
          } else {
            appendEntries([entry]);
          }
        } catch { /* noop */ }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!disposed) {
          reconnectRef.current = setTimeout(connect, 5000);
        }
      };
    };

    fetchLogs();
    connect();
    const statsInterval = setInterval(fetchStats, 30_000);

    return () => {
      disposed = true;
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      clearInterval(statsInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // Auto-scroll al fondo cuando llegan logs nuevos
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // Si el usuario sube manualmente, desactivar auto-scroll (sin scroll-jacking)
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom && autoScrollRef.current) setAutoScroll(false);
  };

  const togglePause = () => {
    if (paused) {
      // Reanudar: volcar la cola acumulada
      appendEntries(queueRef.current);
      queueRef.current = [];
    }
    setPaused(!paused);
  };

  const downloadTxt = () => {
    const lines = filtered.map(
      (e) => `${e.ts} [${e.level.toUpperCase()}]${e.source ? ` [${e.source}]` : ""} ${e.message}`,
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fixgo-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = async () => {
    await fetch("/api/admin/logs", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    queueRef.current = [];
    setEntries([]);
    fetchStats();
  };

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length, error: 0, warn: 0, info: 0, http: 0, debug: 0 };
    for (const e of entries) counts[e.level]++;
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    let out = entries;
    if (levelFilter !== "all") out = out.filter((e) => e.level === levelFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (e) => e.message.toLowerCase().includes(q) || (e.source ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [entries, levelFilter, search]);

  useEffect(() => {
    if (!authLoading && (!user || (user as any).role !== "admin")) navigate("/");
  }, [authLoading, user, navigate]);

  if (authLoading || !user || (user as any).role !== "admin") return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Logs del servidor</h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
            connected
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
          {connected ? "En vivo" : "Reconectando…"}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Activity className="w-3.5 h-3.5" /> En buffer</div>
          <p className="text-2xl font-bold mt-1">{stats?.total ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><AlertCircle className="w-3.5 h-3.5 text-red-400" /> Errores</div>
          <p className="text-2xl font-bold mt-1 text-red-400">{stats?.byLevel.error ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Avisos</div>
          <p className="text-2xl font-bold mt-1 text-amber-400">{stats?.byLevel.warn ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Clock className="w-3.5 h-3.5" /> Errores últ. hora</div>
          <p className="text-2xl font-bold mt-1">{stats?.errorsLastHour ?? "—"}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden">
          {LEVEL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setLevelFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                levelFilter === t.key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              }`}
            >
              {t.label}
              <span className="ml-1 opacity-70">{levelCounts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en mensajes o fuente…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-card focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <button onClick={togglePause} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-card hover:bg-muted">
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? `Reanudar${queueRef.current.length ? ` (${queueRef.current.length})` : ""}` : "Pausar"}
        </button>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${
            autoScroll ? "bg-primary/10 border-primary/40 text-primary" : "bg-card hover:bg-muted"
          }`}
        >
          <ArrowDown className="w-3.5 h-3.5" /> Auto-scroll
        </button>
        <button onClick={downloadTxt} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-card hover:bg-muted">
          <Download className="w-3.5 h-3.5" /> .txt
        </button>
        <button onClick={fetchLogs} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-card hover:bg-muted">
          <RefreshCw className="w-3.5 h-3.5" /> Recargar
        </button>
        <button onClick={clearLogs} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 text-red-500 bg-card hover:bg-red-500/10">
          <Trash2 className="w-3.5 h-3.5" /> Limpiar
        </button>
      </div>

      {/* Terminal */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="rounded-xl border border-slate-800 bg-slate-950 font-mono text-[11px] leading-relaxed h-[55vh] overflow-y-auto p-3"
      >
        {filtered.length === 0 ? (
          <p className="text-slate-600 italic">Sin logs que mostrar…</p>
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="whitespace-pre-wrap break-all hover:bg-slate-900/60 rounded px-1">
              <span className="text-slate-600">{fmtTime(e.ts)}</span>{" "}
              <span className={`font-semibold ${LEVEL_COLORS[e.level]}`}>{LEVEL_LABEL[e.level]}</span>{" "}
              {e.source && <span className="text-violet-400">[{highlight(e.source, search.trim())}]</span>}{" "}
              <span className="text-slate-300">{highlight(e.message, search.trim())}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground">
        Mostrando {filtered.length} de {entries.length} entradas ·{" "}
        buffer del servidor: {stats?.total ?? 0}/{stats?.bufferSize ?? 1000} ·{" "}
        SSE: {connected ? "conectado" : "desconectado"}{paused ? " · EN PAUSA" : ""}
      </p>
    </div>
  );
}
