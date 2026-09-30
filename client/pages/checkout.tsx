import { useState } from "react";
import { useRoute } from "wouter";
import { Tag, ShieldCheck, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useAllPlans } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";
import { Capacitor } from "@capacitor/core";
import { APP_URL } from "@/lib/app-config";
const CLP = (n: number) => "$" + n.toLocaleString("es-CL") + " CLP";

export default function CheckoutPage() {
  const [, params] = useRoute("/checkout/:planCode");
  const planCode = params?.planCode ?? "";
  const { data: plans = [], isLoading: plansLoading } = useAllPlans();
  const { user } = useAuth();

  const plan = plans.find((p) => p.code === planCode);

  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<{
    code: string;
    discountClp: number;
    finalPrice: number;
    discountType: string;
    discountValue: number;
  } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");

  if (plansLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Plan no encontrado.
      </div>
    );
  }

  const basePrice = plan.priceClp;
  const discountClp = couponApplied?.discountClp ?? 0;
  const finalPrice = couponApplied?.finalPrice ?? basePrice;

  async function handleValidateCoupon() {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    setCouponApplied(null);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/subscriptions/validate-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: couponInput.trim(),
          planCode,
          interval: plan!.interval,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error ?? "Cupón no válido");
        return;
      }
      setCouponApplied(data.coupon);
    } catch {
      setCouponError("Error al validar el cupón");
    } finally {
      setCouponLoading(false);
    }
  }

  async function handlePay() {
    if (!user) return;
    setCheckoutLoading(true);
    setError("");
    try {
      const base = Capacitor.isNativePlatform() ? APP_URL : "";
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`${base}/api/subscriptions/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planCode,
          interval: plan!.interval,
          couponCode: couponApplied?.code ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al iniciar el pago");
        return;
      }
      if (data.free) {
        window.location.href = "/mi-plan?status=success";
        return;
      }
      // Redirigir a Webpay
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.url;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "token_ws";
      input.value = data.token;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-md">
        <button
          onClick={() => history.back()}
          className="mb-6 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Volver a planes
        </button>

        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-400">
            <CheckCircle2 size={17} />
            Plan seleccionado
          </div>
          <h1 className="text-2xl font-bold text-white">Confirmar suscripción</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Revisa los detalles antes de continuar a Webpay.
          </p>
        </div>

        {/* Resumen del plan */}
        <div className="mb-6 rounded-2xl border border-blue-400/40 bg-blue-500/10 p-5 shadow-lg shadow-blue-500/5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-500/15 p-2 text-blue-300">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="text-lg font-bold text-white">{plan.name}</div>
              <div className="text-sm text-zinc-300">
                {plan.interval === "annual" ? "Pago anual" : "Pago mensual"} · Licencia de Uso de Software
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Precio base</span>
              <span className="text-white">{CLP(basePrice)}</span>
            </div>
            {couponApplied && (
              <div className="flex justify-between text-sm">
                <span className="text-green-400">
                  Cupón {couponApplied.code}{" "}
                  {couponApplied.discountType === "percent"
                    ? `(${couponApplied.discountValue}%)`
                    : ""}
                </span>
                <span className="text-green-400">-{CLP(discountClp)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-800 pt-2 text-base font-bold">
              <span className="text-white">Total a pagar</span>
              <span className="text-blue-400">{CLP(finalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Cupón de descuento */}
        <div className="mb-6 rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Tag size={15} /> Cupón de descuento (opcional)
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ej: FIXGO50"
              value={couponInput}
              onChange={(e) => {
                setCouponInput(e.target.value.toUpperCase());
                setCouponError("");
                setCouponApplied(null);
              }}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleValidateCoupon}
              disabled={couponLoading || !couponInput.trim()}
              className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50"
            >
              {couponLoading ? <Loader2 size={14} className="animate-spin" /> : "Aplicar"}
            </button>
          </div>
          {couponError && <p className="mt-2 text-xs text-red-400">{couponError}</p>}
          {couponApplied && (
            <p className="mt-2 text-xs text-green-400">
              ✓ Cupón aplicado — ahorras {CLP(couponApplied.discountClp)}
            </p>
          )}
        </div>

        {/* Botón pago */}
        {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

        <button
          onClick={handlePay}
          disabled={checkoutLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {checkoutLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <ShieldCheck size={18} />
              Pagar con Webpay — {CLP(finalPrice)}
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-600">
          Serás redirigido al portal seguro de Transbank (Webpay Plus). La suscripción no se renueva
          automáticamente — recibirás un aviso antes de vencer.
        </p>
      </div>
    </div>
  );
}
