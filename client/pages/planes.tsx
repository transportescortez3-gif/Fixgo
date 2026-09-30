import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, CheckCircle2, Loader2, Zap, Star, Crown } from "lucide-react";
import { useAllPlans, useSubscription, type SubscriptionPlan } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";

const CLP = (n: number) =>
  n === 0 ? "Gratis" : "$" + n.toLocaleString("es-CL") + " CLP";

const PLAN_META: Record<string, { icon: React.ReactNode; color: string; highlight?: boolean; btnClass?: string }> = {
  client_free:           { icon: <Zap size={22} />, color: "text-zinc-400" },
  client_premium_monthly:{ icon: <Star size={22} />, color: "text-blue-400", highlight: true, btnClass: "bg-blue-600 text-white hover:bg-blue-500" },
  client_premium_annual: { icon: <Star size={22} />, color: "text-blue-400", highlight: true, btnClass: "bg-blue-600 text-white hover:bg-blue-500" },
  pro_free:              { icon: <Zap size={22} />, color: "text-zinc-400" },
  pro_monthly:           { icon: <Crown size={22} />, color: "text-blue-400", highlight: true, btnClass: "bg-blue-600 text-white hover:bg-blue-500" },
  pro_annual:            { icon: <Crown size={22} />, color: "text-blue-400", highlight: true, btnClass: "bg-blue-600 text-white hover:bg-blue-500" },
  pro_plus_monthly:      { icon: <Crown size={22} />, color: "text-purple-400", highlight: true, btnClass: "bg-purple-600 text-white hover:bg-purple-500" },
  pro_plus_annual:       { icon: <Crown size={22} />, color: "text-purple-400", highlight: true, btnClass: "bg-purple-600 text-white hover:bg-purple-500" },
};

const FEATURE_LABELS: Record<string, (v: any) => string | null> = {
  posts_per_month:      v => v === -1 ? "Publicaciones ilimitadas" : `${v} publicaciones/mes`,
  messages_per_post:    v => v === -1 ? "Mensajes ilimitados" : `${v} mensajes por publicación`,
  map_radius_km:        v => v === -1 ? "Mapa sin límite de radio" : `Mapa radio ${v} km`,
  presale_chat:         v => v ? "Chat antes de contratar" : null,
  full_reviews:         v => v ? "Reseñas completas" : null,
  ads:                  v => !v ? "Sin publicidad" : null,
  fixxer_guarantee:     v => v ? "Garantía Fixgo" : null,
  human_support:        v => v ? "Soporte humano" : null,
  radius_km:            v => v === -1 ? "Radio de trabajo ilimitado" : `Radio de trabajo ${v} km`,
  leads_per_month:      v => v === -1 ? "Solicitudes ilimitadas" : `${v} solicitudes al mes`,
  messages_per_month:   v => v === -1 ? null : `${v} mensajes al mes`,
  categories:           v => v === -1 ? "Categorías ilimitadas" : `${v} categoría${v > 1 ? "s" : ""}`,
  verified_badge:       v => v ? "Insignia Verificado" : null,
  priority_position:    v => v ? "Posición prioritaria en búsquedas" : null,
  top_position:         v => v ? "Posición TOP en búsquedas" : null,
  map_featured:         v => v ? "Destacado en el mapa" : null,
  early_leads_min:      v => v ? `Acceso anticipado ${v} min antes` : null,
  stats:                v => v === "advanced" ? "Estadísticas avanzadas" : v === "basic" ? "Estadísticas básicas" : null,
  video_presentation:   v => v ? "Video de presentación" : null,
  chat_text_free:       v => v ? "Chat de texto libre" : null,
  voice_calls:          v => v ? "Chat con llamadas e imágenes" : null,
  image_attachments:    v => v ? null : "Sin imágenes ni llamadas dentro de la app",
  budget_visibility:    v => v ? "Vista del presupuesto sugerido del cliente" : null,
  support_level:        v => v === "standard" ? "Soporte estándar" : v === "direct" ? "Soporte técnico directo" : v === "preferential" ? "Soporte preferencial" : null,
  public_page:          v => null,
  top_pro_badge:        v => v ? "Insignia Top Pro" : null,
  whatsapp_support:     v => v ? "Soporte WhatsApp" : null,
  preferred_support:    v => v ? "Soporte preferente" : null,
};

function featureList(features: Record<string, any>): string[] {
  return Object.entries(features)
    .map(([k, v]) => FEATURE_LABELS[k]?.(v) ?? null)
    .filter(Boolean) as string[];
}

function PlanCard({
  plan,
  isCurrent,
  isSelecting,
  onSelect,
}: {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  isSelecting: boolean;
  onSelect: () => void;
}) {
  const meta = PLAN_META[plan.code] ?? { icon: <Zap size={22} />, color: "text-zinc-400" };
  const items = featureList(plan.features as Record<string, any>);

  return (
    <div
      aria-current={isCurrent ? "true" : undefined}
      className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
        isCurrent
          ? "border-blue-400 bg-blue-950/30 shadow-xl shadow-blue-500/15 ring-1 ring-blue-400/50"
          : meta.highlight
            ? "border-blue-500/40 bg-zinc-800/80 shadow-lg shadow-blue-500/5"
            : "border-zinc-700 bg-zinc-900"
      }`}
    >
      <div className="absolute -top-3 left-4 flex flex-wrap gap-2">
        {isCurrent && (
          <span className="flex items-center gap-1 rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white shadow-lg shadow-blue-500/25">
            <CheckCircle2 size={13} />
            Tu plan actual
          </span>
        )}
        {plan.interval === "annual" && plan.priceClp > 0 && (
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
            2 meses gratis
          </span>
        )}
      </div>

      <div className={`mb-3 flex items-center justify-between gap-2 ${meta.color}`}>
        <div className="flex items-center gap-2">
          {meta.icon}
          <span className="font-semibold text-white">{plan.name}</span>
        </div>
        {isCurrent && <CheckCircle2 size={20} className="text-blue-400" aria-label="Plan activo" />}
      </div>
      {isCurrent && (
        <p className="mb-3 text-xs font-medium text-blue-300">
          Tienes acceso a los beneficios de este plan.
        </p>
      )}
      <div className="mb-4">
        <span className="text-3xl font-bold text-white">{CLP(plan.priceClp)}</span>
        {plan.priceClp > 0 && (
          <span className="ml-1 text-sm text-zinc-400">
            /{plan.interval === "annual" ? "año" : "mes"}
          </span>
        )}
      </div>
      <ul className="mb-6 flex-1 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
            <Check size={15} className="mt-0.5 shrink-0 text-green-400" />
            {item}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
        disabled={isSelecting || (plan.priceClp === 0 && !isCurrent)}
        aria-pressed={isCurrent || isSelecting}
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition ${
          isCurrent
            ? "border border-blue-300/70 bg-blue-500/25 text-blue-100 shadow-inner shadow-blue-300/10 hover:bg-blue-500/35"
            : isSelecting
              ? "bg-blue-500 text-white"
              : plan.priceClp === 0
                ? "cursor-default border border-zinc-700 bg-zinc-800/70 text-zinc-500"
                : meta.btnClass ?? "bg-zinc-700 text-white hover:bg-zinc-600"
        }`}
      >
        {isCurrent ? (
          <>
            <CheckCircle2 size={17} />
            Plan actual · Ver detalles
            <ArrowRight size={17} />
          </>
        ) : isSelecting ? (
          <>
            <Loader2 size={17} className="animate-spin" />
            Abriendo checkout…
          </>
        ) : plan.priceClp === 0 ? (
          "Plan gratuito"
        ) : (
          <>
            Elegir este plan
            <ArrowRight size={17} />
          </>
        )}
      </button>
    </div>
  );
}

export default function PlanesPage() {
  const [manualTab, setManualTab] = useState<"client" | "worker">("worker");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const { data: plans = [], isLoading } = useAllPlans();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const {
    subscription,
    plan: activePlan,
    isActive: subscriptionActive,
    isLoading: subscriptionLoading,
  } = useSubscription();
  const [selectingPlanCode, setSelectingPlanCode] = useState<string | null>(null);

  const tab: "client" | "worker" = user
    ? user.role === "worker" ? "worker" : "client"
    : manualTab;
  const showTabSelector = !user;

  const filtered = plans.filter(
    (p) => p.role === tab && (p.priceClp === 0 ? p.interval === "monthly" : p.interval === interval)
  );

  function handleSelect(plan: SubscriptionPlan) {
    if (!user) {
      navigate("/login");
      return;
    }
    const isCurrent =
      subscriptionActive &&
      (activePlan?.code === plan.code || subscription?.planCode === plan.code);
    if (isCurrent) {
      navigate("/mi-plan");
      return;
    }
    if (plan.priceClp === 0) return;
    setSelectingPlanCode(plan.code);
    window.setTimeout(() => navigate(`/checkout/${plan.code}`), 250);
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-center text-3xl font-bold text-white">Planes</h1>
        <p className="mb-6 text-center text-sm text-zinc-400">
          Suscripción de Acceso Premium — Licencia de Uso de Software
        </p>

        {!subscriptionLoading && user && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
              subscriptionActive && activePlan
                ? "border-blue-400/40 bg-blue-500/10"
                : "border-zinc-700 bg-zinc-900"
            }`}
          >
            <CheckCircle2
              size={20}
              className={subscriptionActive && activePlan ? "mt-0.5 shrink-0 text-blue-400" : "mt-0.5 shrink-0 text-zinc-500"}
            />
            <div>
              <p className="text-sm font-semibold text-white">
                {subscriptionActive && activePlan
                  ? `Tu plan actual: ${activePlan.name}`
                  : "Aún no tienes un plan premium activo"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {subscriptionActive && activePlan
                  ? "Está marcado en azul para que sepas exactamente dónde estás."
                  : "Elige un plan para desbloquear más funciones y publicar."}
              </p>
            </div>
          </div>
        )}

        {/* Tabs cliente / trabajador — solo visible si no hay sesión */}
        {showTabSelector && (
          <div className="mb-6 flex justify-center">
            <div className="flex rounded-xl bg-zinc-800 p-1">
              {(["client", "worker"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setManualTab(t)}
                  className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
                    manualTab === t ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t === "client" ? "Cliente" : "Trabajador"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toggle mensual / anual */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-3">
            <span className={`text-sm ${interval === "monthly" ? "text-white" : "text-zinc-500"}`}>
              Mensual
            </span>
            <button
              onClick={() => setInterval(interval === "monthly" ? "annual" : "monthly")}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                interval === "annual" ? "bg-blue-600" : "bg-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform mt-[0px] mb-[0px] ml-[-22px] mr-[-22px] ${
                  interval === "annual" ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className={`text-sm ${interval === "annual" ? "text-white" : "text-zinc-500"}`}>
              Anual{" "}
              <span className="text-xs font-bold text-blue-400">2 meses gratis</span>
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-zinc-400">Cargando planes…</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                isCurrent={Boolean(
                  subscriptionActive &&
                  (activePlan?.code === plan.code || subscription?.planCode === plan.code)
                )}
                isSelecting={selectingPlanCode === plan.code}
                onSelect={() => handleSelect(plan)}
              />
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-zinc-600">
          Todos los precios incluyen IVA. El pago es procesado de forma segura por Transbank (Webpay).
          La suscripción no se renueva automáticamente — recibirás un aviso antes de vencer.
        </p>
      </div>
    </div>
  );
}
