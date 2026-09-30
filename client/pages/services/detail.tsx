import { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { uploadFileToStorage } from "@/lib/storage";
import { useCountdown, formatCLP } from "@/components/cancellation-charge";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useGetNearbyWorkers } from "@/api";

const ServiceTrackingMap = lazy(() => import("@/components/service-tracking-map"));
const ServiceLocationMap = lazy(() => import("@/components/service-location-map"));
const WorkerRouteMap = lazy(() => import("@/components/worker-route-map"));
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { 
  useGetService, getGetServiceQueryKey, 
  useUpdateService,
  useAcceptService, 
  useStartService,
  useCancelService, 
  useCompleteService,
  useListMessages, getListMessagesQueryKey,
  useCreateMessage,
  useSendTypingIndicator,
  useCreateReview,
  useGetServiceProposals, getGetServiceProposalsQueryKey,
  useCreateProposal,
  useAcceptProposal,
  useRejectProposal,
  useCounterProposal,
  getListServicesQueryKey,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PostServiceModal } from "@/components/post-service-modal";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, MapPin, Clock, Send, Star, AlertCircle, CheckCircle2, XCircle, MessageSquare, ThumbsUp, ThumbsDown, Zap, Image, Check, CheckCheck, RefreshCw, ShieldAlert, Lock, ShieldCheck, Camera, TicketCheck, User as UserIcon, MessageCircle, Crown, Phone, PhoneMissed, Wrench, Calendar, DollarSign } from "lucide-react";
import { useCallContext } from "@/contexts/call-context";
import { ProposalChatSheet } from "@/components/proposal-chat-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getCategoryStyle } from "@/lib/category-icons";
import { useSubscription } from "@/hooks/use-subscription";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { encryptMessage, decryptMessage, fetchPublicKey, uploadPublicKey, isEncryptedBlob } from "@/lib/e2e-crypto";

const statusLabels: Record<string, string> = {
  pending: "PENDIENTE",
  accepted: "CONECTADO",
  in_progress: "CHAT ABIERTO",
  completed: "COMPLETADO",
  cancelled: "CANCELADO",
};

const methodLabels: Record<string, string> = {
  card: "Tarjeta",
  transfer: "Transbank Débito",
};

const messageSchema = z.object({
  content: z.string().min(1, "El mensaje no puede estar vacío"),
});

const reviewSchema = z.object({
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().optional(),
});

export default function ServiceDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { user, isClient, isWorker, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { limit: subLimit, isActive: subActive } = useSubscription();
  const { startCall } = useCallContext();
  
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isWorkerReviewOpen, setIsWorkerReviewOpen] = useState(false);
  const [workerReviewRating, setWorkerReviewRating] = useState(5);
  const [workerReviewComment, setWorkerReviewComment] = useState("");
  const [workerReviewLoading, setWorkerReviewLoading] = useState(false);
  const [chatProposalId, setChatProposalId] = useState<number | null>(null);
  const lastChatPropRef = useRef<any>(null);
  const [serviceChatOpen, setServiceChatOpen] = useState(false);
  const [workerNegotiationChatOpen, setWorkerNegotiationChatOpen] = useState(false);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<{ userId: number; name: string }[]>([]);
  const [e2eOtherKey, setE2eOtherKey] = useState<string | null>(null);
  const [e2eDecrypted, setE2eDecrypted] = useState<Record<number, string>>({});
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workerLiveLocation, setWorkerLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: service, isLoading, error } = useGetService(id, {
    query: {
      enabled: !!id,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
    } as any,
  });

  const isAcceptedOrInProgress = service?.status === 'accepted' || service?.status === 'in_progress';
  const isServiceClosed = service?.status === 'completed' || service?.status === 'cancelled';
  // Historial del chat visible también para servicios cerrados (solo lectura)
  const isChatOpen = !isAdmin && (
    service?.status === 'in_progress' ||
    service?.status === 'accepted' ||
    isServiceClosed
  );
  const isMsgFetchEnabled = isChatOpen || service?.status === 'pending';
  
  const { data: messagesData } = useListMessages(id, {
    query: {
      enabled: !!id && isMsgFetchEnabled,
      refetchInterval: false,
    } as any,
  });

  const fetchedMessages = (messagesData as any)?.messages || (Array.isArray(messagesData) ? messagesData : []);
  const messages = localMessages.length > 0 ? localMessages : fetchedMessages;

  useEffect(() => {
    if (fetchedMessages.length > 0) {
      setLocalMessages(fetchedMessages);
    }
  }, [fetchedMessages.length]);

  const handleNewMessage = useCallback((msg: any) => {
    setLocalMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUserTyping = useCallback((data: { userId: number; name: string }) => {
    if (data.userId === user?.id) return;
    setTypingIndicators(prev => {
      if (prev.some(t => t.userId === data.userId)) return prev;
      return [...prev, data];
    });
    if (typingClearRef.current) clearTimeout(typingClearRef.current);
    typingClearRef.current = setTimeout(() => {
      setTypingIndicators(prev => prev.filter(t => t.userId !== data.userId));
    }, 4000);
  }, [user?.id]);

  const handleWorkerLocation = useCallback((data: { lat: number; lng: number }) => {
    setWorkerLiveLocation(data);
  }, []);

  const handleServiceUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  }, [queryClient, id]);

  const handleProposalUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  }, [queryClient, id]);

  const { emitWorkerLocation } = useSocket({
    serviceId: isAdmin ? null : (id ?? null),
    onNewMessage: handleNewMessage,
    onUserTyping: handleUserTyping,
    onUserStopTyping: (data) => setTypingIndicators(prev => prev.filter(t => t.userId !== data.userId)),
    onWorkerLocation: handleWorkerLocation,
    onServiceUpdated: handleServiceUpdated,
    onProposalUpdated: handleProposalUpdated,
  });

  // Estas declaraciones deben ir ANTES de los useEffect que las usan en sus deps
  const isOwner = service?.clientId === user?.id;
  const isAssigned = service?.workerId === user?.id;
  const isPendingEarly = service?.status === 'pending';
  const { data: proposals, isLoading: proposalsLoading } = useGetServiceProposals(id, {
    query: { enabled: !!id && isPendingEarly, refetchInterval: isPendingEarly ? 5000 : false } as any,
  });
  const isChatEnabled = !isAdmin && isChatOpen;

  useEffect(() => {
    if (!isChatEnabled) return;
    const otherUserId = isOwner ? service?.workerId : service?.clientId;
    if (!otherUserId) return;
    uploadPublicKey()
      .then(() => fetchPublicKey(otherUserId))
      .then((key) => { if (key) setE2eOtherKey(key); })
      .catch((err) => console.warn("E2E setup error:", err));
  }, [isChatEnabled, isOwner, service?.workerId, service?.clientId]);

  useEffect(() => {
    if (!e2eOtherKey) return;
    const pending = messages.filter((m: any) => isEncryptedBlob(m.content) && e2eDecrypted[m.id] === undefined);
    if (pending.length === 0) return;
    Promise.all(
      pending.map(async (msg: any) => {
        try {
          const plain = await decryptMessage(msg.content, e2eOtherKey);
          return { id: msg.id, text: plain };
        } catch {
          return { id: msg.id, text: "🔐 Mensaje cifrado" };
        }
      })
    ).then(results => {
      setE2eDecrypted(prev => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.text;
        return next;
      });
    });
  }, [messages, e2eOtherKey]);


  const isInProgress = service?.status === 'in_progress';

  // Eliminado: ya no transicionamos al chat de servicio al aceptar.
  // El chat de negociación ahora persiste en estado in_progress (ver condición
  // abajo), igual que en el lado del cliente.

  useEffect(() => {
    if (!isInProgress || !isWorker) return;
    if (!navigator.geolocation) return;

    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => emitWorkerLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    };

    sendLocation();
    locationIntervalRef.current = setInterval(sendLocation, 10000);

    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [isInProgress, isWorker, emitWorkerLocation]);

  // El experto NO elegido no debe quedarse en la página de la publicación:
  // si el servicio quedó asignado a otro worker y su chat congelado no está
  // abierto, se le lleva a inicio (la publicación "desaparece" para él).
  // Mientras el chat congelado esté abierto NO se redirige: la pantalla queda
  // congelada hasta que el experto salga por sí mismo.
  useEffect(() => {
    if (!service || !isWorker || !user?.id) return;
    const pendingSt = ['pending', 'alerting', 'open'].includes(service.status ?? '');
    const assignedToOther = !pendingSt && !!service.workerId && service.workerId !== user.id;
    if (assignedToOther && !workerNegotiationChatOpen) setLocation('/');
  }, [service?.status, service?.workerId, isWorker, user?.id, workerNegotiationChatOpen, setLocation]);

  const { data: nearbyWorkersData } = useGetNearbyWorkers(
    { lat: service?.lat ?? 0, lng: service?.lng ?? 0, radius: 20 },
    { query: { enabled: !!(service?.lat && service?.lng && service?.status === 'pending') } as any }
  );


  const [proposalMessage, setProposalMessage] = useState("");
  const [proposalTime, setProposalTime] = useState("");
  const [showPostServiceModal, setShowPostServiceModal] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [rejectDirectLoading, setRejectDirectLoading] = useState(false);

  const [photoLightboxIndex, setPhotoLightboxIndex] = useState<number | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);


  // Ventana de cancelación gratis (10 min desde que el cliente eligió al experto).
  // Mientras esté activa: el cliente cancela sin costo y el experto asignado NO
  // ve la dirección (debe esperar antes de salir).
  const freeCancel = useCountdown((service as any)?.freeCancelUntil);
  const freeCancelActive = freeCancel.active && service?.status === "in_progress";
  const isAssignedWorkerViewer = !!service?.workerId && service?.workerId === user?.id && service?.clientId !== user?.id;
  const hideAddressForWorker = isAssignedWorkerViewer && freeCancelActive;

  const acceptMutation = useAcceptService();
  const startMutation = useStartService();
  const cancelMutation = useCancelService();
  const completeMutation = useCompleteService();
  const messageMutation = useCreateMessage();
  const typingMutation = useSendTypingIndicator();
  const reviewMutation = useCreateReview();
  const createProposalMutation = useCreateProposal();
  const acceptProposalMutation = useAcceptProposal();
  const rejectProposalMutation = useRejectProposal();
  const counterProposalMutation = useCounterProposal();

  const { register: registerMsg, handleSubmit: handleMsgSubmit, reset: resetMsg } = useForm<z.infer<typeof messageSchema>>({
    resolver: zodResolver(messageSchema),
  });


  const { register: registerReview, handleSubmit: handleReviewSubmit, setValue: setReviewValue, watch: watchReview } = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 5,
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevServiceStatusRef = useRef<string | undefined>(undefined);
  const workerPostModalShownRef = useRef(false);

  useEffect(() => {
    if (!service) return;
    const prevStatus = prevServiceStatusRef.current;
    if (
      isAssigned &&
      service.status === 'completed' &&
      !(service as any).reviewedByWorker &&
      !workerPostModalShownRef.current &&
      prevStatus !== 'completed'
    ) {
      workerPostModalShownRef.current = true;
      setShowPostServiceModal(true);
    }
    prevServiceStatusRef.current = service.status;
  }, [service, isAssigned]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


  if (!id || error) {
    return (
      <div className="container px-4 py-16 text-center max-w-xl mx-auto">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Servicio no encontrado</h1>
        <p className="text-muted-foreground mb-6">La solicitud de servicio que buscas no existe o no tienes acceso.</p>
        <Button onClick={() => setLocation("/services")}>Volver a Servicios</Button>
      </div>
    );
  }

  if (isLoading || !service) {
    return (
      <div className="container px-4 py-8 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-4 w-1/4 mb-8" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // El cliente puede cancelar en cualquier estado no terminal (incluye alerting/open
  // sin candidato elegido, y accepted con experto ya conectado — este último caso
  // muestra un diálogo que advierte del pago de la visita a domicilio).
  const canCancel = isOwner && !['completed', 'cancelled'].includes(service.status ?? '');
  const canComplete = isOwner && service.status === 'in_progress';
  const canStart = false;
  const isPending = ['pending', 'alerting', 'open'].includes(service.status ?? '');
  const alreadyProposed = (proposals as any[])?.some((p: any) => p.workerId === user?.id);

  const checkKycBeforeProposal = (): boolean => {
    if ((user as any)?.kycStatus !== "approved") {
      const status = (user as any)?.kycStatus;
      if (status === "pending") {
        toast.error("Tu verificación de identidad (KYC) está en revisión. Espera la aprobación para enviar propuestas.");
      } else if (status === "rejected") {
        toast.error("Tu verificación de identidad (KYC) fue rechazada. Vuelve a enviar tus documentos desde Perfil.");
      } else {
        toast.error("Debes verificar tu identidad (KYC) antes de enviar propuestas. Ve a Perfil para completarla.");
      }
      return false;
    }
    return true;
  };

  const onSendProposal = async () => {
    if (!checkKycBeforeProposal()) return;
    try {
      await createProposalMutation.mutateAsync({
        id,
        data: { proposedPrice: 0, message: proposalMessage || null, estimatedTime: proposalTime || null } as any,
      });
      toast.success("¡Propuesta enviada! El chat está listo para coordinar los detalles.");
      setProposalMessage(""); setProposalTime("");
      queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
      // Abrir el chat de negociación automáticamente
      setTimeout(() => setWorkerNegotiationChatOpen(true), 400);
    } catch (e: any) { toast.error(e?.response?.data?.error || "Error al enviar propuesta"); }
  };

  const onAcceptProposal = async (proposalId: number) => {
    try {
      await acceptProposalMutation.mutateAsync({ id: proposalId });
      toast.success("¡Conectado! El chat está abierto para coordinar los detalles.");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
      // Cerramos el modal de propuesta y abrimos el chat activo del servicio
      // (in_progress) en el mismo instante, para que el cliente nunca salga
      // de la conversación al aceptar.
      setChatProposalId(null);
      setServiceChatOpen(true);
    } catch (e: any) {
      const msg: string = e?.response?.data?.error || "";
      // Race / doble-click: la propuesta ya está procesada en el servidor.
      // Refetch y, si el servicio quedó conectado con este profesional, lo
      // tratamos como éxito en vez de mostrar un error confuso al usuario.
      if (/no se puede aceptar/i.test(msg) || /ya.*aceptad/i.test(msg)) {
        try {
          await queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
          await queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
          const fresh: any = await queryClient.fetchQuery({ queryKey: getGetServiceQueryKey(id) });
          const freshProposals: any = await queryClient.fetchQuery({ queryKey: getGetServiceProposalsQueryKey(id) });
          const acceptedProp = Array.isArray(freshProposals)
            ? freshProposals.find((p: any) => p.id === proposalId)
            : (proposals as any[])?.find((p: any) => p.id === proposalId);
          const acceptedHere = acceptedProp && acceptedProp.status === "accepted";
          const serviceConnected = fresh && (fresh.status === "in_progress" || fresh.status === "accepted");
          const sameWorker = !!(serviceConnected && acceptedProp && fresh.workerId === acceptedProp.workerId);
          if (acceptedHere || sameWorker) {
            toast.success("¡Conectado! El chat está abierto para coordinar los detalles.");
            setChatProposalId(null);
            setServiceChatOpen(true);
            return;
          }
          toast.info("Esta propuesta ya no está disponible. Otro profesional fue aceptado.");
          setChatProposalId(null);
          return;
        } catch {}
      }
      toast.error(msg || "Error al conectar");
    }
  };

  // Helper: refresca servicio+propuestas y muestra un toast apropiado tras un error
  // de cambio de estado. Garantiza que el botón obsoleto desaparezca aunque la
  // mutación falle por race condition.
  const refreshAndToastError = (fallbackMsg: string, e: any) => {
    const msg: string = e?.response?.data?.error || e?.message || fallbackMsg;
    queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
    toast.error(msg.replace(/^HTTP \d+[^:]*:\s*/i, ""));
  };

  const onRejectProposal = async (proposalId: number) => {
    try {
      await rejectProposalMutation.mutateAsync({ id: proposalId });
      toast.success("Propuesta rechazada");
      queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
    } catch (e: any) { refreshAndToastError("Error al rechazar", e); }
  };


  const onStart = async () => {
    try {
      await startMutation.mutateAsync({ id });
      toast.success("¡Trabajo iniciado! Ahora estás en progreso.");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
    } catch (e: any) { refreshAndToastError("Error al iniciar el trabajo", e); }
  };

  const onAccept = async () => {
    try {
      await acceptMutation.mutateAsync({ id });
      toast.success("¡Servicio aceptado!");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
    } catch (e: any) { refreshAndToastError("Error al aceptar el servicio", e); }
  };

  const onCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id });
      toast.success("Servicio cancelado");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
    } catch (e: any) { refreshAndToastError("Error al cancelar el servicio", e); }
  };

  const onComplete = async () => {
    try {
      await completeMutation.mutateAsync({ id });
      toast.success("¡Servicio marcado como completado! El cliente recibirá una solicitud de reseña.");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
      setShowPostServiceModal(true);
    } catch (e: any) { refreshAndToastError("Error al completar el servicio", e); }
  };

  const onRejectDirect = async () => {
    setRejectDirectLoading(true);
    try {
      const res = await fetch(`/api/services/${id}/reject-direct`, { method: "POST" });
      if (!res.ok) throw new Error("Error al rechazar");
      toast.success("Solicitud rechazada. El cliente será notificado.");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
      setLocation("/services");
    } catch (e: any) {
      toast.error(e?.message || "Error al rechazar la solicitud");
    } finally {
      setRejectDirectLoading(false);
    }
  };

  const onConvertToPublic = async () => {
    setConvertLoading(true);
    try {
      const res = await fetch(`/api/services/${id}/convert-to-public`, { method: "POST" });
      if (!res.ok) throw new Error("Error al convertir");
      toast.success("Solicitud convertida a pública. Los técnicos cercanos serán notificados.");
      queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
      setShowConvertDialog(false);
    } catch (e: any) {
      toast.error(e?.message || "Error al convertir la solicitud");
    } finally {
      setConvertLoading(false);
    }
  };

  const onSendMessage = async (data: z.infer<typeof messageSchema>) => {
    try {
      // El cifrado E2E es obligatorio: nunca se envía texto plano. Si no se puede
      // cifrar, se aborta el envío con un aviso en vez de degradar a texto plano.
      if (!e2eOtherKey) {
        toast.error("Aún no se pudo establecer el cifrado con el otro usuario. Intenta de nuevo en unos segundos.");
        return;
      }
      let content: string;
      try {
        content = await encryptMessage(data.content, e2eOtherKey);
      } catch {
        toast.error("No pudimos cifrar tu mensaje en este dispositivo. Inicia sesión desde tu dispositivo original para restaurar tu llave E2E.");
        return;
      }
      const result = await messageMutation.mutateAsync({ serviceId: id, data: { ...data, content } });
      resetMsg();
      if (result) {
        const resultMsg = result as any;
        if (e2eOtherKey && isEncryptedBlob(resultMsg.content)) {
          setE2eDecrypted(prev => ({ ...prev, [resultMsg.id]: data.content }));
        }
        setLocalMessages(prev => prev.some(m => m.id === resultMsg.id) ? prev : [...prev, resultMsg]);
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al enviar el mensaje");
    }
  };

  const handleTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingMutation.mutate({ serviceId: id });
    typingTimeoutRef.current = setTimeout(() => {}, 300);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("La imagen no puede superar 10MB"); return; }

    try {
      const objectPath = await uploadFileToStorage(file);
      const imageUrl = `/api/storage/objects/${objectPath}`;
      await messageMutation.mutateAsync({ serviceId: id, data: { content: "📷 Imagen", imageUrl } as any });
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(id) });
      toast.success("Imagen enviada");
    } catch (err: any) {
      toast.error(err?.message || "Error al subir imagen");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const onSubmitReview = async (data: z.infer<typeof reviewSchema>) => {
    if (!service.workerId) return;
    try {
      await reviewMutation.mutateAsync({ 
        data: {
          serviceId: service.id,
          workerId: service.workerId,
          rating: data.rating,
          comment: data.comment
        }
      });
      toast.success("¡Reseña enviada!");
      setIsReviewOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Error al enviar la reseña");
    }
  };


  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 pb-24 md:pb-8 w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight break-words min-w-0">{service.title}</h1>
            <Badge variant={service.status === 'completed' ? 'default' : service.status === 'cancelled' ? 'destructive' : 'secondary'} className={service.status === 'completed' ? 'bg-green-500' : ''}>
              {statusLabels[service.status] || service.status.toUpperCase()}
            </Badge>
            {(service as any).isUrgent && (
              <Badge className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1">
                <Zap className="w-3 h-3" /> URGENTE
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            {(() => { const s = getCategoryStyle(service.category?.icon ?? undefined); const CIcon = s.icon; return <CIcon className={`w-4 h-4 ${s.color}`} strokeWidth={1.8} />; })()}
            {service.category.name}
            <span className="mx-2">•</span>
            Solicitado el {format(new Date(service.createdAt), "d 'de' MMM, yyyy", { locale: es })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStart && (
            <Button onClick={onStart} disabled={startMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {startMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Zap className="w-4 h-4 mr-2" /> Iniciar Trabajo
            </Button>
          )}
          {canComplete && (
            <Button onClick={onComplete} className="bg-green-600 hover:bg-green-700 text-white" disabled={completeMutation.isPending}>
              {completeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar Completado
            </Button>
          )}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <XCircle className="w-4 h-4 mr-2" /> Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Cancelar este trabajo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {!service.workerId
                      ? <>Se cerrará esta solicitud para todos los profesionales.</>
                      : freeCancel.active
                        ? <>Estás dentro del tiempo de cancelación gratis (<strong className="tabular-nums">{freeCancel.label}</strong>). Puedes cancelar ahora <strong>sin penalización</strong>.</>
                        : <>Ya elegiste a <strong>{(service as any).worker?.name ?? "un profesional"}</strong> y el tiempo de cancelación gratis terminó. Si cancelas ahora, deberás transferirle su tarifa de visita técnica{(service as any).worker?.visitFee ? <> de <strong>{formatCLP((service as any).worker.visitFee)}</strong></> : null} dentro de 24 horas.</>}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Mantener el trabajo</AlertDialogCancel>
                  <AlertDialogAction onClick={onCancel} className="bg-destructive hover:bg-destructive/90 text-white">
                    {service.workerId && freeCancel.active ? "Cancelar sin penalización" : "Sí, cancelar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {service.status === 'completed' && isClient && (
            <Button variant="outline" asChild>
              <a href={`/services/new?title=${encodeURIComponent(service.title)}&address=${encodeURIComponent(service.address || '')}&categoryId=${service.categoryId}`}>
                <RefreshCw className="w-4 h-4 mr-2" /> Repetir Servicio
              </a>
            </Button>
          )}
          {service.status === 'completed' && isClient && !showPostServiceModal && (
            <Button variant="outline" className="border-primary/30 text-primary" onClick={() => setShowPostServiceModal(true)}>
              <Star className="w-4 h-4 mr-2" /> Agregar a Confianza
            </Button>
          )}
          {service.status === 'completed' && isWorker && !(service as any).reviewedByWorker && (
            <Button variant="outline" onClick={() => setIsWorkerReviewOpen(true)}>
              <Star className="w-4 h-4 mr-2" /> Calificar Usuario
            </Button>
          )}
          {isWorker && service.status === 'pending' && (service as any).isDirectRequest && (service as any).directWorkerId === user?.id && (
            <Button
              variant="destructive"
              onClick={onRejectDirect}
              disabled={rejectDirectLoading}
            >
              {rejectDirectLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <XCircle className="w-4 h-4 mr-2" /> Rechazar Solicitud Directa
            </Button>
          )}
          {isClient && service.status === 'pending' && (service as any).isDirectRequest && (
            <Button
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => setShowConvertDialog(true)}
            >
              Abrir al Público
            </Button>
          )}
          {(service.status === 'completed' || service.status === 'in_progress') && (isClient || isWorker) && (
            <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" asChild>
              <a href="/support">
                <TicketCheck className="w-4 h-4 mr-2" /> Soporte
              </a>
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isWorkerReviewOpen} onOpenChange={setIsWorkerReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-primary" /> Calificar la Convivencia
            </DialogTitle>
            <DialogDescription>
              Califica la convivencia en esta interacción con {service?.client?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>¿Cómo estuvo la experiencia y el trato mutuo?</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setWorkerReviewRating(star)}
                    className={`p-2 transition-colors ${workerReviewRating >= star ? 'text-blue-500' : 'text-muted-foreground'}`}
                  >
                    <Star className="w-8 h-8 fill-current" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Comentario (Opcional)</Label>
              <Textarea
                placeholder="Déjanos un comentario sobre el respeto y la comunicación durante el contacto..."
                value={workerReviewComment}
                onChange={e => setWorkerReviewComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWorkerReviewOpen(false)}>Omitir</Button>
            <Button
              onClick={async () => {
                setWorkerReviewLoading(true);
                try {
                  const token = localStorage.getItem("fixgo_token");
                  const r = await fetch("/api/reviews/rate-client", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ serviceId: id, clientId: service.clientId, rating: workerReviewRating, comment: workerReviewComment }),
                  });
                  if (!r.ok) throw new Error();
                  toast.success("¡Gracias por tu calificación!");
                  setIsWorkerReviewOpen(false);
                  queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
                } catch {
                  toast.error("Error al enviar calificación");
                } finally {
                  setWorkerReviewLoading(false);
                }
              }}
              disabled={workerReviewLoading}
            >
              {workerReviewLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar Calificación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Califica la Convivencia</DialogTitle>
            <DialogDescription>
              ¿Cómo estuvo la experiencia y el trato mutuo con {service.worker?.name}?
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReviewSubmit(onSubmitReview)}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>¿Cómo estuvo la experiencia y el trato mutuo?</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewValue("rating", star)}
                      className={`p-2 transition-colors ${watchReview("rating") >= star ? 'text-blue-500' : 'text-muted-foreground'}`}
                    >
                      <Star className="w-8 h-8 fill-current" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Comentario (Opcional)</Label>
                <Textarea {...registerReview("comment")} placeholder="Déjanos un comentario sobre el respeto y la comunicación durante el contacto..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)}>Omitir</Button>
              <Button type="submit" disabled={reviewMutation.isPending}>
                {reviewMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enviar Reseña
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Detalles del Trabajo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Descripción</h4>
                <p className={`min-w-0 max-w-full [overflow-wrap:anywhere] text-base leading-relaxed whitespace-pre-wrap ${descriptionExpanded ? "" : "line-clamp-4 max-h-[100px] overflow-hidden"}`}>{service.description}</p>
                {service.description.length > 220 && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                    className="mt-1 text-sm font-semibold text-primary hover:underline"
                  >
                    {descriptionExpanded ? "Ver menos" : "Ver más"}
                  </button>
                )}
              </div>

              {(service as any).imageUrls && (service as any).imageUrls.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Fotos del Trabajo</h4>
                  <div className="flex h-[140px] gap-2 overflow-x-auto overflow-y-hidden pb-1">
                    {(service as any).imageUrls.map((url: string, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPhotoLightboxIndex(i)}
                        className="block w-[120px] h-[120px] shrink-0 overflow-hidden rounded-lg border bg-muted hover:opacity-90 transition-opacity"
                      >
                        <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="grid sm:grid-cols-2 gap-4">
                {(service as any).originAddress && !hideAddressForWorker && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 min-w-0">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">Origen</p>
                      <p className="text-sm font-medium mt-0.5 [overflow-wrap:anywhere]">{(service as any).originAddress}</p>
                    </div>
                  </div>
                )}
                {(service as any).destinationAddress && !hideAddressForWorker && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 min-w-0">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">Destino</p>
                      <p className="text-sm font-medium mt-0.5 [overflow-wrap:anywhere]">{(service as any).destinationAddress}</p>
                    </div>
                  </div>
                )}
                {service.address && !(service as any).originAddress && !hideAddressForWorker && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 min-w-0">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">Ubicación</p>
                      <p className="text-sm font-medium mt-0.5 [overflow-wrap:anywhere]">{service.address}</p>
                    </div>
                  </div>
                )}
                {service.address && hideAddressForWorker && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-400/10 border border-blue-400/30">
                    <MapPin className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">⏱️ Espera <span className="tabular-nums text-blue-400">{freeCancel.label}</span> antes de salir</p>
                      <p className="text-xs text-muted-foreground mt-0.5">El cliente aún puede cancelar sin costo. La dirección se mostrará cuando termine el tiempo.</p>
                    </div>
                  </div>
                )}
                {service.scheduledAt && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <Clock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Programado Para</p>
                      <p className="text-sm font-medium mt-0.5">{format(new Date(service.scheduledAt), "d 'de' MMM, yyyy h:mm a", { locale: es })}</p>
                    </div>
                  </div>
                )}
              </div>

              {service?.lat && service?.lng && service.status === 'pending' && isWorker && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" /> Ruta hacia el servicio
                  </h4>
                  <div className="rounded-xl overflow-hidden border border-primary/30">
                    <Suspense fallback={<div className="h-[200px] bg-muted animate-pulse rounded-xl" />}>
                      <WorkerRouteMap
                        serviceLat={service.lat}
                        serviceLng={service.lng}
                        className="h-[200px]"
                      />
                    </Suspense>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tu ubicación actual y la ruta estimada hacia el domicilio del cliente.
                  </p>
                </div>
              )}

              {service?.lat && service?.lng && service.status === 'pending' && !isWorker && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Profesionales Cercanos al Servicio
                  </h4>
                  <div className="rounded-xl overflow-hidden border border-border/50">
                    <Suspense fallback={<div className="h-[200px] bg-muted animate-pulse rounded-xl" />}>
                      <ServiceLocationMap
                        serviceLat={service.lat}
                        serviceLng={service.lng}
                        workers={(Array.isArray(nearbyWorkersData) ? nearbyWorkersData : (nearbyWorkersData as any)?.users || []).filter((w: any) => w.isAvailable)}
                        className="h-[200px]"
                      />
                    </Suspense>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(Array.isArray(nearbyWorkersData) ? nearbyWorkersData : (nearbyWorkersData as any)?.users || []).filter((w: any) => w.isAvailable).length} profesional(es) disponible(s) en la zona
                  </p>
                </div>
              )}

              {service?.lat && service?.lng && service.status === 'in_progress' && (isOwner || isAssigned) && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-green-500" />
                    {isWorker ? 'Tu Ubicación (compartida en tiempo real)' : 'Seguimiento del Profesional en Tiempo Real'}
                  </h4>
                  <div className="rounded-xl overflow-hidden border border-green-500/30">
                    <Suspense fallback={<div className="h-[200px] bg-muted animate-pulse rounded-xl" />}>
                      <ServiceTrackingMap
                        serviceLat={service.lat}
                        serviceLng={service.lng}
                        workerLat={workerLiveLocation?.lat}
                        workerLng={workerLiveLocation?.lng}
                        workerName={service.worker?.name || 'Profesional'}
                        className="h-[280px]"
                      />
                    </Suspense>
                  </div>
                  {isWorker && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse inline-block" />
                      Tu ubicación GPS se comparte automáticamente con el cliente cada 10 segundos.
                    </p>
                  )}
                  {isClient && !workerLiveLocation && (
                    <p className="text-xs text-muted-foreground mt-1">Esperando ubicación del profesional...</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {(isPending || service.status === 'alerting' || service.status === 'open') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  {isWorker ? 'Conectar con este cliente' : `Profesionales disponibles (${(proposals || []).length})`}
                </CardTitle>
                <CardDescription>
                  {isWorker
                    ? 'Envía tu propuesta y coordina los detalles por chat cifrado.'
                    : 'Elige al profesional con quien quieres conectar.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Resumen del servicio visible solo para trabajadores */}
                {isWorker && !alreadyProposed && (
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/50 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumen del servicio</p>
                    <p className="min-w-0 max-w-full [overflow-wrap:anywhere] text-sm font-medium leading-snug line-clamp-3 overflow-hidden">{service.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {(service as any).originAddress && !hideAddressForWorker && (
                        <span className="flex min-w-0 items-start gap-1">
                          <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="[overflow-wrap:anywhere]"><strong>Origen:</strong> {(service as any).originAddress}</span>
                        </span>
                      )}
                      {(service as any).destinationAddress && !hideAddressForWorker && (
                        <span className="flex min-w-0 items-start gap-1">
                          <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="[overflow-wrap:anywhere]"><strong>Destino:</strong> {(service as any).destinationAddress}</span>
                        </span>
                      )}
                      {service.address && !(service as any).originAddress && !hideAddressForWorker && (
                        <span className="flex min-w-0 items-start gap-1">
                          <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="[overflow-wrap:anywhere]">{service.address}</span>
                        </span>
                      )}
                      {service.scheduledAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          {format(new Date(service.scheduledAt), "d MMM, h:mm a", { locale: es })}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Formulario de propuesta para trabajadores */}
                {isWorker && !alreadyProposed && (() => {
                  const leadsLimit = subLimit("leads_per_month");
                  if (!subActive && leadsLimit === 0) {
                    return (
                      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
                        <Crown className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex-1">
                          <p className="font-semibold text-foreground">Necesitas un plan activo para conectar</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Activa un plan para contactar clientes y hacer crecer tu negocio.</p>
                        </div>
                        <a href="/planes" className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90" onClick={e => e.stopPropagation()}>Ver planes</a>
                      </div>
                    );
                  }
                  return null;
                })()}
                {isWorker && !alreadyProposed && (subActive || subLimit("leads_per_month") > 0) && (
                  <div className="space-y-3">
                    {(service as any).budgetNote && (
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                        <Lock className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Presupuesto del cliente (solo en chat)</p>
                          <p className="text-sm text-foreground">Disponible en el chat cifrado</p>
                        </div>
                      </div>
                    )}
                    <Button
                      onClick={() => setWorkerNegotiationChatOpen(true)}
                      className="w-full bg-primary text-white hover:bg-primary/90 font-bold"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      {(service as any).budgetNote ? "Ver presupuesto y chatear" : "Conectarme con este cliente"}
                    </Button>
                  </div>
                )}

                {isWorker && alreadyProposed && (() => {
                  const myProposal = proposals?.find((p: any) => p.workerId === user?.id);
                  if (!myProposal) return null;
                  if (myProposal.status === 'rejected' || myProposal.status === 'accepted') return null;

                  const canAcceptWork = ['pending', 'open_chat', 'countered'].includes(myProposal.status);
                  const alreadyAccepted = myProposal.status === 'worker_accepted';

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 text-primary bg-primary/10 rounded-xl border border-primary/20">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 animate-pulse" />
                          <div>
                            <p className="font-semibold text-sm">
                              {alreadyAccepted ? "¡Trabajo aceptado!" : "Propuesta enviada"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {alreadyAccepted ? "Esperando confirmación del cliente" : "Esperando que el cliente conecte"}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs font-bold bg-primary text-white hover:bg-primary/90"
                          onClick={() => setWorkerNegotiationChatOpen(true)}
                        >
                          <MessageCircle className="w-3.5 h-3.5 mr-1" />
                          Chat
                        </Button>
                      </div>
                      {canAcceptWork && (
                        <Button
                          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold"
                          onClick={async () => {
                            try {
                              await fetch(`/api/services/${id}/worker-accept`, {
                                method: "POST",
                                credentials: "include",
                              });
                              queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
                              toast.success("¡Aceptaste el trabajo! Esperando confirmación del cliente.");
                            } catch {
                              toast.error("Error al aceptar el trabajo");
                            }
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Aceptar Trabajo
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {/* Lista compacta de profesionales para el cliente */}
                {isOwner && proposals && proposals.length > 0 && (
                  <div className="space-y-2">
                    {proposals.filter((p: any) => {
                      if (p.status !== 'rejected') return true;
                      // Ocultar rechazados más de 20 min después del rechazo
                      return Date.now() - new Date(p.updatedAt).getTime() < 20 * 60 * 1000;
                    }).map((proposal: any) => {
                      const isWorkerReady = proposal.status === 'worker_accepted';
                      const statusColors: Record<string, string> = {
                        pending: "border-l-blue-400",
                        countered: "border-l-blue-400",
                        open_chat: "border-l-blue-400",
                        worker_accepted: "border-l-green-500",
                        accepted: "border-l-green-400",
                        rejected: "border-l-red-400",
                      };
                      const borderColor = statusColors[proposal.status] || statusColors.pending;

                      return (
                        <button
                          key={proposal.id}
                          onClick={() => setChatProposalId(proposal.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-l-4 bg-card border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99] text-left ${borderColor} ${isWorkerReady ? 'ring-1 ring-green-500/30' : ''}`}
                        >
                          <Avatar className="w-11 h-11 border-2 border-primary/20 flex-shrink-0">
                            <AvatarImage src={proposal.worker?.avatarUrl} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {proposal.worker?.name?.substring(0, 2).toUpperCase() || '??'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-foreground truncate">{proposal.worker?.name || 'Profesional'}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="w-3 h-3 fill-blue-500 text-blue-500" />
                              <span>{proposal.worker?.rating?.toFixed(1) || 'Nuevo'}</span>
                              {proposal.estimatedTime && (
                                <>
                                  <span className="mx-0.5">·</span>
                                  <Clock className="w-3 h-3" />
                                  <span>{proposal.estimatedTime}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {isWorkerReady ? (
                              <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide">Confirmar →</span>
                            ) : (
                              proposal.status !== 'rejected' && proposal.status !== 'accepted' && (
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wide">Ver →</span>
                              )
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isOwner && proposals && proposals.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Esperando propuestas...</p>
                    <p className="text-xs mt-1">Los profesionales cercanos verán tu solicitud y podrán conectarse contigo.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}


          {/* Chat del TRABAJADOR: visible durante negociación Y durante in_progress
              para que el trabajador nunca salga del chat al aceptarse su propuesta,
              igual que el cliente. Solo se oculta si la propuesta fue rechazada o
              si en in_progress el trabajador asignado es otro. */}
          {isWorker && (() => {
            const myProp = (proposals as any[])?.find((p: any) => p.workerId === user?.id);
            // El cliente eligió a otro: derivarlo TAMBIÉN del servicio (workerId
            // asignado a otro), porque la query de propuestas se deshabilita fuera
            // de pending y myProp puede quedar stale como 'pending' para siempre.
            const assignedToOther = !isPending && !!service.workerId && service.workerId !== user?.id;
            const isRejected = myProp?.status === 'rejected' || assignedToOther;
            if (isRejected) {
              // Chat congelado: se mantiene montado SOLO mientras el experto lo
              // tenga abierto. Al cerrarlo se navega a inicio (ver onOpenChange)
              // y el effect de redirección impide volver a esta publicación.
              if (!workerNegotiationChatOpen) return null;
            } else {
              // Chat activo: en negociación (pendiente) o asignado a MÍ en curso
              if (!(isPending || (service.status === 'in_progress' && service.workerId === user?.id))) return null;
            }
            return (
              <ProposalChatSheet
                open={workerNegotiationChatOpen}
                onOpenChange={(v) => {
                  setWorkerNegotiationChatOpen(v);
                  if (!v) {
                    if (isRejected) {
                      // El experto salió del chat congelado → llevarlo a inicio,
                      // no dejarlo en la página de la publicación.
                      setLocation('/');
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
                  }
                }}
                serviceId={id}
                workerId={user?.id as number}
                workerName={service.client?.name || 'Cliente'}
                workerAvatar={(service.client as any)?.avatarUrl}
                otherUserId={service.clientId}
                proposalId={myProp?.id}
                budgetNote={(service as any).budgetNote || null}
                requestQuote={!!(service as any).requestQuote}
                isPending={isPending}
                proposalStatus={isRejected ? 'rejected' : myProp?.status}
                readOnly={isRejected || undefined}
                serviceStatus={service.status}
                freeCancelUntil={(service as any).freeCancelUntil}
                workerSelfieCompleted={!!(service as any).workerSelfieUrl}
                onCounter={isRejected ? undefined : async (pid) => {
                  const prop = (proposals as any[])?.find((p: any) => p.id === pid);
                  if (!prop) return;
                  const counterable = prop.status === 'pending' || prop.status === 'countered';
                  if (!counterable || prop.lastCounterBy === 'worker') return;
                  await counterProposalMutation.mutateAsync({ id: pid, data: {} as any });
                  queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
                }}
              />
            );
          })()}

          {/* Chat con el especialista por propuesta.
              lastChatPropRef guarda el último prop válido para que el componente
              permanezca montado (y conserve su estado) cuando chatProposalId vuelve a null. */}
          {isOwner && (() => {
            const chatProp = proposals?.find((p: any) => p.id === chatProposalId);
            if (chatProp) lastChatPropRef.current = chatProp;
            const activeProp = lastChatPropRef.current;
            if (!activeProp) return null; // todavía no se ha abierto ningún chat
            const isActiveCh = activeProp.status === 'pending' || activeProp.status === 'countered';
            return (
              <ProposalChatSheet
                open={chatProposalId !== null && !!chatProp}
                onOpenChange={(v) => { if (!v) setChatProposalId(null); }}
                serviceId={id}
                workerId={activeProp.workerId}
                workerName={activeProp.worker?.name || 'Especialista'}
                workerAvatar={activeProp.worker?.avatarUrl}
                acceptLabel="Confirmar trabajo"
                accepting={acceptProposalMutation.isPending}
                otherUserId={activeProp.workerId}
                proposalId={activeProp.id}
                budgetNote={(service as any).budgetNote || null}
                requestQuote={!!(service as any).requestQuote}
                isPending={isPending}
                iAmClient={true}
                paymentMethod={(service as any).paymentMethod ?? null}
                serviceStatus={(service as any).status ?? null}
                freeCancelUntil={(service as any).freeCancelUntil}
                onCounter={async (pid) => {
                  const prop = (proposals as any[])?.find((p: any) => p.id === pid);
                  if (!prop) return;
                  const counterable = prop.status === 'pending' || prop.status === 'countered';
                  if (!counterable || prop.lastCounterBy === 'client') return;
                  await counterProposalMutation.mutateAsync({ id: pid, data: {} as any });
                  queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(id) });
                }}
                onAccept={isActiveCh ? () => {
                  onAcceptProposal(activeProp.id);
                } : undefined}
                onReject={isActiveCh ? () => {
                  onRejectProposal(activeProp.id);
                  setChatProposalId(null);
                } : undefined}
                readOnly={isServiceClosed}
              />
            );
          })()}



          {isChatEnabled && (isOwner || isAssigned || (isWorker && alreadyProposed)) && (
            <>
              {(() => {
                const otherId = isOwner ? service.workerId : service.clientId;
                const otherName = isOwner ? (service.worker?.name || 'el Profesional') : (service.client?.name || 'el Usuario');
                const otherAvatar = isOwner ? (service.worker?.avatarUrl) : (service.client?.avatarUrl);
                const lastMsg = messages[messages.length - 1];
                const getPreviewText = (content: string, decrypted?: string): string => {
                  if (isEncryptedBlob(content)) return decrypted ?? '🔐 Mensaje cifrado';
                  if (content.startsWith('__AGREEMENT__')) return '📍 Dirección de encuentro confirmada';
                  if (content.startsWith('__PRICE__')) return '💬 Propuesta de presupuesto';
                  return content;
                };
                const lastText = lastMsg
                  ? getPreviewText(lastMsg.content, e2eDecrypted[lastMsg.id])
                  : 'Toca para abrir el chat cifrado';
                if (!otherId) return null;
                return (
                  <Card
                    onClick={() => setServiceChatOpen(true)}
                    className="cursor-pointer hover:bg-card/80 transition-all active:scale-[0.99]"
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Avatar className="w-12 h-12 border-2 border-primary/30 shrink-0">
                        <AvatarImage src={otherAvatar || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {otherName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">💬</span>
                          <p className="font-bold text-sm truncate">Chat con {otherName}</p>
                          {e2eOtherKey && (
                            <ShieldCheck className="w-3 h-3 text-green-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {lastText || "Toca aquí para coordinar el trabajo"}
                        </p>
                      </div>
                      <MessageSquare className="w-5 h-5 text-primary shrink-0" />
                    </CardContent>
                  </Card>
                );
              })()}

              {(() => {
                const otherId = isOwner ? service.workerId : service.clientId;
                const otherName = isOwner ? (service.worker?.name || 'el Profesional') : (service.client?.name || 'el Usuario');
                const otherAvatar = isOwner ? (service.worker?.avatarUrl) : (service.client?.avatarUrl);
                if (!otherId) return null;
                return (
                  <ProposalChatSheet
                    open={serviceChatOpen}
                    onOpenChange={setServiceChatOpen}
                    serviceId={id}
                    workerId={isOwner ? otherId : (service.workerId || user!.id)}
                    workerName={otherName}
                    workerAvatar={otherAvatar}
                    otherUserId={otherId}
                    budgetNote={(service as any).budgetNote || null}
                    requestQuote={!!(service as any).requestQuote}
                    iAmClient={isOwner}
                    clientAddress={(service as any).address || null}
                    clientLat={typeof (service as any).lat === "number" ? (service as any).lat : null}
                    clientLng={typeof (service as any).lng === "number" ? (service as any).lng : null}
                    readOnly={isServiceClosed}
                    serviceStatus={service.status}
                    paymentMethod={(service as any).paymentMethod ?? null}
                    freeCancelUntil={(service as any).freeCancelUntil}
                  />
                );
              })()}

              {false && (
              <Card className="flex flex-col h-[500px]">
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length > 0 ? (
                    messages.map((msg: any) => {
                      const isMe = msg.senderId === user?.id;
                      if (msg.messageType === 'missed_call') {
                        return (
                          <div key={msg.id} className="flex justify-center">
                            <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                              <PhoneMissed className="w-3.5 h-3.5 text-destructive shrink-0" />
                              <span>{isMe ? 'Llamada sin respuesta' : 'Llamada perdida'}</span>
                              <span className="opacity-60">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {msg.messageType === 'price_proposal' ? null : (
                          <div className={`max-w-[80%] rounded-lg p-3 ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            {msg.messageType === 'image' && msg.imageUrl ? (
                              msg.content?.includes('seguridad') ? (
                                <div className="flex items-center gap-2 text-sm">
                                  <Lock className="w-4 h-4 shrink-0" />
                                  <span>{msg.content}</span>
                                </div>
                              ) : (
                                <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={msg.imageUrl} alt="Imagen" className="max-w-full rounded-md max-h-60 object-cover" />
                                </a>
                              )
                            ) : isEncryptedBlob(msg.content) ? (
                              e2eDecrypted[msg.id] !== undefined ? (
                                <p className="text-sm">{e2eDecrypted[msg.id]}</p>
                              ) : (
                                <p className="text-sm opacity-50 italic">🔐 Descifrando...</p>
                              )
                            ) : (
                              <p className="text-sm">{msg.content}</p>
                            )}
                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                              <p className={`text-[10px] ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                {format(new Date(msg.createdAt), 'h:mm a')}
                              </p>
                              {isMe && (msg.isRead ? <CheckCheck className="w-3 h-3 text-primary-foreground/70" /> : <Check className="w-3 h-3 text-primary-foreground/50" />)}
                            </div>
                          </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                      <MessageSquare className="w-8 h-8 opacity-20" />
                      Sin mensajes aún. ¡Inicia la conversación!
                    </div>
                  )}
                  {typingIndicators.length > 0 && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-4 py-2 text-sm text-muted-foreground italic">
                        {typingIndicators.map(t => t.name).join(', ')} está escribiendo...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </CardContent>
                <div className="p-4 border-t bg-muted/10 space-y-2">
                  <form onSubmit={handleMsgSubmit(async (data) => {
                    await onSendMessage(data);
                  })} className="flex gap-2">
                    <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} title="Enviar imagen">
                      <Image className="w-4 h-4" />
                    </Button>
                    <Input placeholder="Escribe tu mensaje..." {...registerMsg("content")} autoComplete="off" onKeyDown={handleTyping} />
                    <Button type="submit" size="icon" disabled={messageMutation.isPending}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              </Card>
              )}

            </>
          )}
        </div>

        <div className="space-y-4 self-start sticky top-4">
          {(isOwner && service.worker) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Tu Profesional</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center text-center space-y-4">
                <Avatar className="w-20 h-20 border-2 border-primary/20">
                  <AvatarImage src={service.worker.avatarUrl || undefined} />
                  <AvatarFallback className="text-xl bg-primary/10 text-primary">{service.worker.name.substring(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{service.worker.name}</h3>
                  <div className="flex justify-center items-center gap-1 text-sm text-muted-foreground mt-1">
                    <Star className="w-4 h-4 fill-blue-500 text-blue-500" />
                    <span className="font-medium text-foreground">{service.worker.rating?.toFixed(1) || 'Nuevo'}</span>
                    <span>({service.worker.totalReviews} reseñas)</span>
                  </div>
                </div>
                {service.workerId && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => startCall(service.workerId!, service.worker!.name, service.id)}
                  >
                    Llamar al Profesional
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (isAssigned && service.client) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Usuario</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={service.client.avatarUrl || undefined} />
                  <AvatarFallback>{service.client.name.substring(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{service.client.name}</h3>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Wrench className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Categoría</p>
                    <p className="font-medium">{service.category?.name || '—'}</p>
                  </div>
                </div>
                {service.scheduledAt && (
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Programado</p>
                      <p className="font-medium">{new Date(service.scheduledAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                )}
                {(service as any).originAddress && !hideAddressForWorker && (
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Origen</p>
                      <p className="font-medium leading-snug [overflow-wrap:anywhere]">{(service as any).originAddress}</p>
                    </div>
                  </div>
                )}
                {(service as any).destinationAddress && !hideAddressForWorker && (
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Destino</p>
                      <p className="font-medium leading-snug [overflow-wrap:anywhere]">{(service as any).destinationAddress}</p>
                    </div>
                  </div>
                )}
                {service.address && !(service as any).originAddress && !hideAddressForWorker && (
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Ubicación</p>
                      <p className="font-medium leading-snug [overflow-wrap:anywhere]">{service.address}</p>
                    </div>
                  </div>
                )}
                {service.address && hideAddressForWorker && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Ubicación</p>
                      <p className="font-medium leading-snug text-blue-400">Se mostrará en {freeCancel.label} ⏱️</p>
                    </div>
                  </div>
                )}
                <div className="pt-1 border-t border-border/40">
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    Pendiente de profesional
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {service && (
        <PostServiceModal
          open={showPostServiceModal}
          onClose={() => {
            setShowPostServiceModal(false);
            if (isClient && !(service as any).reviewedByClient) {
              setIsReviewOpen(true);
            } else if (isWorker && !(service as any).reviewedByWorker) {
              setIsWorkerReviewOpen(true);
            }
          }}
          counterpartId={isClient ? service.workerId! : service.clientId}
          counterpartName={isClient ? (service.worker?.name ?? "el profesional") : (service.client?.name ?? "el cliente")}
          serviceId={id}
        />
      )}

      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Abrir al público?</DialogTitle>
            <DialogDescription>
              Tu técnico de confianza no está disponible. Puedes abrir esta solicitud para que cualquier técnico cercano pueda ver y postular.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowConvertDialog(false)}>Cancelar</Button>
            <Button
              className="fixgo-gradient font-bold text-white"
              onClick={onConvertToPublic}
              disabled={convertLoading}
            >
              {convertLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sí, abrir al público
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {photoLightboxIndex !== null && (service as any)?.imageUrls && (service as any).imageUrls[photoLightboxIndex] && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={() => setPhotoLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPhotoLightboxIndex(null); }}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
          {(service as any).imageUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoLightboxIndex((i) =>
                    i === null ? 0 : (i - 1 + (service as any).imageUrls.length) % (service as any).imageUrls.length
                  );
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl leading-none"
                aria-label="Anterior"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoLightboxIndex((i) =>
                    i === null ? 0 : (i + 1) % (service as any).imageUrls.length
                  );
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl leading-none"
                aria-label="Siguiente"
              >
                ›
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-xs bg-white/10 px-3 py-1 rounded-full">
                {photoLightboxIndex + 1} / {(service as any).imageUrls.length}
              </div>
            </>
          )}
          <img
            src={(service as any).imageUrls[photoLightboxIndex]}
            alt={`Foto ${photoLightboxIndex + 1}`}
            className="max-w-[95vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

