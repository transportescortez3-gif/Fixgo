import { useEffect, useRef, useState } from "react";
import { getSocket, joinUserRoom } from "@/hooks/use-socket";

interface GlobalSocketHandlers {
  onNewServiceRequest?: (data: any) => void;
  onNewNotification?: (data: { type: string; relatedId: number | null; targetRole?: string | null }) => void;
  onProposalUpdated?: (data: { serviceId: number; action: string }) => void;
  onServiceUpdated?: (data: { serviceId: number; status?: string }) => void;
  onNewMessage?: (msg: any) => void;
  onNotificationsUpdated?: (data: { action: string; id?: number }) => void;
  onSubscriptionUpdated?: (data: { status: string; subscriptionId?: number }) => void;
  onKycUpdated?: (data: { status: string; reason?: string }) => void;
  onReviewReceived?: (data: any) => void;
  onCancellationCharge?: (data: { serviceId: number; action: string }) => void;
  onAccountStatusUpdated?: (data: { status: "active" | "blocked"; blockedUntil?: string | null; reason?: string }) => void;
  onAccountSuspension?: (data: { suspendedUntil?: string | null; level?: number }) => void;
  onAccountWarning?: (data: { count?: number; remaining?: number }) => void;
}

export function useGlobalSocket(userId: number | null, handlers: GlobalSocketHandlers = {}) {
  const handlersRef = useRef<GlobalSocketHandlers>(handlers);
  const [isConnected, setIsConnected] = useState(false);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;

    const socket = getSocket();
    setIsConnected(socket.connected);
    // Belt-and-suspenders: server auto-joins user_${userId} on connection,
    // but we emit explicitly in case this runs after the connect event already fired.
    joinUserRoom(userId);

    const onNewServiceRequest   = (d: any) => handlersRef.current.onNewServiceRequest?.(d);
    const onNewNotification     = (d: any) => handlersRef.current.onNewNotification?.(d);
    const onProposalUpdated     = (d: any) => handlersRef.current.onProposalUpdated?.(d);
    const onServiceUpdated      = (d: any) => handlersRef.current.onServiceUpdated?.(d);
    const onNewMessage          = (d: any) => handlersRef.current.onNewMessage?.(d);
    const onNotificationsUpdated = (d: any) => handlersRef.current.onNotificationsUpdated?.(d);
    const onSubscriptionUpdated = (d: any) => handlersRef.current.onSubscriptionUpdated?.(d);
    const onKycUpdated          = (d: any) => handlersRef.current.onKycUpdated?.(d);
    const onReviewReceived      = (d: any) => handlersRef.current.onReviewReceived?.(d);
    const onCancellationCharge  = (d: any) => handlersRef.current.onCancellationCharge?.(d);
    const onAccountStatusUpdated = (d: any) => handlersRef.current.onAccountStatusUpdated?.(d);
    const onAccountSuspension = (d: any) => handlersRef.current.onAccountSuspension?.(d);
    const onAccountWarning = (d: any) => handlersRef.current.onAccountWarning?.(d);
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("new_service_request",   onNewServiceRequest);
    socket.on("new_notification",      onNewNotification);
    socket.on("proposal_updated",      onProposalUpdated);
    socket.on("service_updated",       onServiceUpdated);
    socket.on("new_message",           onNewMessage);
    socket.on("notifications_updated", onNotificationsUpdated);
    socket.on("subscription_updated",  onSubscriptionUpdated);
    socket.on("kyc_updated",           onKycUpdated);
    socket.on("review_received",       onReviewReceived);
    socket.on("cancellation_charge",   onCancellationCharge);
    socket.on("account_status_updated", onAccountStatusUpdated);
    socket.on("account_suspension", onAccountSuspension);
    socket.on("account_warning", onAccountWarning);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      // Do NOT leave the user room: the server auto-joins it on every (re)connect
      // and emitting leave_user would break other mounted components that still need it.
      socket.off("new_service_request",   onNewServiceRequest);
      socket.off("new_notification",      onNewNotification);
      socket.off("proposal_updated",      onProposalUpdated);
      socket.off("service_updated",       onServiceUpdated);
      socket.off("new_message",           onNewMessage);
      socket.off("notifications_updated", onNotificationsUpdated);
      socket.off("subscription_updated",  onSubscriptionUpdated);
      socket.off("kyc_updated",           onKycUpdated);
      socket.off("review_received",       onReviewReceived);
      socket.off("cancellation_charge",   onCancellationCharge);
      socket.off("account_status_updated", onAccountStatusUpdated);
      socket.off("account_suspension", onAccountSuspension);
      socket.off("account_warning", onAccountWarning);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [userId]);

  return { isConnected };
}
