import { useEffect, useState, useCallback } from "react";
import { X, AlertTriangle, UserX, CheckCircle2, ArrowRight, MessageCircle, Receipt } from "lucide-react";
import { getSocket } from "@/hooks/use-socket";
import { Link } from "wouter";
import { getHomeAlertKey, selectCurrentHomeAlerts, type HomeAlertRecord } from "@/lib/home-alerts";
import { useAuth } from "@/hooks/use-auth";

/**
 * Tarjetas de aviso PERSISTENTES en la pantalla de inicio:
 * - "El cliente eligió a otro profesional" (experto no seleccionado)
 * - "El cliente/trabajador canceló el servicio" (trabajo ya pactado)
 * - "La otra parte marcó el trabajo terminado" (requiere confirmación)
 * Se alimentan de las notificaciones NO leídas; la "X" las marca como leídas,
 * así el aviso persiste entre sesiones y dispositivos hasta que el usuario lo cierre.
 */
const ALERT_TYPES = ["proposal_rejected", "service_cancelled", "work_done_confirm", "payment", "cancellation_charge", "account_warning"] as const;
const DISMISSED_ALERTS_STORAGE_KEY = "fixgo_home_alerts_dismissed_through_v1";

type DismissedAlerts = Record<string, number>;

function getDismissedAlertsStorageKey(userId: number | undefined): string | null {
  return userId ? `${DISMISSED_ALERTS_STORAGE_KEY}:${userId}` : null;
}

function readDismissedAlerts(storageKey: string | null): DismissedAlerts {
  if (!storageKey) return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => Number.isInteger(value)),
    ) as DismissedAlerts;
  } catch {
    return {};
  }
}

export default function HomeAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const dismissedAlertsStorageKey = getDismissedAlertsStorageKey(user?.id);
  const [dismissedAlerts, setDismissedAlerts] = useState<DismissedAlerts>({});

  useEffect(() => {
    setDismissedAlerts(readDismissedAlerts(dismissedAlertsStorageKey));
  }, [dismissedAlertsStorageKey]);

  const load = useCallback(() => {
    const token = localStorage.getItem("fixgo_token");
    if (!token) return;
    fetch("/api/notifications?unreadOnly=true", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        const currentAlerts = selectCurrentHomeAlerts(
          (list || []).filter(n => ALERT_TYPES.includes(n.type)) as HomeAlertRecord[],
        );
        setAlerts(currentAlerts.filter(alert => (
          alert.id > (dismissedAlerts[getHomeAlertKey(alert)] ?? -1)
        )));
      })
      .catch(() => {});
  }, [dismissedAlerts]);

  useEffect(() => {
    load();
    // Recargar cuando llegan eventos relevantes en vivo
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => load();
    socket.on("new_notification", refresh);
    socket.on("notifications_updated", refresh);
    socket.on("service_updated", refresh);
    socket.on("proposal_updated", refresh);
    return () => {
      socket.off("new_notification", refresh);
      socket.off("notifications_updated", refresh);
      socket.off("service_updated", refresh);
      socket.off("proposal_updated", refresh);
    };
  }, [load]);

  const dismiss = async (id: number) => {
    const alert = alerts.find(candidate => candidate.id === id) as HomeAlertRecord | undefined;
    if (!alert) return;

    const key = getHomeAlertKey(alert);
    setDismissedAlerts(prev => {
      const next = { ...prev, [key]: Math.max(prev[key] ?? -1, alert.id) };
      try {
        if (dismissedAlertsStorageKey) {
          localStorage.setItem(dismissedAlertsStorageKey, JSON.stringify(next));
        }
      } catch {
        // El cleanup en memoria sigue funcionando si el almacenamiento no está disponible.
      }
      return next;
    });
    setAlerts(prev => prev.filter(a => a.id !== id));
    const token = localStorage.getItem("fixgo_token");
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // sin conexión: quedará pendiente y reaparecerá en la próxima carga
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      {alerts.map(alert => {
        const isRejected = alert.type === "proposal_rejected";
        const isCompletion = alert.type === "work_done_confirm";
        const isPayment = alert.type === "payment";
        const isCancellationCharge = alert.type === "cancellation_charge";
        const isAccountWarning = alert.type === "account_warning";
        const alertContent = (
          <div className="flex gap-2.5">
            {isCompletion ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            ) : isCancellationCharge ? (
              <Receipt className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            ) : isPayment ? (
              <MessageCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            ) : isRejected ? (
              <UserX className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            ) : isAccountWarning ? (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">{alert.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
              {isPayment && (
                <Link
                  href={`/mis-trabajos?chatServiceId=${alert.relatedId ?? ""}`}
                  className="inline-flex items-center gap-1 mt-2 rounded-md bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-black hover:bg-orange-400"
                >
                  Ir al chat <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
              {isCancellationCharge && alert.relatedId && (
                <Link
                  href={`/mis-trabajos?chargeServiceId=${alert.relatedId}`}
                  className="inline-flex items-center gap-1 mt-2 rounded-md bg-green-500 px-2.5 py-1.5 text-xs font-bold text-black hover:bg-green-400"
                >
                  Confirmar pago en Mis Trabajos <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        );

        return (
          <div
            key={alert.id}
            className={`relative rounded-xl border px-3 py-3 pr-10 shadow-lg ${
              isCompletion
                ? "border-green-500/50 bg-card cursor-pointer transition-colors hover:border-green-400/80"
                : isCancellationCharge
                ? "border-green-500/50 bg-card"
                : isPayment
                ? "border-orange-500/50 bg-card"
                : isRejected
                ? "border-amber-500/40 bg-card"
                : isAccountWarning
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-red-500/40 bg-card"
            }`}
          >
            {isCompletion ? (
              <Link
                href="/mis-trabajos"
                className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                aria-label="Ver este trabajo en Mis Trabajos"
              >
                {alertContent}
                <span className="inline-flex items-center gap-1 mt-2 rounded-md bg-green-500 px-2.5 py-1.5 text-xs font-bold text-black hover:bg-green-400">
                  Ver en Mis Trabajos <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ) : (
              alertContent
            )}
            <button
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              onClick={() => dismiss(alert.id)}
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
