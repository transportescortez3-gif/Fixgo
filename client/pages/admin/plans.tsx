import { useState, useEffect, useCallback } from "react";
import { Package, Edit2, Check, X, RefreshCw, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { toast } from "sonner";

const CLP = (n: number) => n === 0 ? "Gratis" : "$" + n.toLocaleString("es-CL") + " CLP";

interface Plan {
  id: number;
  code: string;
  name: string;
  role: string;
  interval: string;
  priceClp: number;
  features: Record<string, any>;
  isActive: boolean;
  sortOrder: number;
}

const ROLE_LABEL: Record<string, string> = { worker: "Profesional", client: "Cliente" };
const INTERVAL_LABEL: Record<string, string> = { monthly: "Mensual", annual: "Anual" };

const WORKER_FEATURES: Array<{ key: string; label: string; type: "boolean" | "number" | "select"; options?: string[] }> = [
  { key: "radius_km",         label: "Radio de trabajo (km, -1=ilimitado)",     type: "number" },
  { key: "leads_per_month",   label: "Leads por mes (-1=ilimitados)",            type: "number" },
  { key: "messages_per_month",label: "Mensajes por mes (-1=ilimitados)",         type: "number" },
  { key: "categories",        label: "Categorías (-1=ilimitadas)",               type: "number" },
  { key: "verified_badge",    label: "Insignia Verificado",                      type: "boolean" },
  { key: "priority_position", label: "Posición prioritaria en búsquedas",        type: "boolean" },
  { key: "top_position",      label: "Posición TOP en búsquedas",                type: "boolean" },
  { key: "map_featured",      label: "Destacado en el mapa",                     type: "boolean" },
  { key: "early_leads_min",   label: "Minutos de ventaja en leads (0=no)",       type: "number" },
  { key: "stats",             label: "Estadísticas",                             type: "select", options: ["none", "basic", "advanced"] },
  { key: "public_page",       label: "Página web pública",                       type: "boolean" },
  { key: "top_pro_badge",     label: "Insignia Top Pro",                         type: "boolean" },
  { key: "whatsapp_support",  label: "Soporte WhatsApp",                         type: "boolean" },
  { key: "preferred_support", label: "Soporte preferente",                       type: "boolean" },
  { key: "human_support",     label: "Soporte humano",                           type: "boolean" },
];

const CLIENT_FEATURES: Array<{ key: string; label: string; type: "boolean" | "number" | "select"; options?: string[] }> = [
  { key: "posts_per_month",   label: "Publicaciones por mes (-1=ilimitadas)",    type: "number" },
  { key: "messages_per_post", label: "Mensajes por publicación (-1=ilimitados)", type: "number" },
  { key: "map_radius_km",     label: "Radio del mapa km (-1=ilimitado)",         type: "number" },
  { key: "presale_chat",      label: "Chat antes de contratar",                  type: "boolean" },
  { key: "full_reviews",      label: "Reseñas completas",                        type: "boolean" },
  { key: "ads",               label: "Mostrar publicidad",                       type: "boolean" },
  { key: "fixxer_guarantee",  label: "Garantía Fixgo",                            type: "boolean" },
  { key: "human_support",     label: "Soporte humano",                           type: "boolean" },
];

function getFeatureSchema(role: string) {
  return role === "worker" ? WORKER_FEATURES : CLIENT_FEATURES;
}

function FeatureValue({ val }: { val: any }) {
  if (val === true) return <span className="text-green-400 text-xs">✓ Sí</span>;
  if (val === false) return <span className="text-zinc-600 text-xs">✗ No</span>;
  if (val === -1) return <span className="text-blue-400 text-xs">∞ Ilimitado</span>;
  if (val === 0 || val === null || val === undefined) return <span className="text-zinc-600 text-xs">—</span>;
  return <span className="text-zinc-200 text-xs">{String(val)}</span>;
}

interface EditModalProps {
  plan: Plan;
  onClose: () => void;
  onSaved: (updated: Plan) => void;
}

function EditModal({ plan, onClose, onSaved }: EditModalProps) {
  const [name, setName] = useState(plan.name);
  const [priceClp, setPriceClp] = useState(String(plan.priceClp));
  const [isActive, setIsActive] = useState(plan.isActive);
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder));
  const [features, setFeatures] = useState<Record<string, any>>({ ...plan.features });
  const [saving, setSaving] = useState(false);
  const schema = getFeatureSchema(plan.role);

  function setFeature(key: string, val: any) {
    setFeatures(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          priceClp: parseInt(priceClp) || 0,
          isActive,
          sortOrder: parseInt(sortOrder) || 0,
          features,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Error al guardar"); return; }
      toast.success("Plan actualizado");
      onSaved(data);
    } catch { toast.error("Error de conexión"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 overflow-y-auto p-4 sm:p-6">
      <div className="flex w-full max-w-lg max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Edit2 size={18} className="text-blue-400" />
            Editar plan
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Cerrar edición">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3 space-y-5">
          <div className="rounded-xl bg-zinc-800/60 px-4 py-2 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>Código: <span className="text-zinc-200 font-mono">{plan.code}</span></span>
            <span>Rol: <span className="text-zinc-200">{ROLE_LABEL[plan.role] ?? plan.role}</span></span>
            <span>Intervalo: <span className="text-zinc-200">{INTERVAL_LABEL[plan.interval] ?? plan.interval}</span></span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Nombre visible</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Precio (CLP)</label>
                <input
                  type="number" min={0} value={priceClp}
                  onChange={e => setPriceClp(e.target.value)}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Orden</label>
                <input
                  type="number" value={sortOrder}
                  onChange={e => setSortOrder(e.target.value)}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-zinc-300 font-medium">Plan activo</label>
              <button
                type="button"
                onClick={() => setIsActive(v => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? "bg-green-500" : "bg-zinc-700"}`}
                aria-label={isActive ? "Ocultar plan" : "Activar plan"}
                aria-pressed={isActive}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-xs ${isActive ? "text-green-400" : "text-zinc-500"}`}>{isActive ? "Visible para usuarios" : "Oculto"}</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-200 mb-3">Funcionalidades del plan</p>
            <div className="space-y-2">
              {schema.map(({ key, label, type, options }) => {
                const val = features[key];
                return (
                  <div key={key} className="flex items-center gap-3 rounded-lg bg-zinc-800/60 px-3 py-2">
                    <span className="flex-1 text-xs text-zinc-300 leading-tight">{label}</span>
                    {type === "boolean" ? (
                      <button
                        type="button"
                        onClick={() => setFeature(key, !val)}
                        className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${val ? "bg-green-500" : "bg-zinc-700"}`}
                        aria-label={`${label}: ${val ? "activo" : "inactivo"}`}
                        aria-pressed={Boolean(val)}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    ) : type === "number" ? (
                      <input
                        type="number"
                        value={val ?? 0}
                        onChange={e => setFeature(key, parseInt(e.target.value) || 0)}
                        aria-label={label}
                        className="w-24 rounded-lg bg-zinc-700 border border-zinc-600 px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-blue-500 shrink-0"
                      />
                    ) : type === "select" && options ? (
                      <select
                        value={val ?? options[0]}
                        onChange={e => setFeature(key, e.target.value)}
                        aria-label={label}
                        className="rounded-lg bg-zinc-700 border border-zinc-600 px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500 shrink-0"
                      >
                        {options.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-800 bg-zinc-900 px-6 py-4">
          <button
            type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={handleSave} disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPlans() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [filterRole, setFilterRole] = useState<"" | "worker" | "client">("");

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPlans(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(plan: Plan) {
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
        toast.success(updated.isActive ? "Plan activado" : "Plan desactivado");
      }
    } catch { toast.error("Error al cambiar estado"); }
  }

  async function moveSortOrder(plan: Plan, dir: -1 | 1) {
    const newOrder = plan.sortOrder + dir;
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sortOrder: newOrder }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPlans(prev => prev.map(p => p.id === updated.id ? updated : p).sort((a, b) => a.sortOrder - b.sortOrder));
      }
    } catch { toast.error("Error al reordenar plan"); }
  }

  const filtered = plans.filter(p => !filterRole || p.role === filterRole);

  const workerCount = plans.filter(p => p.role === "worker").length;
  const clientCount = plans.filter(p => p.role === "client").length;
  const activeCount = plans.filter(p => p.isActive).length;

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 pb-28">
      <div className="mx-auto max-w-4xl">

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <Package size={22} className="text-blue-400" /> Planes de Suscripción
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              {plans.length} planes totales · {activeCount} activos · {workerCount} profesional · {clientCount} cliente
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Recargar
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          {(["", "worker", "client"] as const).map(r => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${filterRole === r ? "bg-blue-600 text-black" : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"}`}
            >
              {r === "" ? "Todos" : r === "worker" ? "Profesional" : "Cliente"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <RefreshCw size={20} className="animate-spin mr-2" /> Cargando planes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 py-16 text-center text-zinc-500">
            No hay planes registrados
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(plan => {
              const schema = getFeatureSchema(plan.role);
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-4 transition-all ${plan.isActive ? "bg-zinc-900 border-zinc-700" : "bg-zinc-950 border-zinc-800 opacity-60"}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-base">{plan.name}</span>
                        <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 font-mono">{plan.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${plan.role === "worker" ? "bg-blue-500/15 border-blue-500/30 text-blue-300" : "bg-purple-500/15 border-purple-500/30 text-purple-300"}`}>
                          {ROLE_LABEL[plan.role] ?? plan.role}
                        </span>
                        <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                          {INTERVAL_LABEL[plan.interval] ?? plan.interval}
                        </span>
                        {!plan.isActive && (
                          <span className="rounded-full bg-red-500/15 border border-red-500/30 text-red-400 px-2 py-0.5 text-[10px] font-medium">Inactivo</span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-lg font-bold text-blue-400">{CLP(plan.priceClp)}</span>
                        <span className="text-xs text-zinc-500">Orden: {plan.sortOrder}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {schema.map(({ key, label }) => {
                          const val = plan.features[key];
                          if (val === undefined || val === null || val === false || val === 0) return null;
                          return (
                            <div key={key} className="flex items-center gap-1.5">
                              <span className="text-[10px] text-zinc-500 truncate">{label.split(" (")[0].split(" (-")[0]}:</span>
                              <FeatureValue val={val} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex sm:flex-col gap-2 shrink-0">
                      <button
                        onClick={() => setEditing(plan)}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 px-3 py-1.5 text-xs font-medium hover:bg-blue-500/30"
                      >
                        <Edit2 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => toggleActive(plan)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border ${plan.isActive ? "bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25" : "bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25"}`}
                      >
                        {plan.isActive ? <><EyeOff size={12} /> Ocultar</> : <><Eye size={12} /> Activar</>}
                      </button>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveSortOrder(plan, -1)}
                          className="rounded-lg bg-zinc-800 border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-700"
                          title="Subir"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => moveSortOrder(plan, 1)}
                          className="rounded-lg bg-zinc-800 border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-700"
                          title="Bajar"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => {
            setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
