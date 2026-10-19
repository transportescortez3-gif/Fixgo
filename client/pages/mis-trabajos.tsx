import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalSocket } from "@/hooks/use-global-socket";
import {
  useListServices, getListServicesQueryKey,
  useGetService,
  useGetServiceProposals, getGetServiceProposalsQueryKey,
  useAcceptProposal, useRejectProposal,
  useStartService, useArriveService, useCancelService, useCompleteService,
  getGetServiceQueryKey,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { uploadFileToStorage } from "@/lib/storage";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { ProposalChatSheet } from "@/components/proposal-chat-sheet";
import { SelfieCaptureModal } from "@/components/selfie-capture-modal";
import { PostServiceModal } from "@/components/post-service-modal";
import { useCountdown, formatCLP, MyChargesBanner, MY_CHARGES_QUERY_KEY } from "@/components/cancellation-charge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Briefcase,
  ImagePlus,
  Loader2,
  MapPin,
  Save,
  X,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Hammer,
  Ban,
  Trash2,
  MessageCircle,
  Star,
  RefreshCw,
  UserCheck,
  UserX,
} from "lucide-react";
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: "Pendiente", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30", icon: Clock },
  alerting: { label: "Buscando", color: "text-blue-400 bg-blue-400/10 border-blue-400/30", icon: AlertCircle },
  open: { label: "Abierto", color: "text-green-400 bg-green-400/10 border-green-400/30", icon: CheckCircle2 },
  accepted: { label: "Aceptado", color: "text-primary bg-primary/10 border-primary/30", icon: CheckCircle2 },
  in_progress: { label: "En progreso", color: "text-orange-400 bg-orange-400/10 border-orange-400/30", icon: Hammer },
  completed: { label: "Completado", color: "text-muted-foreground bg-muted/30 border-border", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "text-destructive bg-destructive/10 border-destructive/30", icon: Ban },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "text-muted-foreground bg-muted/30 border-border", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// Datos oficiales de transferencia del experto (servicio completado con pago
// por transferencia). La app los muestra directamente — nunca por fuera.
function ClientServiceCard({ service, onModalOpen, onModalClose, autoOpenChat, onAutoOpenHandled }: { service: any; onModalOpen?: () => void; onModalClose?: () => void; autoOpenChat?: boolean; onAutoOpenHandled?: () => void }) {
  const queryClient = useQueryClient();
  // Las tarjetas activas permanecen abiertas: el usuario debe ver toda la
  // información sin tener que descubrirla pulsando una flecha.
  const expanded = true;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chatWorker, setChatWorker] = useState<{ workerId: number; workerName: string; workerAvatar?: string | null } | null>(null);

  useEffect(() => {
    const worker = service.worker;
    const workerId = worker?.id ?? service.workerId;
    if (autoOpenChat && workerId && !chatWorker) {
      setChatWorker({
        workerId,
        workerName: worker?.name ?? "Experto",
        workerAvatar: worker?.avatarUrl,
      });
    }
  }, [autoOpenChat, service.worker, service.workerId, chatWorker]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [description, setDescription] = useState(service.description ?? "");
  const [address, setAddress] = useState(service.address ?? "");
  const [imageUrls, setImageUrls] = useState<string[]>(service.imageUrls ?? []);
  const photoRef = useRef<HTMLInputElement>(null);
  const [showPostServiceModal, setShowPostServiceModal] = useState(false);

  const isPendingStatus = ["pending", "alerting", "open"].includes(service.status);
  // "accepted" incluido: el cliente debe poder cancelar aunque ya haya elegido
  // a un experto (con diálogo de confirmación que le advierte del pago de la
  // visita técnica). Los estados editables (pending/alerting/open) se
  // eliminan con el botón "Eliminar" del formulario de edición.
  const canCancel = ["accepted", "in_progress"].includes(service.status);
  const canComplete = service.status === "in_progress";

  // Ventana de cancelación gratis (10 min desde que eligió al experto)
  const freeCancel = useCountdown(service.freeCancelUntil);
  const workerVisitFee: number | null = service.worker?.visitFee ?? null;

  const { data: proposals = [] } = useGetServiceProposals(service.id, {
    query: { enabled: expanded && isPendingStatus, staleTime: 5_000 },
  } as any);

  const acceptProposalMutation = useAcceptProposal();
  const rejectProposalMutation = useRejectProposal();
  const cancelMutation = useCancelService();
  const completeMutation = useCompleteService();

  const invalidateService = () => {
    queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(service.id) });
    queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(service.id) });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  };

  const handleAcceptProposal = async (proposalId: number) => {
    try {
      await acceptProposalMutation.mutateAsync({ id: proposalId });
      toast.success("¡Conectado! Ya puedes chatear para coordinar los detalles.");
      invalidateService();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al conectar");
      invalidateService();
    }
  };

  const handleRejectProposal = async (proposalId: number) => {
    try {
      await rejectProposalMutation.mutateAsync({ id: proposalId });
      toast.success("Propuesta rechazada");
      invalidateService();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al rechazar");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id: service.id });
      // El cargo se crea en el mismo flujo de cancelación tardía. Invalidar
      // aquí además del socket evita que la tarjeta dependa de una conexión
      // en vivo justo después de confirmar el modal.
      queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY });
      toast.success("Servicio cancelado");
      invalidateService();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al cancelar el servicio");
      invalidateService();
    }
  };

  const handleComplete = async () => {
    try {
      await completeMutation.mutateAsync({ id: service.id });
      toast.success("¡Servicio marcado como completado!");
      onModalOpen?.();
      setShowPostServiceModal(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al completar el servicio");
      invalidateService();
    }
  };

  const canEdit = ["pending", "alerting", "open"].includes(service.status);
  const canDelete = ["pending", "alerting", "open"].includes(service.status);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/services/${service.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al eliminar");
      }
      toast.success("Solicitud eliminada");
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } catch (e: any) {
      toast.error(e.message || "No se pudo eliminar la solicitud");
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/services/${service.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ description, address, imageUrls }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Solicitud actualizada");
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } catch {
      toast.error("No se pudo guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const path = await uploadFileToStorage(file);
      const url = `/api/storage/${path}`;
      setImageUrls(prev => [...prev, url]);
    } catch {
      toast.error("Error al subir la foto");
    } finally {
      setUploadingPhoto(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${
      service.workStartedAt
        ? "border-emerald-400/80 ring-2 ring-emerald-400/30 shadow-lg shadow-emerald-500/10 motion-safe:animate-pulse motion-reduce:animate-none"
        : "border-border"
    }`}>
      <div className="w-full text-left px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-lg bg-primary/10 shrink-0">
          <Briefcase className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{service.title}</span>
            <StatusBadge status={service.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{service.description}</p>
          {service.category?.name && (
            <span className="text-[10px] text-muted-foreground">{service.category.name}</span>
          )}
        </div>
      </div>

      {service.workStartedAt && (
        <div role="status" aria-live="polite" className="mx-4 mb-3 rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/15 px-4 py-4 text-base font-bold text-emerald-100 shadow-lg shadow-emerald-500/10">
          <div className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>Trabajo iniciado a las {format(new Date(service.workStartedAt), "HH:mm")}</span>
          </div>
          <p className="mt-2 text-sm font-semibold">Para finalizar tu trabajo, ve a Mis Trabajos y marca como completado.</p>
        </div>
      )}
      {service.workerArrivedAt && !service.workStartedAt && (
        <div role="status" className="mx-4 mb-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          El experto llegó. Inicio automático a las {format(new Date(new Date(service.workerArrivedAt).getTime() + 10 * 60_000), "HH:mm")}.
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
          <div className="text-xs text-muted-foreground">
            Publicado el {format(new Date(service.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
          </div>

          {isPendingStatus && proposals.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Propuestas recibidas ({proposals.length})</Label>
              {proposals.map((p: any) => (
                <div key={p.id} className="bg-muted/20 border border-border/50 rounded-lg px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                        {p.worker?.avatarUrl ? (
                          <img src={p.worker.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-primary">{p.worker?.name?.[0]}</span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{p.worker?.name}</span>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                      p.status === "pending" ? "bg-yellow-400/10 text-yellow-400" :
                      p.status === "accepted" ? "bg-green-400/10 text-green-400" :
                      "bg-destructive/10 text-destructive"
                    }`}>
                      {p.status === "pending" ? "en revisión" : p.status === "accepted" ? "aceptada" : "rechazada"}
                    </span>
                  </div>
                  {p.message && <p className="text-xs text-muted-foreground">{p.message}</p>}
                  {p.status === "pending" && (
                    <div className="flex gap-1.5 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs bg-primary text-white"
                        onClick={() => handleAcceptProposal(p.id)}
                        disabled={acceptProposalMutation.isPending}
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1" /> Elegir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRejectProposal(p.id)}
                        disabled={rejectProposalMutation.isPending}
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => setChatWorker({ workerId: p.worker.id, workerName: p.worker.name, workerAvatar: p.worker.avatarUrl })}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEdit ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Descripción
                </Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                  placeholder="Describe tu solicitud..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Dirección
                </Label>
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="text-sm"
                  placeholder="Dirección del servicio"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5" /> Fotos
                </Label>
                <div className="flex flex-wrap gap-2">
                  {imageUrls.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => photoRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  </button>
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={saving || deleting}
                  size="sm"
                  className="flex-1 bg-primary text-white"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving || deleting}
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                      Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar solicitud?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente la solicitud <strong>"{service.title}"</strong>.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive hover:bg-destructive/90 text-white"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {service.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Descripción</p>
                  <p className="min-w-0 max-w-full [overflow-wrap:anywhere] text-sm text-foreground line-clamp-4 overflow-hidden">{service.description}</p>
                </div>
              )}
              {service.address && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {service.address}
                </div>
              )}
              {service.worker && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {service.worker.avatarUrl ? (
                        <img src={service.worker.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-primary">{service.worker.name?.[0]}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{service.worker.name}</p>
                      <p className="text-[10px] text-muted-foreground">Experto conectado</p>
                    </div>
                  </div>
                  <button
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-500 text-white shrink-0 active:scale-90 transition"
                    onClick={() => setChatWorker({ workerId: service.worker.id, workerName: service.worker.name, workerAvatar: service.worker.avatarUrl })}
                    title="Abrir chat"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
              {(service.imageUrls?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {service.imageUrls.map((url: string, idx: number) => (
                    <img key={idx} src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
                  ))}
                </div>
              )}

              {service.workerCompletedAt && service.status === "in_progress" && (
                <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2.5 flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    El experto marcó el trabajo como <strong>realizado</strong>. Confírmalo con "Marcar Completado". Si no respondes en 24 horas, se completará automáticamente.
                  </p>
                </div>
              )}
              {service.clientCompletedAt && !service.workerCompletedAt && service.status === "in_progress" && (
                <div className="rounded-lg border border-border bg-muted px-3 py-2.5 flex gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Marcaste el trabajo como completado. Esperando la confirmación del experto (máx. 24 h).
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {canComplete && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleComplete}
                    disabled={completeMutation.isPending}
                  >
                    {completeMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Marcar Completado
                  </Button>
                )}
                {canCancel && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                        <Ban className="w-3.5 h-3.5 mr-1.5" /> Cancelar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Cancelar este trabajo?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {!service.workerId
                            ? <>Se cerrará esta solicitud para todos los profesionales.</>
                            : freeCancel.active
                              ? <>Estás dentro del tiempo de cancelación gratis (<strong className="tabular-nums">{freeCancel.label}</strong>). Puedes cancelar ahora <strong>sin costo</strong>.</>
                              : <>Ya elegiste a <strong>{service.worker?.name ?? "un profesional"}</strong> y el tiempo de cancelación gratis terminó. Si cancelas ahora, deberás transferirle su tarifa de visita técnica{workerVisitFee ? <> de <strong>{formatCLP(workerVisitFee)}</strong></> : null} dentro de 24 horas.</>}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Mantener el trabajo</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleCancel}
                          className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                          {service.workerId && freeCancel.active ? "Cancelar ahora (sin costo)" : "Sí, cancelar"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {service.status === "completed" && (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/services/new?title=${encodeURIComponent(service.title)}&address=${encodeURIComponent(service.address || '')}&categoryId=${service.categoryId}`}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Repetir
                      </a>
                    </Button>
                    {!service.reviewedByClient && (
                      <Button size="sm" variant="outline" className="border-primary/30 text-primary" onClick={() => setShowPostServiceModal(true)}>
                        <Star className="w-3.5 h-3.5 mr-1.5" /> Calificar
                      </Button>
                    )}
                  </>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground italic">
                Esta solicitud ya no se puede editar en su estado actual.
              </p>
            </div>
          )}
        </div>
      )}

      {chatWorker && (
        <ProposalChatSheet
          open={!!chatWorker}
          onOpenChange={(v) => {
            if (!v) {
              setChatWorker(null);
              // El servicio completado se mantiene en la lista mientras el
              // chat está abierto. Limpiar ahora evita que el efecto de
              // autoapertura lo vuelva a abrir y permite desmontarlo después.
              if (autoOpenChat) onAutoOpenHandled?.();
            }
          }}
          serviceId={service.id}
          workerId={chatWorker.workerId}
          workerName={chatWorker.workerName}
          workerAvatar={chatWorker.workerAvatar}
          iAmClient={true}
          readOnly={["completed", "cancelled"].includes(service.status)}
          serviceStatus={service.status}
          paymentMethod={service.paymentMethod}
          requestQuote={!!service.requestQuote}
          freeCancelUntil={service.freeCancelUntil}
        />
      )}

      {service.worker && (
        <PostServiceModal
          open={showPostServiceModal}
          onClose={() => {
            setShowPostServiceModal(false);
            onModalClose?.();
          }}
          counterpartId={service.worker.id}
          counterpartName={service.worker.name}
          serviceId={service.id}
        />
      )}
    </div>
  );
}

function WorkerJobCard({ proposal, autoRate, autoOpenChat, onAutoOpenHandled, onAutoRateHandled, retainedCancelled, onCancelledDismissed, openSecuritySelfie, onSecuritySelfieComplete }: { proposal: any; autoRate?: boolean; autoOpenChat?: boolean; onAutoOpenHandled?: () => void; onAutoRateHandled?: () => void; retainedCancelled?: boolean; onCancelledDismissed?: () => void; openSecuritySelfie?: boolean; onSecuritySelfieComplete?: (serviceId: number) => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const arriveMutation = useArriveService();
  const startMutation = useStartService();
  const svc = proposal.service;
  // Las tarjetas activas permanecen abiertas por defecto para mostrar todos
  // los detalles y acciones de una sola vez.
  const [expanded, setExpanded] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [securitySelfieOpen, setSecuritySelfieOpen] = useState(false);
  const [securitySelfieSaving, setSecuritySelfieSaving] = useState(false);
  const [workerSelfieCompleted, setWorkerSelfieCompleted] = useState(() => !!svc?.workerSelfieUrl);

  useEffect(() => {
    if (svc?.workerSelfieUrl) setWorkerSelfieCompleted(true);
  }, [svc?.workerSelfieUrl]);

  useEffect(() => {
    if (
      openSecuritySelfie &&
      svc?.id &&
      proposal.status === "accepted" &&
      !workerSelfieCompleted
    ) {
      setSecuritySelfieOpen(true);
    }
  }, [openSecuritySelfie, svc?.id, proposal.status, workerSelfieCompleted]);

  useEffect(() => {
    if (autoOpenChat && !showChat) {
      setShowChat(true);
      onAutoOpenHandled?.();
    }
  }, [autoOpenChat, showChat, onAutoOpenHandled]);

  useEffect(() => {
    // Si el chat está abierto, el propio chat muestra el modal de calificación
    // (abrir también este Dialog duplicaría la calificación). Además, limpiar
    // completedServiceId aquí desmontaría la tarjeta al llegar el refetch
    // (status → completed) y cerraría de golpe el chat/modal: se limpia recién
    // al cerrar el Dialog (closeRate).
    if (autoRate && !rateOpen && !showChat && !proposal.service?.reviewedByWorker) {
      setRateOpen(true);
      setExpanded(true);
    }
  }, [autoRate, showChat]);
  const [rateStars, setRateStars] = useState(5);
  const [rateComment, setRateComment] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  if (!svc) return null;

  const markArrival = async () => {
    try {
      await arriveMutation.mutateAsync({ id: svc.id });
      toast.success("Llegada registrada. Tienes 10 minutos para iniciar el trabajo.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey({ workerId: user?.id, limit: 50 }) }),
        queryClient.invalidateQueries({ queryKey: ["proposals", "my"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la llegada");
    }
  };

  const startWork = async () => {
    try {
      await startMutation.mutateAsync({ id: svc.id });
      toast.success("Trabajo iniciado");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey({ workerId: user?.id, limit: 50 }) }),
        queryClient.invalidateQueries({ queryKey: ["proposals", "my"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar el trabajo");
    }
  };

  const handleSecuritySelfie = async (objectPath: string) => {
    setSecuritySelfieSaving(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const response = await fetch("/api/security-selfies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ objectPath, serviceId: svc.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "No se pudo registrar la selfie");

      setWorkerSelfieCompleted(true);
      queryClient.setQueryData(["proposals", "my"], (current: any[] | undefined) =>
        Array.isArray(current)
          ? current.map((item) => item.service?.id === svc.id
            ? { ...item, service: { ...item.service, workerSelfieUrl: objectPath, workerSelfieTakenAt: new Date().toISOString() } }
            : item)
          : current
      );
      queryClient.setQueryData(getGetServiceQueryKey(svc.id), (current: any) =>
        current
          ? { ...current, workerSelfieUrl: objectPath, workerSelfieTakenAt: new Date().toISOString() }
          : current
      );
      setSecuritySelfieOpen(false);
      toast.success("Selfie registrada. La dirección ya está disponible.");
      await queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
      await queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(svc.id) });
      onSecuritySelfieComplete?.(svc.id);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo registrar la selfie");
    } finally {
      setSecuritySelfieSaving(false);
    }
  };

  // Estado cancelado EFECTIVO: el socket (retainedCancelled) manda aunque el
  // refetch de /proposals/my aún no refleje status=cancelled (o falle). Sin esto,
  // la UI del chat quedaría editable durante la ventana socket→refetch.
  const effectiveCancelled = svc.status === "cancelled" || !!retainedCancelled;
  const effectiveStatus = effectiveCancelled ? "cancelled" : svc.status;

  // Ventana de cancelación gratis: comienza al confirmar el acuerdo; mientras
  // esté activa, el experto NO ve la dirección y debe esperar antes de salir.
  const freeCancel = useCountdown(svc.freeCancelUntil);
  const freeCancelActive = freeCancel.active && effectiveStatus === "in_progress" && proposal.status === "accepted";
  useEffect(() => {
    if (
      !openSecuritySelfie &&
      proposal.status === "accepted" &&
      ["accepted", "in_progress"].includes(effectiveStatus) &&
      !!svc.freeCancelUntil &&
      freeCancel.expired &&
      !workerSelfieCompleted
    ) {
      setSecuritySelfieOpen(true);
    }
  }, [
    openSecuritySelfie,
    proposal.status,
    effectiveStatus,
    svc.freeCancelUntil,
    freeCancel.expired,
    workerSelfieCompleted,
  ]);

  const closeRate = () => {
    setRateOpen(false);
    onAutoRateHandled?.();
  };

  const submitClientRating = async () => {
    setRateLoading(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/reviews/rate-client", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ serviceId: svc.id, clientId: svc.clientId, rating: rateStars, comment: rateComment }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${res.status}`);
      }
      toast.success("¡Gracias por tu calificación!");
      closeRate();
      queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } catch (err: any) {
      toast.error(err?.message || "Error al enviar la calificación");
    } finally {
      setRateLoading(false);
    }
  };

  const [doneLoading, setDoneLoading] = useState(false);

  // El experto marca "Trabajo realizado": el cliente recibe la notificación
  // para confirmar; si no responde en 24 horas, se completa automáticamente.
  const submitWorkerComplete = async () => {
    setDoneLoading(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/services/${svc.id}/worker-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${res.status}`);
      }
      toast.success("Avisamos al cliente para que confirme. Si no responde en 24 horas, el trabajo se completará solo.");
      queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } catch (err: any) {
      toast.error(err?.message || "Error al marcar el trabajo como realizado");
    } finally {
      setDoneLoading(false);
    }
  };

  const submitWorkerCancel = async () => {
    setCancelLoading(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/services/${svc.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${res.status}`);
      }
      toast.success("Trabajo cancelado");
      setCancelOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } catch (err: any) {
      toast.error(err?.message || "Error al cancelar el trabajo");
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${
      svc.workStartedAt
        ? "border-emerald-400/80 ring-2 ring-emerald-400/30 shadow-lg shadow-emerald-500/10 motion-safe:animate-pulse motion-reduce:animate-none"
        : "border-border"
    }`}>
      <div className="w-full text-left px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-lg bg-primary/10 shrink-0">
          <Briefcase className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{svc.title}</span>
            <StatusBadge status={effectiveStatus} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svc.description}</p>
          {svc.category?.name && (
            <span className="text-[10px] text-muted-foreground">{svc.category.name}</span>
          )}
        </div>
      </div>

      {svc.workStartedAt && (
        <div role="status" aria-live="polite" className="mx-4 mb-3 rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/15 px-4 py-4 text-base font-bold text-emerald-100 shadow-lg shadow-emerald-500/10">
          <div className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>Trabajo iniciado a las {format(new Date(svc.workStartedAt), "HH:mm")}</span>
          </div>
          <p className="mt-2 text-sm font-semibold">Para finalizar tu trabajo, ve a Mis Trabajos y marca como completado.</p>
        </div>
      )}
      {svc.workerArrivedAt && !svc.workStartedAt && (
        <div role="status" className="mx-4 mb-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          Llegada registrada. Inicio automático a las {format(new Date(new Date(svc.workerArrivedAt).getTime() + 10 * 60_000), "HH:mm")}.
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2">
          <div className="text-xs text-muted-foreground">
            Aplicaste el {format(new Date(proposal.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
          </div>
          {svc.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Descripción del trabajo</p>
              <p className="min-w-0 max-w-full [overflow-wrap:anywhere] text-sm text-foreground line-clamp-4 overflow-hidden">{svc.description}</p>
            </div>
          )}
          {(svc as any).originAddress && !!svc.freeCancelUntil && !freeCancelActive && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-start gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="[overflow-wrap:anywhere]"><strong>Origen:</strong> {(svc as any).originAddress}</span>
              </div>
              <div className="flex items-start gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="[overflow-wrap:anywhere]"><strong>Destino:</strong> {(svc as any).destinationAddress}</span>
              </div>
            </div>
          )}
          {svc.address && !(svc as any).originAddress && !!svc.freeCancelUntil && !freeCancelActive && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground min-w-0">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="[overflow-wrap:anywhere]">{svc.address}</span>
            </div>
          )}
          {freeCancelActive && (
            <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 px-3 py-2 text-xs">
              <p className="font-bold text-foreground">⏱️ Espera <span className="tabular-nums text-blue-400">{freeCancel.label}</span> antes de salir</p>
              <p className="text-muted-foreground mt-0.5">El cliente aún puede cancelar sin costo. La dirección se mostrará cuando termine el tiempo.</p>
            </div>
          )}
          {(svc.client || svc.clientId) && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                {svc.client?.avatarUrl ? (
                  <img src={svc.client.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-primary">{svc.client?.name?.[0] ?? "C"}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{svc.client?.name ?? "Cliente"}</p>
                <p className="text-[10px] text-muted-foreground">Cliente del trabajo</p>
              </div>
            </div>
          )}
          {svc.clientCompletedAt && !svc.workerCompletedAt && effectiveStatus === "in_progress" && (
            <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2.5 flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                El cliente marcó el trabajo como <strong>realizado</strong>. Confirma la finalización con “Confirmar finalización”. Si no respondes en 24 horas, se completará automáticamente.
              </p>
            </div>
          )}
          {svc.workerCompletedAt && !svc.clientCompletedAt && effectiveStatus === "in_progress" && (
            <div className="rounded-lg border border-border bg-muted px-3 py-2.5 flex gap-2">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Marcaste el trabajo como realizado. Esperando la confirmación del cliente (máx. 24 h).
              </p>
            </div>
          )}
          {proposal.message && (
            <div className="bg-muted/20 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground mb-0.5">Tu mensaje</p>
              <p className="text-sm text-foreground">{proposal.message}</p>
            </div>
          )}
          {(svc.imageUrls?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {svc.imageUrls.map((url: string, idx: number) => (
                <img key={idx} src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
              ))}
            </div>
          )}

          {/* Chat visible también cuando la propuesta aún está en revisión:
              el trabajador puede chatear con el cliente antes de ser elegido.
              "cancelled" incluido para el chat congelado con el aviso. */}
          {(svc.clientId || svc.client) && (
            ["accepted", "in_progress", "completed", "cancelled"].includes(effectiveStatus) ||
            (proposal.status === "pending" && ["open", "alerting"].includes(effectiveStatus))
          ) && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => setShowChat(true)}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Chat
              </Button>
              {proposal.status === "accepted" &&
                ["accepted", "in_progress"].includes(effectiveStatus) &&
                !svc.workerArrivedAt &&
                !svc.workStartedAt && (
                <div className="flex flex-col items-start gap-1">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground"
                    onClick={markArrival}
                    disabled={arriveMutation.isPending}
                  >
                    <MapPin className="w-3.5 h-3.5 mr-1.5" />
                    {arriveMutation.isPending ? "Registrando llegada…" : "Llegué al domicilio"}
                  </Button>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Se te darán 10 minutos para iniciar el trabajo. Si no lo inicias manualmente, se dará por iniciado automáticamente al finalizar el tiempo.
                  </p>
                </div>
              )}
              {proposal.status === "accepted" &&
                ["accepted", "in_progress"].includes(effectiveStatus) &&
                !!svc.workerArrivedAt &&
                !svc.workStartedAt && (
                <Button
                  size="sm"
                  className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  onClick={startWork}
                  disabled={startMutation.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {startMutation.isPending ? "Iniciando…" : "Iniciar trabajo"}
                </Button>
              )}
              {proposal.status === "accepted" && effectiveStatus === "in_progress" && !svc.workerCompletedAt && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={submitWorkerComplete}
                  disabled={doneLoading}
                >
                  {doneLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {svc.clientCompletedAt ? "Confirmar finalización" : "Trabajo realizado"}
                </Button>
              )}
              {proposal.status === "accepted" && ["accepted", "in_progress"].includes(effectiveStatus) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="w-3.5 h-3.5 mr-1.5" /> Cancelar
                </Button>
              )}
              {svc.status === "completed" && !svc.reviewedByWorker && (
                <Button size="sm" variant="outline" className="border-primary/30 text-primary" onClick={() => setRateOpen(true)}>
                  <Star className="w-3.5 h-3.5 mr-1.5" /> Calificar Cliente
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {showChat && user && (
        <ProposalChatSheet
          open={showChat}
          onOpenChange={(v) => {
            if (!v) {
              setShowChat(false);
              // Si la finalización llegó con el chat abierto, el chat ya mostró
              // el modal de calificación: al cerrar, limpiar completedServiceId
              // para que la tarjeta salga de la lista sin re-abrir el Dialog.
              if (autoRate) onAutoRateHandled?.();
              // Servicio cancelado: el trabajador vio la pantalla de cancelación
              // y salió por sí mismo ("dio atrás") → recién ahora soltar la tarjeta.
              if (effectiveCancelled) onCancelledDismissed?.();
            }
          }}
          serviceId={svc.id}
          workerId={user.id}
          workerName={svc.client?.name ?? "Cliente"}
          workerAvatar={svc.client?.avatarUrl}
          otherUserId={svc.clientId || svc.client?.id}
          iAmClient={false}
          proposalStatus={proposal.status}
          readOnly={["completed", "cancelled"].includes(effectiveStatus) || proposal.status === "rejected"}
          serviceStatus={effectiveStatus}
          freeCancelUntil={svc.freeCancelUntil}
          workerSelfieCompleted={workerSelfieCompleted}
        />
      )}

      <SelfieCaptureModal
        open={securitySelfieOpen}
        onClose={() => setSecuritySelfieOpen(false)}
        onCapture={handleSecuritySelfie}
        title="Selfie de seguridad"
        description="El tiempo de cancelación gratuita terminó. Tómate una selfie para verificar tu identidad. Esta imagen se usa únicamente con fines de seguridad, como respaldo en caso de incidentes, y se elimina automáticamente 5 días hábiles después de la captura. La dirección se mostrará a continuación."
      />

      <Dialog open={cancelOpen} onOpenChange={(v) => { setCancelOpen(v); if (!v) setCancelReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar este trabajo?</DialogTitle>
            <DialogDescription className="sr-only">
              Confirma la cancelación del trabajo indicando el motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={`rounded-lg border px-3 py-2.5 flex gap-2 ${freeCancelActive ? "border-blue-400/30 bg-blue-400/10" : "border-destructive/30 bg-destructive/10"}`}>
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${freeCancelActive ? "text-blue-400" : "text-destructive"}`} />
              <p className="text-sm text-foreground">
                {freeCancelActive ? (
                  <>Estás dentro de los 10 minutos de cancelación gratuita (<strong className="tabular-nums text-blue-400">{freeCancel.label}</strong>). Puedes cancelar este trabajo sin penalización.</>
                ) : (
                  <>Ya elegiste a <strong>{svc.client?.name ?? "este cliente"}</strong>. El plazo gratuito terminó; cancelar ahora puede suspender temporalmente tu cuenta según tu reincidencia.</>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Cuéntanos qué pasó (opcional):</Label>
              <Textarea
                placeholder="Explica por qué necesitas cancelar este trabajo..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Mantener el trabajo</Button>
            <Button
              variant="destructive"
              onClick={submitWorkerCancel}
              disabled={cancelLoading}
            >
              {cancelLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {freeCancelActive ? "Sí, cancelar sin penalización" : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={(v) => { if (!v) closeRate(); else setRateOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calificar la Convivencia</DialogTitle>
            <DialogDescription>
              ¿Cómo estuvo la experiencia y el trato mutuo con {svc.client?.name}?
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
                    onClick={() => setRateStars(star)}
                    className={`p-2 transition-colors ${rateStars >= star ? "text-blue-500" : "text-muted-foreground"}`}
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
                value={rateComment}
                onChange={e => setRateComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRate}>Omitir</Button>
            <Button onClick={submitClientRating} disabled={rateLoading}>
              {rateLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar Calificación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useMyProposals(enabled: boolean) {
  return useQuery({
    queryKey: ["proposals", "my"],
    queryFn: async () => {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/proposals/my", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error cargando propuestas");
      return res.json() as Promise<any[]>;
    },
    staleTime: 15_000,
    refetchOnMount: 'always' as const,
    enabled,
  });
}

export default function MisTrabajos() {
  const { user, isClient, isWorker } = useAuth();
  const queryClient = useQueryClient();
  const [openModalServiceIds, setOpenModalServiceIds] = useState<Set<number>>(new Set());
  const [completedServiceId, setCompletedServiceId] = useState<number | null>(null);
  // Cancelaciones que llegaron en vivo mientras el trabajador está en esta página:
  // retener sus tarjetas (y el chat congelado con el aviso "⛔ canceló") hasta que
  // el trabajador cierre el chat por sí mismo, en vez de desaparecérselas de golpe.
  const [cancelledServiceIds, setCancelledServiceIds] = useState<Set<number>>(new Set());
  const [chatServiceId, setChatServiceId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("chatServiceId");
    return raw ? Number(raw) : null;
  });
  const [securitySelfieServiceId, setSecuritySelfieServiceId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("securitySelfieServiceId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
  const [chargeServiceId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("chargeServiceId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });

  const clearChatServiceParam = () => {
    setChatServiceId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("chatServiceId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const completeSecuritySelfieFlow = (serviceId: number) => {
    setSecuritySelfieServiceId(null);
    setChatServiceId(serviceId);
    const url = new URL(window.location.href);
    url.searchParams.delete("securitySelfieServiceId");
    url.searchParams.set("chatServiceId", String(serviceId));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const { data: servicesData, isLoading: servicesLoading } = useListServices(
    isClient ? { clientId: user?.id, limit: 50 } : { workerId: user?.id, limit: 50 },
    { query: { enabled: !!user, staleTime: 15_000, refetchOnMount: "always" } } as any
  );

  // Las alertas de transferencia apuntan a la orden completada. Si esa orden
  // quedó fuera del listado paginado, cargarla por ID para abrir igualmente el
  // hilo autorizado desde el aviso de Inicio.
  const { data: requestedService } = useGetService(chatServiceId ?? 0, {
    query: {
      enabled: !!user && isClient && !!chatServiceId,
      staleTime: 15_000,
      retry: false,
    },
  } as any);

  const { data: proposals = [], isLoading: proposalsLoading } = useMyProposals(!!isWorker);

  useGlobalSocket(user?.id ?? null, {
    onCancellationCharge: () => {
      queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY });
    },
    onProposalUpdated: (data) => {
      if (data.action === "not_selected" || data.action === "rejected") {
        queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
      }
    },
    onServiceUpdated: (data) => {
      if (isWorker && data.status === "completed") {
        setCompletedServiceId(data.serviceId);
        queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
        return;
      }
      if (isWorker && data.status === "cancelled") {
        setCancelledServiceIds(prev => new Set([...prev, data.serviceId]));
        queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
        return;
      }
      // in_progress = otro trabajador fue aceptado → actualizar propuestas para quitar las rechazadas
      if (isWorker && data.status === "in_progress") {
        queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
      }
      if (data.status !== "completed" && data.status !== "cancelled") {
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      }
    },
  });

  const listedServices: any[] = (servicesData as any)?.services ?? [];
  const services: any[] = requestedService && !listedServices.some(s => s.id === requestedService.id)
    ? [requestedService, ...listedServices]
    : listedServices;

  const activeServices = services.filter(s =>
    !["completed", "cancelled"].includes(s.status) ||
    s.id === chatServiceId ||
    openModalServiceIds.has(s.id)
  );
  // Mantener propuestas completadas visibles si coinciden con completedServiceId
  // para que WorkerJobCard pueda mostrar el modal de calificación antes de desaparecer.
  const activeProposals = proposals.filter(p =>
    p.status !== "rejected" &&
    (!["completed", "cancelled"].includes(p.service?.status ?? "") ||
      completedServiceId === p.service?.id ||
      cancelledServiceIds.has(p.service?.id))
  );

  const isLoading = isClient ? servicesLoading : proposalsLoading;

  return (
    <div className="min-h-full shrink-0 pb-[calc(12rem_+_env(safe-area-inset-bottom,0px))] pt-2">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground">Mis Trabajos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isClient
              ? "Tus solicitudes de servicio activas"
              : "Conexiones activas y propuestas enviadas"}
          </p>
        </div>

        {isClient && <MyChargesBanner role="client" focusServiceId={chargeServiceId} />}
        {isWorker && <MyChargesBanner role="worker" focusServiceId={chargeServiceId} />}

        {/* Suspensión temporal por cancelaciones reiteradas (sanción automática) */}
        {isWorker && (user as any)?.suspendedUntil && new Date((user as any).suspendedUntil).getTime() > Date.now() && (
          <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 flex gap-2.5">
            <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cuenta suspendida temporalmente</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Por cancelaciones reiteradas de trabajos aceptados, no recibirás alertas ni podrás enviar propuestas hasta el{" "}
                <strong>{new Date((user as any).suspendedUntil).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                La reincidencia puede derivar en un bloqueo definitivo de tu cuenta.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : isClient ? (
          <div className="space-y-3">
            {activeServices.length === 0 ? (
              <EmptyState
                title="Sin solicitudes activas"
                subtitle="Aún no tienes solicitudes de servicio en curso. Explora nuestros expertos para empezar."
              />
            ) : (
              activeServices.map(s => (
                <ClientServiceCard
                  key={s.id}
                  service={s}
                  autoOpenChat={chatServiceId === s.id}
                  onAutoOpenHandled={chatServiceId === s.id ? clearChatServiceParam : undefined}
                  onModalOpen={() => setOpenModalServiceIds(prev => new Set([...prev, s.id]))}
                  onModalClose={() => {
                    setOpenModalServiceIds(prev => {
                      const next = new Set(prev);
                      next.delete(s.id);
                      return next;
                    });
                    queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(s.id) });
                    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                  }}
                />
              ))
            )}
          </div>
        ) : isWorker ? (
          <div className="space-y-3">
            {activeProposals.length === 0 ? (
              <EmptyState
                title="Sin propuestas activas"
                subtitle="Aquí aparecerán los trabajos a los que hayas aplicado. Explora el inicio para descubrir nuevos servicios."
              />
            ) : (
              activeProposals.map(p => (
                <WorkerJobCard
                  key={p.id}
                  proposal={p}
                  autoRate={completedServiceId === p.service?.id}
                  autoOpenChat={chatServiceId === p.service?.id}
                  onAutoOpenHandled={chatServiceId === p.service?.id ? clearChatServiceParam : undefined}
                  onAutoRateHandled={() => setCompletedServiceId(null)}
                  retainedCancelled={cancelledServiceIds.has(p.service?.id)}
                  openSecuritySelfie={securitySelfieServiceId === p.service?.id}
                  onSecuritySelfieComplete={completeSecuritySelfieFlow}
                  onCancelledDismissed={() => setCancelledServiceIds(prev => {
                    const next = new Set(prev);
                    next.delete(p.service?.id);
                    return next;
                  })}
                />
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Briefcase className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{subtitle}</p>
    </div>
  );
}
