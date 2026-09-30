import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { TrendingUp, Crown, Users, RefreshCw, ArrowUpRight, ArrowDownRight, Minus, BarChart3, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react";

const CLP = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CL");

const PLAN_NAMES: Record<string, string> = {
  client_premium_monthly: "Cliente Premium Mensual",
  client_premium_annual:  "Cliente Premium Anual",
  pro_monthly:            "Pro Mensual",
  pro_annual:             "Pro Anual",
  pro_plus_monthly:       "Pro+ Mensual",
  pro_plus_annual:        "Pro+ Anual",
};

const PLAN_COLORS: Record<string, string> = {
  client_premium_monthly: "bg-blue-500",
  client_premium_annual:  "bg-blue-700",
  pro_monthly:            "bg-blue-600",
  pro_annual:             "bg-blue-700",
  pro_plus_monthly:       "bg-purple-500",
  pro_plus_annual:        "bg-purple-700",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:    { label: "Activas",    color: "text-green-400",  icon: <CheckCircle size={14} /> },
  trialing:  { label: "Trial",      color: "text-blue-400",   icon: <Clock size={14} /> },
  past_due:  { label: "Vencidas",   color: "text-orange-400", icon: <AlertTriangle size={14} /> },
  cancelled: { label: "Canceladas", color: "text-red-400",    icon: <XCircle size={14} /> },
  expired:   { label: "Expiradas",  color: "text-zinc-400",   icon: <XCircle size={14} /> },
};

const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

interface StatsData {
  mrr: number;
  arr: number;
  byStatus: { status: string; total: string }[];
  byPlan: { plan_code: string; interval: string; total: string }[];
  newThisMonth: number;
  newLastMonth: number;
  trialConversionRate: number;
  trialTotal: number;
  trialConverted: number;
  revenue: { thisMonth: number; lastMonth: number; allTime: number };
  evolution: { month: string; new_subs: string }[];
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-xs text-zinc-500">—</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="flex items-center gap-0.5 text-xs text-zinc-400"><Minus size={11}/> 0%</span>;
  if (pct > 0) return <span className="flex items-center gap-0.5 text-xs text-green-400"><ArrowUpRight size={11}/> +{pct}%</span>;
  return <span className="flex items-center gap-0.5 text-xs text-red-400"><ArrowDownRight size={11}/> {pct}%</span>;
}

export default function AdminSubscriptionStats() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    try {
  const token = localStorage.getItem("fixgo_token") || "";
      const res = await fetch("/api/admin/subscriptions/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        <RefreshCw size={20} className="animate-spin mr-2" /> Cargando métricas...
      </div>
    );
  }

  const totalActive = data.byStatus.reduce((s, r) => s + parseInt(r.total), 0);
  const activeCount = parseInt(data.byStatus.find(r => r.status === "active")?.total ?? "0");
  const trialingCount = parseInt(data.byStatus.find(r => r.status === "trialing")?.total ?? "0");

  const maxEvol = Math.max(...data.evolution.map(e => parseInt(e.new_subs)), 1);
  const maxPlan = Math.max(...data.byPlan.map(p => parseInt(p.total)), 1);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 pb-28">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <TrendingUp size={22} className="text-blue-400" /> Métricas de Suscripciones
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Ingresos recurrentes y comportamiento SaaS</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
              <RefreshCw size={14} /> Actualizar
            </button>
            <Link href="/admin/subscriptions" className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500">
              <Crown size={14} /> Gestionar
            </Link>
          </div>
        </div>

        {/* KPIs principales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* MRR */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">MRR</p>
            <p className="text-2xl font-bold text-white">{CLP(data.mrr)}</p>
            <p className="text-[11px] text-zinc-600 mt-1">Ingreso mensual recurrente</p>
          </div>
          {/* ARR */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">ARR</p>
            <p className="text-2xl font-bold text-blue-400">{CLP(data.arr)}</p>
            <p className="text-[11px] text-zinc-600 mt-1">Ingreso anual recurrente</p>
          </div>
          {/* Suscriptores activos */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Activos</p>
            <p className="text-2xl font-bold text-green-400">{activeCount + trialingCount}</p>
            <p className="text-[11px] text-zinc-600 mt-1">{activeCount} activos · {trialingCount} trial</p>
          </div>
          {/* Conversión trial */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Conversión Trial</p>
            <p className="text-2xl font-bold text-purple-400">{data.trialConversionRate}%</p>
            <p className="text-[11px] text-zinc-600 mt-1">{data.trialConverted}/{data.trialTotal} convertidos</p>
          </div>
        </div>

        {/* Ingresos + nuevas suscripciones */}
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Ingresos cobrados */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 size={15} className="text-blue-400" /> Ingresos cobrados (Webpay)
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Este mes</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{CLP(data.revenue.thisMonth)}</span>
                  <Delta current={data.revenue.thisMonth} previous={data.revenue.lastMonth} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Mes anterior</span>
                <span className="text-sm font-bold text-zinc-300">{CLP(data.revenue.lastMonth)}</span>
              </div>
              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total histórico</span>
                <span className="text-sm font-bold text-blue-400">{CLP(data.revenue.allTime)}</span>
              </div>
            </div>
          </div>

          {/* Nuevas suscripciones */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Users size={15} className="text-blue-400" /> Nuevas suscripciones
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Este mes</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{data.newThisMonth}</span>
                  <Delta current={data.newThisMonth} previous={data.newLastMonth} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Mes anterior</span>
                <span className="text-sm font-bold text-zinc-300">{data.newLastMonth}</span>
              </div>
              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total historial</span>
                <span className="text-sm font-bold text-blue-400">{totalActive}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Evolución 6 meses */}
        {data.evolution.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <TrendingUp size={15} className="text-green-400" /> Nuevas suscripciones (últimos 6 meses)
            </h3>
            <div className="flex items-end gap-2 h-28">
              {data.evolution.map((e) => {
                const val = parseInt(e.new_subs);
                const heightPct = Math.max((val / maxEvol) * 100, 4);
                const [year, month] = e.month.split("-");
                const monthName = MONTH_NAMES[parseInt(month) - 1] ?? month;
                return (
                  <div key={e.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-zinc-400 font-medium">{val}</span>
                    <div className="w-full rounded-t-md bg-blue-500/80 hover:bg-blue-500 transition-all" style={{ height: `${heightPct}%` }} />
                    <span className="text-[10px] text-zinc-500">{monthName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Por estado */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <CheckCircle size={15} className="text-green-400" /> Por estado
            </h3>
            <div className="space-y-2">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const row = data.byStatus.find(r => r.status === key);
                const val = parseInt(row?.total ?? "0");
                const pct = totalActive > 0 ? Math.round((val / totalActive) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 w-28 shrink-0 text-xs ${cfg.color}`}>{cfg.icon}{cfg.label}</span>
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-current transition-all" style={{ width: `${pct}%`, color: "inherit" }} />
                    </div>
                    <span className="text-xs text-zinc-300 w-6 text-right">{val}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Por plan */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Crown size={15} className="text-blue-400" /> Activas por plan
            </h3>
            {data.byPlan.length === 0 ? (
              <p className="text-sm text-zinc-500">Sin suscripciones activas aún</p>
            ) : (
              <div className="space-y-2.5">
                {data.byPlan.map((p) => {
                  const val = parseInt(p.total);
                  const pct = Math.max((val / maxPlan) * 100, 4);
                  const color = PLAN_COLORS[p.plan_code] ?? "bg-zinc-500";
                  return (
                    <div key={`${p.plan_code}-${p.interval}`} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-300 truncate max-w-[180px]">{PLAN_NAMES[p.plan_code] ?? p.plan_code}</span>
                        <span className="text-xs font-bold text-white ml-2">{val}</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
