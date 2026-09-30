import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Crown, XCircle, CheckCircle, Clock, AlertTriangle, RefreshCw, Gift, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const CLP = (n: number) => "$" + n.toLocaleString("es-CL");
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-CL") : "—";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:    { label: "Activa",     color: "bg-green-500/20 text-green-400 border-green-500/30",   icon: <CheckCircle size={12} /> },
  trialing:  { label: "Trial",      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",      icon: <Clock size={12} /> },
  past_due:  { label: "Vencida",    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",icon: <AlertTriangle size={12} /> },
  cancelled: { label: "Cancelada",  color: "bg-red-500/20 text-red-400 border-red-500/30",         icon: <XCircle size={12} /> },
  expired:   { label: "Expirada",   color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",      icon: <XCircle size={12} /> },
};

const PLAN_NAMES: Record<string, string> = {
  client_premium_monthly: "Cliente Premium Mensual",
  client_premium_annual:  "Cliente Premium Anual",
  pro_monthly:            "Pro Mensual",
  pro_annual:             "Pro Anual",
  pro_plus_monthly:       "Pro+ Mensual",
  pro_plus_annual:        "Pro+ Anual",
};

interface Subscription {
  id: number;
  userId: number;
  planCode: string;
  status: string;
  interval: string;
  pricePaidClp: number;
  couponCode: string | null;
  discountClp: number;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  userRole: string;
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  role: string;
}

const emptyGrant = { planCode: "pro_monthly", interval: "monthly", days: "30" };

const getToken = () => localStorage.getItem("fixgo_token") || "";

function UserPicker({ onSelect }: { onSelect: (u: UserResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (r.ok) { const d = await r.json(); setResults(d); setOpen(true); }
      } finally { setSearching(false); }
    }, 300);
  }, [q]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar por nombre o email..."
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 pl-8 pr-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {searching && <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl bg-zinc-800 border border-zinc-700 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {results.map(u => (
            <button key={u.id} type="button"
              onClick={() => { onSelect(u); setQ(""); setResults([]); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 text-left transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {u.name[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white font-medium truncate">{u.name}</p>
                <p className="text-xs text-zinc-400 truncate">{u.email} · {u.role === "worker" ? "Fixgo" : "Usuario"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && q.length >= 2 && !searching && (
        <div className="absolute z-50 mt-1 w-full rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-3 text-sm text-zinc-400">
          No se encontraron usuarios
        </div>
      )}
    </div>
  );
}

export default function AdminSubscriptions() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [rows, setRows] = useState<Subscription[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [grant, setGrant] = useState(emptyGrant);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState("");
  const LIMIT = 20;

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      if (filterPlan) params.set("planCode", filterPlan);
      const res = await fetch(`/api/admin/subscriptions?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows);
        setTotal(data.total);
      }
    } finally { setLoading(false); }
  }, [page, search, filterStatus, filterPlan]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id: number, status: string) {
    if (!confirm(`¿Cambiar estado a "${STATUS_LABELS[status]?.label ?? status}"?`)) return;
    setActionId(id);
    await fetch(`/api/admin/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ status }),
    });
    setActionId(null);
    load();
  }

  async function extendPeriod(id: number) {
    const days = prompt("¿Cuántos días extender?", "30");
    if (!days || isNaN(Number(days))) return;
    const sub = rows.find(r => r.id === id);
    if (!sub) return;
    const newEnd = new Date(sub.currentPeriodEnd);
    newEnd.setDate(newEnd.getDate() + parseInt(days));
    setActionId(id);
    await fetch(`/api/admin/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ currentPeriodEnd: newEnd.toISOString() }),
    });
    setActionId(null);
    load();
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) { setGrantError("Selecciona un usuario primero"); return; }
    setGrantSaving(true);
    setGrantError("");
    try {
      const res = await fetch("/api/admin/subscriptions/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          userId: selectedUser.id,
          planCode: grant.planCode,
          interval: grant.interval,
          days: parseInt(grant.days),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGrantError(data.error ?? "Error"); return; }
      setShowGrant(false);
      setGrant(emptyGrant);
      setSelectedUser(null);
      load();
    } finally { setGrantSaving(false); }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 pb-28">
      <div className="mx-auto max-w-5xl">

        {/* Encabezado */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Crown size={22} className="text-blue-400" /> Suscripciones
            <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-sm font-normal text-zinc-400">{total}</span>
          </h1>
          <button
            onClick={() => { setShowGrant(true); setGrant(emptyGrant); setGrantError(""); setSelectedUser(null); }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
          >
            <Gift size={16} /> Otorgar plan
          </button>
        </div>

        {/* Modal Otorgar plan */}
        {showGrant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-6 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Gift size={18} className="text-blue-400" /> Otorgar plan gratuito</h2>
              <form onSubmit={handleGrant} className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Usuario</label>
                  {selectedUser ? (
                    <div className="flex items-center gap-2 rounded-lg bg-blue-900/30 border border-blue-700/40 px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {selectedUser.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium truncate">{selectedUser.name}</p>
                        <p className="text-xs text-blue-300 truncate">{selectedUser.email}</p>
                      </div>
                      <button type="button" onClick={() => setSelectedUser(null)} className="text-zinc-500 hover:text-white shrink-0">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <UserPicker onSelect={setSelectedUser} />
                  )}
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Plan</label>
                  <select value={grant.planCode} onChange={e => setGrant(f => ({ ...f, planCode: e.target.value }))}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {Object.entries(PLAN_NAMES).map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Intervalo</label>
                  <select value={grant.interval} onChange={e => setGrant(f => ({ ...f, interval: e.target.value }))}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Días de acceso</label>
                  <input type="number" required min={1} value={grant.days}
                    onChange={e => setGrant(f => ({ ...f, days: e.target.value }))}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                {grantError && <p className="text-red-400 text-xs">{grantError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowGrant(false)}
                    className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancelar</button>
                  <button type="submit" disabled={grantSaving}
                    className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">
                    {grantSaving ? "Guardando..." : "Otorgar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text" placeholder="Buscar por nombre o email..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}
            className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="">Todos los planes</option>
            {Object.entries(PLAN_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <RefreshCw size={20} className="animate-spin mr-2" /> Cargando...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 py-16 text-center text-zinc-500">
            No se encontraron suscripciones
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(sub => {
              const st = STATUS_LABELS[sub.status] ?? { label: sub.status, color: "bg-zinc-700 text-zinc-300 border-zinc-600", icon: null };
              const isExpired = new Date(sub.currentPeriodEnd) < new Date();
              return (
                <div key={sub.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Info usuario */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{sub.userName}</span>
                      <span className="text-xs text-zinc-500">{sub.userEmail}</span>
                      <span className="text-xs text-zinc-600 uppercase tracking-wide">{sub.userRole}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-300">{PLAN_NAMES[sub.planCode] ?? sub.planCode}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.color}`}>
                        {st.icon} {st.label}
                      </span>
                      {sub.couponCode && (
                        <span className="rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 px-2 py-0.5 text-[11px]">
                          {sub.couponCode} −{CLP(sub.discountClp)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-zinc-500">
                      <span>Inicio: {fmtDate(sub.currentPeriodStart)}</span>
                      <span className={isExpired && sub.status === "active" ? "text-orange-400" : ""}>
                        Vence: {fmtDate(sub.currentPeriodEnd)}
                      </span>
                      {sub.trialEndsAt && <span>Trial hasta: {fmtDate(sub.trialEndsAt)}</span>}
                      <span>Pagado: {CLP(sub.pricePaidClp)}</span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {sub.status !== "active" && (
                      <button
                        onClick={() => changeStatus(sub.id, "active")}
                        disabled={actionId === sub.id}
                        className="rounded-lg bg-green-600/20 border border-green-600/30 text-green-400 px-3 py-1.5 text-xs font-medium hover:bg-green-600/30 disabled:opacity-50"
                      >
                        Activar
                      </button>
                    )}
                    {sub.status !== "cancelled" && sub.status !== "expired" && (
                      <button
                        onClick={() => changeStatus(sub.id, "cancelled")}
                        disabled={actionId === sub.id}
                        className="rounded-lg bg-red-600/20 border border-red-600/30 text-red-400 px-3 py-1.5 text-xs font-medium hover:bg-red-600/30 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      onClick={() => extendPeriod(sub.id)}
                      disabled={actionId === sub.id}
                      className="rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 px-3 py-1.5 text-xs font-medium hover:bg-blue-500/30 disabled:opacity-50"
                    >
                      +Días
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg bg-zinc-800 border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-zinc-400">Página {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg bg-zinc-800 border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
