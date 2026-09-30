import { useEffect, useRef, useState } from "react";
import { useListNotifications, useMarkNotificationRead } from "@/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Bell, Briefcase, CheckCircle, CreditCard, MessageSquare, Star, AlertTriangle, Check, CheckCheck, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@/api";
import { useLocation } from "wouter";

const ACTIVE_TYPES = new Set([
  "service_request",
  "service_accepted",
  "new_message",
  "missed_call",
  "incoming_call",
  "proposal_received",
  "proposal_accepted",
  "cancellation_charge",
]);

const NAVIGATE_ANYWAY_TYPES = new Set([
  "service_completed",
  "service_cancelled",
  "connection_closed",
  "review",
  "direct_rejected",
]);

const CLOSED_TYPES = new Set<string>();

function isActiveNotification(notification: any): boolean {
  if (CLOSED_TYPES.has(notification.type)) return false;
  if (notification.type?.startsWith("subscription")) return false;
  if (notification.type?.startsWith("kyc")) return false;
  if (notification.type === "payment") return false;
  return ACTIVE_TYPES.has(notification.type);
}

const INACTIVE_STATUSES = new Set(["completed", "cancelled"]);

export default function Notifications() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isLoading } = useListNotifications({}, { query: { staleTime: 15_000, queryKey: getListNotificationsQueryKey() } });
  const markReadMutation = useMarkNotificationRead();
  const markedAllRef = useRef(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);

  const notifications = Array.isArray(data) ? data : (data as any)?.notifications || [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  useEffect(() => {
    if (markedAllRef.current || isLoading || notifications.length === 0) return;
    const hasUnread = notifications.some((n: any) => !n.isRead);
    if (!hasUnread) return;
    markedAllRef.current = true;
    const token = localStorage.getItem("fixgo_token");
    fetch("/api/notifications/mark-all-read", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    }).catch(() => {});
  }, [isLoading, notifications.length]);

  const handleMarkRead = async (id: number) => {
    try {
      await markReadMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (e) {
    }
  };

  const handleCardClick = async (notification: any) => {
    if (!notification.relatedId) return;

    if (notification.type === "cancellation_charge") {
      if (!notification.isRead) handleMarkRead(notification.id);
      navigate(`/mis-trabajos?chargeServiceId=${notification.relatedId}`);
      return;
    }

    if (NAVIGATE_ANYWAY_TYPES.has(notification.type)) {
      if (!notification.isRead) handleMarkRead(notification.id);
      navigate(`/services/${notification.relatedId}`);
      return;
    }

    if (!ACTIVE_TYPES.has(notification.type)) {
      return;
    }

    setCheckingId(notification.id);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/services/${notification.relatedId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        toast.error("Este servicio ya ha finalizado o no se encuentra disponible");
        return;
      }
      const service = await res.json();
      if (INACTIVE_STATUSES.has(service?.status)) {
        toast.error("Este servicio ya ha finalizado o no se encuentra disponible");
        return;
      }
      if (!notification.isRead) {
        handleMarkRead(notification.id);
      }
      navigate(`/services/${notification.relatedId}`);
    } catch {
      toast.error("Este servicio ya ha finalizado o no se encuentra disponible");
    } finally {
      setCheckingId(null);
    }
  };

  const markAllRead = () => {
    const token = localStorage.getItem("fixgo_token");
    fetch("/api/notifications/mark-all-read", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    }).catch(() => {});
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'service_request': return <Briefcase className="w-5 h-5 text-blue-500" />;
      case 'service_accepted': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'service_completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'new_message': return <MessageSquare className="w-5 h-5 text-purple-500" />;
      case 'payment': return <CreditCard className="w-5 h-5 text-blue-500" />;
      case 'cancellation_charge': return <CreditCard className="w-5 h-5 text-green-500" />;
      case 'account_warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'account_suspension': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'review': return <Star className="w-5 h-5 text-blue-500" />;
      default: return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="container px-4 py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Notificaciones</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
            <CheckCheck className="w-4 h-4" /> Marcar todas leídas
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="p-6 flex gap-4">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="space-y-2 w-full">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length > 0 ? (
            <div className="divide-y">
              {notifications.map((notification: any) => {
                const active = isActiveNotification(notification);
                const clickable = active && !!notification.relatedId;

                return (
                  <div
                    key={notification.id}
                    onClick={() => checkingId === null && handleCardClick(notification)}
                    className={`p-4 sm:p-6 flex gap-4 transition-colors ${
                      clickable
                        ? "cursor-pointer hover:bg-primary/8 active:bg-primary/12"
                        : notification.relatedId
                        ? "cursor-pointer hover:bg-muted/20"
                        : "cursor-default"
                    } ${!notification.isRead ? "bg-primary/5" : "hover:bg-muted/30"} ${checkingId === notification.id ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <div className="shrink-0 mt-1">
                      <div className={`p-2 rounded-full shadow-sm border ${!active ? "opacity-40" : "bg-background"}`}>
                        {checkingId === notification.id
                          ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          : !active
                          ? <Lock className="w-5 h-5 text-muted-foreground" />
                          : getIcon(notification.type)
                        }
                      </div>
                    </div>
                    <div className={`flex-1 space-y-1 ${!active ? "opacity-50" : ""}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h4 className={`font-medium ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                          {notification.title}
                        </h4>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(notification.createdAt), "d 'de' MMM, h:mm a", { locale: es })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
                      {!active && notification.relatedId && (
                        <p className="text-[11px] text-muted-foreground/60 italic mt-0.5">Interacción finalizada</p>
                      )}
                    </div>
                    {!notification.isRead && (
                      <div className="shrink-0 pl-2 flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); handleMarkRead(notification.id); }}
                          title="Marcar como leída"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>¡Estás al día! No hay notificaciones.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
