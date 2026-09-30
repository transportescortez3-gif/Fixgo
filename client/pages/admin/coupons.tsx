import { useState, useEffect } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, Tag, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const CLP = (n: number) => "$" + n.toLocaleString("es-CL");

interface Coupon {
  id: number;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  validPlans: string[] | null;
  validIntervals: string[] | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

const PLAN_OPTIONS = [
  "client_premium_monthly", "client_premium_annual",
  "pro_monthly", "pro_annual",
  "pro_plus_monthly", "pro_plus_annual",
];

const INTERVAL_OPTIONS = ["monthly", "annual"];

const emptyForm = {
  code: "",
  discountType: "percent" as "percent" | "fixed",
  discountValue: 10,
  maxUses: "",
  validPlans: [] as string[],
  validIntervals: [] as string[],
  expiresAt: "",
};

export default function AdminCoupons() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
    loadCoupons();
  }, [user]);

  function getToken() {
    return localStorage.getItem("fixgo_token");
  }

  async function loadCoupons() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setCoupons(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          code: form.code.toUpperCase().trim(),
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          validPlans: form.validPlans.length > 0 ? form.validPlans : null,
          validIntervals: form.validIntervals.length > 0 ? form.validIntervals : null,
          expiresAt: form.expiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al crear"); return; }
      setShowForm(false);
      setForm(emptyForm);
      loadCoupons();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: number, current: boolean) {
    await fetch(`/api/admin/coupons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ isActive: !current }),
    });
    loadCoupons();
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este cupón?")) return;
    await fetch(`/api/admin/coupons/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    loadCoupons();
  }

  function togglePlan(plan: string) {
    setForm((f) => ({
      ...f,
      validPlans: f.validPlans.includes(plan)
        ? f.validPlans.filter((p) => p !== plan)
        : [...f.validPlans, plan],
    }));
  }

  function toggleInterval(i: string) {
    setForm((f) => ({
      ...f,
      validIntervals: f.validIntervals.includes(i)
        ? f.validIntervals.filter((x) => x !== i)
        : [...f.validIntervals, i],
    }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Tag size={22} className="text-blue-400" /> Cupones de descuento
          </h1>
          <button
            onClick={() => { setShowForm(true); setForm(emptyForm); setError(""); }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
          >
            <Plus size={16} /> Nuevo cupón
          </button>
        </div>

        {/* Formulario nuevo cupón */}
        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h2 className="mb-4 font-semibold text-white">Crear cupón</h2>
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Código</label>
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="FIXGO50"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Tipo</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as any })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                  >
                    <option value="percent">Porcentaje (%)</option>
                    <option value="fixed">Monto fijo (CLP)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Valor {form.discountType === "percent" ? "(%)" : "(CLP)"}
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={form.discountType === "percent" ? 100 : undefined}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Usos máximos (vacío = ilimitado)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder="Ilimitado"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Expira el (vacío = nunca)</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs text-zinc-400">Planes válidos (vacío = todos)</label>
                <div className="flex flex-wrap gap-2">
                  {PLAN_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlan(p)}
                      className={`rounded-lg border px-2 py-1 text-xs transition ${
                        form.validPlans.includes(p)
                          ? "border-blue-500 bg-blue-500/10 text-blue-400"
                          : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs text-zinc-400">Intervalos válidos (vacío = todos)</label>
                <div className="flex gap-2">
                  {INTERVAL_OPTIONS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleInterval(i)}
                      className={`rounded-lg border px-3 py-1 text-xs transition ${
                        form.validIntervals.includes(i)
                          ? "border-blue-500 bg-blue-500/10 text-blue-400"
                          : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {i === "monthly" ? "Mensual" : "Anual"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-zinc-600 py-2 text-sm text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : "Crear cupón"}
              </button>
            </div>
          </form>
        )}

        {/* Lista de cupones */}
        {loading ? (
          <div className="text-center text-zinc-400">Cargando…</div>
        ) : coupons.length === 0 ? (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8 text-center text-zinc-500">
            No hay cupones. Crea el primero.
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <div key={c.id} className={`rounded-2xl border p-4 ${c.isActive ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900/50 opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{c.code}</span>
                      {!c.isActive && (
                        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">Inactivo</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {c.discountType === "percent"
                        ? `${c.discountValue}% de descuento`
                        : `${CLP(c.discountValue)} de descuento`}
                      {" · "}
                      {c.usedCount} usado{c.usedCount !== 1 ? "s" : ""}
                      {c.maxUses ? ` / ${c.maxUses}` : " (ilimitado)"}
                    </div>
                    {c.expiresAt && (
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Expira: {new Date(c.expiresAt).toLocaleDateString("es-CL")}
                      </div>
                    )}
                    {c.validPlans && c.validPlans.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.validPlans.map((p) => (
                          <span key={p} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => toggleActive(c.id, c.isActive)}
                      className="text-zinc-400 hover:text-blue-400 transition"
                      title={c.isActive ? "Desactivar" : "Activar"}
                    >
                      {c.isActive ? <ToggleRight size={22} className="text-green-400" /> : <ToggleLeft size={22} />}
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-zinc-600 hover:text-red-400 transition"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
