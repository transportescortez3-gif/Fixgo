import { useLocation, useSearch } from "wouter";
import { Crown, Calendar, RefreshCw, XCircle, CheckCircle, Clock, AlertTriangle, ChevronRight, Receipt } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { useState, useEffect } from "react";

const CLP = (n: number) => "$" + n.toLocaleString("es-CL") + " CLP";

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:    { label: "Activa",      color: "text-green-400",  icon: <CheckCircle size={15} /> },
  trialing:  { label: "Período de prueba", color: "text-blue-400", icon: <Clock size={15} /> },
  past_due:  { label: "Pago pendiente", color: "text-blue-400", icon: <AlertTriangle size={15} /> },
  cancelled: { label: "Cancelada",   color: "text-zinc-400",   icon: <XCircle size={15} /> },
  expired:   { label: "Vencida",     color: "text-red-400",    icon: <XCircle size={15} /> },
};

function dateStr(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

export default function MiPlanPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const statusParam = params.get("status");
  const [, navigate] = useLocation();
  const { subscription, plan, isLoading, daysLeft, refetch } = useSubscription();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [cancellingPending, setCancellingPending] = useState(false);

  useEffect(() => {
    if (statusParam && ["success", "rejected", "cancelled", "error"].includes(statusParam)) {
      refetch();
    }
  }, [statusParam, refetch]);

  useEffect(() => {
    const token = localStorage.getItem("fixgo_token");
    fetch("/api/subscriptions/history", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setPaymentsLoading(false));
  }, []);

  async function handleCancel() {
    setCancelling(true);
    setCancelError("");
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error ?? "Error al cancelar");
        return;
      }
      setShowCancelConfirm(false);
      refetch();
    } catch {
      setCancelError("Error de conexión");
    } finally {
      setCancelling(false);
    }
  }

  async function handleCancelPending() {
    setCancellingPending(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/subscriptions/cancel-pending", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error ?? "Error al cancelar el intento");
        return;
      }
      setPayments((current) =>
        current.map((payment) =>
          payment.id === data.paymentId ? { ...payment, status: "cancelled" } : payment
        )
      );
      await refetch();
    } catch {
      setCancelError("Error de conexión");
    } finally {
      setCancellingPending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const statusInfo = subscription ? STATUS_LABEL[subscription.status] : null;

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-2xl font-bold text-white">Mi Plan</h1>

        {/* Alerta resultado de pago */}
        {statusParam === "success" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-400">
            <CheckCircle size={16} /> ¡Pago exitoso! Tu suscripción está activa.
          </div>
        )}
        {statusParam === "rejected" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            <XCircle size={16} /> El pago fue rechazado. Intenta de nuevo.
          </div>
        )}
        {statusParam === "error" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-sm text-blue-400">
            <AlertTriangle size={16} /> Hubo un error con el pago. Contáctanos si el cargo fue realizado.
          </div>
        )}
        {statusParam === "cancelled" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            <XCircle size={16} /> El intento de pago fue cancelado. Tu plan activo no cambió.
          </div>
        )}

        {!paymentsLoading && payments.some((payment) => payment.status === "pending") && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-start gap-2 text-sm text-amber-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Tienes un intento de pago sin completar.</p>
                <p className="mt-1 text-xs text-amber-200/80">
                  No afecta tu plan actual. Puedes cancelarlo para volver a elegir un plan.
                </p>
                <button
                  onClick={() => void handleCancelPending()}
                  disabled={cancellingPending}
                  className="mt-3 rounded-lg border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  {cancellingPending ? "Cancelando…" : "Cancelar intento y volver a planes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sin suscripción */}
        {!subscription && (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-center">
            <Crown size={40} className="mx-auto mb-3 text-zinc-600" />
            <p className="mb-4 text-zinc-400">No tienes ninguna suscripción activa.</p>
            <button
              onClick={() => navigate("/planes")}
              className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-black hover:bg-blue-500"
            >
              Ver planes
            </button>
          </div>
        )}

        {/* Suscripción activa */}
        {subscription && (
          <>
            <div className="mb-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-white">{plan?.name ?? subscription.planCode}</div>
                  <div className="text-sm text-zinc-400">
                    {subscription.interval === "annual" ? "Pago anual" : "Pago mensual"}
                  </div>
                </div>
                {statusInfo && (
                  <span className={`flex items-center gap-1 text-sm font-medium ${statusInfo.color}`}>
                    {statusInfo.icon} {statusInfo.label}
                  </span>
                )}
              </div>

              <div className="space-y-3 border-t border-zinc-800 pt-4 text-sm">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Calendar size={14} className="text-zinc-500" />
                  <span>
                    Vence el{" "}
                    <span className="font-medium text-white">
                      {dateStr(subscription.currentPeriodEnd)}
                    </span>
                  </span>
                </div>

                {daysLeft <= 7 && daysLeft > 0 && subscription.status === "active" && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-blue-400">
                    <AlertTriangle size={14} />
                    Vence en {daysLeft} día{daysLeft !== 1 ? "s" : ""}
                  </div>
                )}

                {subscription.pricePaidClp > 0 && (
                  <div className="flex justify-between text-zinc-400">
                    <span>Último pago</span>
                    <span className="text-white">{CLP(subscription.pricePaidClp)}</span>
                  </div>
                )}

                {subscription.couponCode && (
                  <div className="flex justify-between text-zinc-400">
                    <span>Cupón aplicado</span>
                    <span className="text-green-400">{subscription.couponCode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="mb-4 space-y-3">
              {/* Renovar / Contratar */}
              {(subscription.status === "active" || subscription.status === "cancelled" || subscription.status === "expired") && (
                <button
                  onClick={() => navigate("/planes")}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw size={16} className="text-blue-400" />
                    {subscription.status === "expired" ? "Renovar plan" : "Cambiar o renovar plan"}
                  </span>
                  <ChevronRight size={16} className="text-zinc-500" />
                </button>
              )}

              {/* Cancelar */}
              {subscription.status === "active" && (
                <>
                  {!showCancelConfirm ? (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400 transition hover:bg-zinc-800"
                    >
                      <span className="flex items-center gap-2">
                        <XCircle size={16} /> Cancelar suscripción
                      </span>
                      <ChevronRight size={16} className="text-zinc-500" />
                    </button>
                  ) : (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                      <p className="mb-3 text-sm text-zinc-300">
                        ¿Seguro que deseas cancelar? Tu plan seguirá activo hasta el{" "}
                        <span className="font-semibold text-white">
                          {dateStr(subscription.currentPeriodEnd)}
                        </span>
                        .
                      </p>
                      {cancelError && <p className="mb-2 text-xs text-red-400">{cancelError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 rounded-lg border border-zinc-600 py-2 text-sm text-zinc-300"
                        >
                          No, mantener
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={cancelling}
                          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {cancelling ? "Cancelando…" : "Sí, cancelar"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Historial de pagos */}
        {!paymentsLoading && payments.length > 0 && (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Receipt size={15} /> Historial de pagos
            </div>
            <div className="space-y-2">
              {payments.slice(0, 10).map((p: any) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-zinc-400">
                    {new Date(p.createdAt).toLocaleDateString("es-CL")}
                    {p.status === "paid" && (
                      <span className="ml-2 text-xs text-green-400">✓ Pagado</span>
                    )}
                    {p.status === "rejected" && (
                      <span className="ml-2 text-xs text-red-400">✗ Rechazado</span>
                    )}
                    {p.status === "pending" && (
                      <span className="ml-2 text-xs text-blue-400">Pendiente</span>
                    )}
                    {p.status === "cancelled" && (
                      <span className="ml-2 text-xs text-zinc-500">Cancelado</span>
                    )}
                  </span>
                  <span className="text-white">{CLP(p.amountClp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
