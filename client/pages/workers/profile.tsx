import { useRoute, Link, useLocation } from "wouter";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useGetUser, useGetWorkerReviews, useAcceptProposal, useCreateReview, useGetService, useCancelService } from "@/api";
import { Button } from "@/components/ui/button";
import { ProposalChatSheet } from "@/components/proposal-chat-sheet";
import DirectChatSheet from "@/components/direct-chat-sheet";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Star, Wrench, MessageSquare, ArrowLeft, Award, Image as ImageIcon, ShieldCheck, MapPin, Zap, Clock, Trophy, Video, Home, Ban, Loader2 } from "lucide-react";
import { ProBadge } from "@/components/pro-badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Math.round(rating) ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

interface WorkerBadge {
  id: string;
  label: string;
  icon: string;
  color: string;
}

function computeBadges(worker: any, reviewList: any[]): WorkerBadge[] {
  const badges: WorkerBadge[] = [];

  if ((worker as any).kycStatus === "approved") {
    badges.push({ id: "verified", label: "Verificado", icon: "🛡️", color: "border-green-500/40 text-green-400 bg-green-500/10" });
  }

  if (worker.rating >= 4.8 && worker.totalReviews >= 10) {
    badges.push({ id: "top_pro", label: "Top Pro", icon: "🏆", color: "border-primary/40 text-primary bg-primary/10" });
  }

  const createdAt = new Date(worker.createdAt);
  const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 365) {
    badges.push({ id: "veteran", label: "Veterano", icon: "📅", color: "border-blue-500/40 text-blue-400 bg-blue-500/10" });
  }

  const recommends = reviewList.filter((r: any) => r.recommends === true);
  if (reviewList.length >= 5 && recommends.length / reviewList.length >= 0.95) {
    badges.push({ id: "highly_recommended", label: "Muy recomendado", icon: "👍", color: "border-purple-500/40 text-purple-400 bg-purple-500/10" });
  }

  return badges;
}

export default function WorkerProfile() {
  const [, params] = useRoute("/workers/:id");
  const workerId = params?.id ? parseInt(params.id, 10) : null;
  const { user, isClient } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const fromService = urlParams.get("fromService");
  const proposalIdParam = urlParams.get("proposalId");
  const serviceTitle = urlParams.get("serviceTitle") ? decodeURIComponent(urlParams.get("serviceTitle")!) : null;
  const hasServiceContext = !!(fromService && workerId);
  const { data: serviceData } = useGetService(fromService ? parseInt(fromService) : 0, {
    query: { queryKey: ["service", fromService], enabled: hasServiceContext },
  });

  const [chatOpen, setChatOpen] = useState(false);
  const [directChatOpen, setDirectChatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const cancelMutation = useCancelService();
  const [reviewComment, setReviewComment] = useState("");
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const acceptMutation = useAcceptProposal();
  const createReviewMutation = useCreateReview();

  // Consulta si el cliente tiene un servicio completado sin reseña con este trabajador
  const { data: reviewableData, refetch: refetchReviewable } = useQuery({
    queryKey: ["reviewable", workerId, user?.id],
    queryFn: async () => {
      if (!workerId || !user) return null;
      const token = localStorage.getItem("fixgo_token") ?? "";
      const res = await fetch(`/api/reviews/reviewable/${workerId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ reviewable: boolean; serviceId?: number; alreadyReviewed?: boolean }>;
    },
    enabled: !!workerId && !!user && user.role === "client",
    staleTime: 30_000,
  });

  const handleSubmitReview = async () => {
    if (!reviewableData?.serviceId || reviewRating === 0 || !workerId) return;
    try {
      await createReviewMutation.mutateAsync({
        serviceId: reviewableData.serviceId,
        workerId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      } as any);
      setReviewSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["workerReviews", workerId] });
      toast.success("¡Reseña enviada! Gracias por tu valoración.");
    } catch (e: any) {
      toast.error(e?.data?.error || e?.message || "Error al enviar la reseña");
    }
  };

  const handleAcceptFromProfile = useCallback(async () => {
    if (!proposalIdParam) return;
    try {
      await acceptMutation.mutateAsync({ id: parseInt(proposalIdParam) });
      // Refrescar las listas de servicios: sin esto, al volver al home la
      // pantalla del radar/"Buscar de nuevo" queda desactualizada si el
      // socket no está conectado.
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Error al confirmar");
    }
  }, [proposalIdParam, acceptMutation, queryClient]);

  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<any[]>([]);

  useEffect(() => {
    if (!workerId) return;
    const token = localStorage.getItem("fixgo_token");
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/portfolio/${workerId}`, { headers })
      .then((r) => r.json())
      .then((d) => setPortfolio(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch(`/api/certifications/${workerId}`, { headers })
      .then((r) => r.json())
      .then((d) => setCertifications(Array.isArray(d) ? d.filter((c: any) => c.status === "verified") : []))
      .catch(() => {});
  }, [workerId]);

  const { data: worker, isLoading, error } = useGetUser(workerId!, {
    query: { enabled: !!workerId, staleTime: 5 * 60_000, gcTime: 15 * 60_000 } as any,
  });

  const { data: reviews, isLoading: reviewsLoading } = useGetWorkerReviews(workerId!, {
    query: { enabled: !!workerId, staleTime: 5 * 60_000, gcTime: 15 * 60_000 } as any,
  });

  // NO exigir role === "worker": con el cambio de rol (Cambiar a Experto) un
  // usuario registrado como cliente puede enviar propuestas como experto sin
  // que su rol en la BD cambie — su perfil debe poder verse igual.
  if (!workerId || error) {
    return (
      <div className="container px-4 py-16 text-center max-w-xl mx-auto">
        <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
        <h1 className="text-2xl font-bold mb-2">Profesional no encontrado</h1>
        <p className="text-muted-foreground mb-6">Este perfil no existe o no está disponible.</p>
        <Button asChild><Link href="/workers">Ver Profesionales</Link></Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container px-4 py-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!worker) return null;

  const reviewList = Array.isArray(reviews) ? reviews : [];
  const skills = worker.skills ? worker.skills.split(",").map(s => s.trim()).filter(Boolean) : [];
  const badges = computeBadges(worker, reviewList);

  const memberSince = format(new Date(worker.createdAt), "MMM yyyy", { locale: es });

  const cumplimiento = reviewList.length > 0
    ? Math.round((reviewList.filter((r: any) => r.recommends !== false).length / reviewList.length) * 100)
    : 100;

  return (
    <div className={`max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4 ${hasServiceContext ? "pb-32" : "pb-6"}`}>

      {/* Barra superior: volver + Abrir Chat + Cancelar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => hasServiceContext ? navigate("/") : navigate("/workers")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {hasServiceContext ? "Volver" : "Volver a Profesionales"}
        </Button>
        {hasServiceContext && (
          <div className="flex items-center gap-2">
            {["accepted", "in_progress"].includes((serviceData as any)?.status) && (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 rounded-xl"
                onClick={() => setCancelOpen(true)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              </Button>
            )}
            <Button
              onClick={() => setChatOpen(true)}
              className="fixgo-gradient font-bold text-white gap-1.5 rounded-xl"
              size="sm"
            >
              <MessageSquare className="w-4 h-4" />
              Abrir Chat
            </Button>
          </div>
        )}
      </div>

      {/* Banner propuesta activa */}
      {hasServiceContext && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-foreground leading-none">Propuesta recibida</p>
              {serviceTitle && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{serviceTitle}</p>}
            </div>
          </div>
          <Button onClick={() => setChatOpen(true)} variant="outline" size="sm"
            className="w-full border-primary/40 text-primary hover:bg-primary/10 font-bold text-xs rounded-xl">
            Abrir Chat
          </Button>
        </div>
      )}

      {/* ── TARJETA PRINCIPAL ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Avatar + nombre + badge */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="w-20 h-20 border-4 border-primary/20">
                <AvatarImage src={worker.avatarUrl || undefined} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
                  {worker.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {worker.isAvailable && (
                <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold leading-tight break-words min-w-0">{worker.name}</h1>
                <ProBadge planCode={(worker as any).subscriptionPlan} size="md" />
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StarRating rating={worker.rating ?? 0} />
                <span className="text-xs text-muted-foreground">
                  {worker.rating ? worker.rating.toFixed(1) : "Nuevo"} ({worker.totalReviews ?? 0} reseñas)
                </span>
              </div>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {badges.map(b => (
                    <span key={b.id} className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${b.color}`}>
                      {b.icon} {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Disponibilidad */}
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${worker.isAvailable ? "bg-green-500/5 border-green-500/20" : "bg-muted/30 border-border/40"}`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${worker.isAvailable ? "bg-green-500" : "bg-muted-foreground/40"}`} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${worker.isAvailable ? "text-green-400" : "text-muted-foreground"}`}>
                {worker.isAvailable ? "Disponible para trabajar" : "No disponible ahora"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {worker.isAvailable ? "Los clientes pueden contactarte" : "Volverá pronto"}
              </p>
            </div>
          </div>

          {/* Stats: Calificación / Conversaciones / Cumplimiento */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/30 border border-border/30">
              <Star className="w-5 h-5 text-primary" />
              <span className="text-sm font-black text-foreground">
                {worker.rating ? worker.rating.toFixed(1) : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">Calificación</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/30 border border-border/30">
              <MessageSquare className="w-5 h-5 text-primary" />
              <span className="text-sm font-black text-foreground">{worker.totalReviews ?? 0}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">Reseñas</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/30 border border-border/30">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span className="text-sm font-black text-foreground">{cumplimiento}%</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">Cumplimiento</span>
            </div>
          </div>

          {/* Miembro desde / área de servicio */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>En Fixgo desde {memberSince}</span>
            </div>
            {(worker as any).serviceRadius && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span>Área de servicio: <span className="font-semibold text-foreground">{(worker as any).serviceRadius} km</span></span>
              </div>
            )}
          </div>


          {/* Tarifa de visita técnica — siempre visible */}
          {(worker as any).visitFee != null && (worker as any).visitFee > 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-3">
              <Home className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-0.5">Tarifa de domicilio</p>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Este experto cobra{" "}
                  <span className="font-bold text-amber-300">
                    ${Number((worker as any).visitFee).toLocaleString("es-CL")}
                  </span>{" "}
                  por visita técnica si el trabajo no es como acordado o no llegan a un acuerdo en el precio final.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-green-500/20 bg-green-500/5 px-3.5 py-3">
              <Home className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-green-300 mb-0.5">Sin cargo por domicilio</p>
                <p className="text-xs text-green-200/70 leading-relaxed">
                  Este experto no cobra tarifa adicional por visita técnica a domicilio.
                </p>
              </div>
            </div>
          )}

          {/* Bio */}
          {worker.bio && (
            <p className="text-sm leading-relaxed text-foreground/80 border-t border-border/30 pt-3">{worker.bio}</p>
          )}

          {/* Conectar (si no viene desde propuesta) */}
          {isClient && !hasServiceContext && (
            <Button
              className="w-full fixgo-gradient font-bold text-white rounded-xl gap-2"
              onClick={() => setDirectChatOpen(true)}
            >
              <MessageSquare className="w-4 h-4" />
              Conectar con Profesional
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── VIDEO DE PRESENTACIÓN ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            Video de Presentación
            <span className="text-xs text-muted-foreground font-normal ml-1">máx. 10 seg · 50 MB</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(worker as any).presentationVideoUrl ? (
            <div className="rounded-xl overflow-hidden bg-black aspect-video">
              <video
                src={(worker as any).presentationVideoUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="border-2 border-dashed border-border/50 rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Video className="w-8 h-8 opacity-30" />
              <p className="text-xs">Este experto aún no ha subido su video</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── PORTFOLIO DE TRABAJOS ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            Portfolio de Trabajos
          </CardTitle>
          <p className="text-xs text-muted-foreground">Fotos de trabajos anteriores</p>
        </CardHeader>
        <CardContent className="pt-0">
          {portfolio.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {portfolio.map((img: any) => (
                <a key={img.id} href={img.imageUrl} target="_blank" rel="noopener noreferrer"
                  className="relative aspect-square rounded-xl overflow-hidden border border-border/40 bg-muted hover:opacity-90 transition-opacity group">
                  <img src={img.imageUrl} alt={img.caption || "Portfolio"} className="w-full h-full object-cover" />
                  {img.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs truncate">{img.caption}</p>
                    </div>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-border/50 rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="w-8 h-8 opacity-30" />
              <p className="text-xs">Este experto aún no ha añadido fotos</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CERTIFICACIONES PROFESIONALES ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Certificaciones Profesionales
          </CardTitle>
          <p className="text-xs text-muted-foreground">Licencias y certificados verificados por Fixgo</p>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {certifications.length > 0 ? (
            certifications.map((cert: any) => (
              <div key={cert.id} className="flex items-center gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{cert.name}</p>
                  {cert.issuer && <p className="text-xs text-muted-foreground truncate">{cert.issuer}</p>}
                </div>
                <a href={cert.imageUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary font-semibold hover:underline shrink-0">Ver</a>
              </div>
            ))
          ) : (
            <div className="border-2 border-dashed border-border/50 rounded-xl py-6 flex flex-col items-center gap-2 text-muted-foreground">
              <ShieldCheck className="w-7 h-7 opacity-30" />
              <p className="text-xs">Sin certificaciones verificadas aún</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── VALORACIONES ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Star className="w-4 h-4 text-primary" />
            Valoraciones
            <Badge variant="secondary" className="ml-auto text-xs font-normal">{reviewList.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {reviewsLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : reviewList.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Star className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Aún sin valoraciones</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewList.map((review: any, i: number) => (
                <div key={review.id}>
                  {i > 0 && <Separator className="mb-4" />}
                  <div className="flex items-start gap-3">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {review.client?.name?.substring(0, 2).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm">{review.client?.name || "Cliente"}</span>
                          {review.recommends === true && (
                            <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">👍</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(review.createdAt), "d MMM yyyy", { locale: es })}
                        </span>
                      </div>
                      <StarRating rating={review.rating} />
                      {review.comment && (
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{review.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── DEJAR RESEÑA (solo clientes con servicio completado sin reseñar) ── */}
      {user?.role === "client" && !reviewSubmitted && reviewableData?.reviewable && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              Deja tu reseña
            </CardTitle>
            <p className="text-xs text-muted-foreground">Comparte tu experiencia con este profesional</p>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* Estrellas interactivas */}
            <div className="flex gap-1.5 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="transition-transform hover:scale-110 active:scale-95"
                  onMouseEnter={() => setReviewHover(star)}
                  onMouseLeave={() => setReviewHover(0)}
                  onClick={() => setReviewRating(star)}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (reviewHover || reviewRating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-border"
                    }`}
                  />
                </button>
              ))}
            </div>
            {reviewRating > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {["", "Muy mala experiencia", "Mala experiencia", "Regular", "Buena experiencia", "¡Excelente experiencia!"][reviewRating]}
              </p>
            )}
            {/* Comentario */}
            <textarea
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={3}
              placeholder="Cuéntanos sobre tu experiencia (opcional)..."
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              maxLength={500}
            />
            <Button
              className="w-full fixgo-gradient font-bold text-white"
              onClick={handleSubmitReview}
              disabled={reviewRating === 0 || createReviewMutation.isPending}
            >
              {createReviewMutation.isPending ? "Enviando..." : "Enviar reseña"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirmación post-reseña */}
      {user?.role === "client" && reviewSubmitted && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">¡Reseña enviada!</p>
              <p className="text-xs text-muted-foreground">Gracias por compartir tu experiencia.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ya reseñado (misma sesión no, pero lo vio antes) */}
      {user?.role === "client" && !reviewSubmitted && reviewableData?.alreadyReviewed && (
        <Card className="border-border/30">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Star className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-xs text-muted-foreground">Ya enviaste una reseña para este profesional.</p>
          </CardContent>
        </Card>
      )}

      {/* Botón contactar al final (sin contexto de servicio) */}
      {isClient && !hasServiceContext && (
        <Button
              className="w-full fixgo-gradient font-bold text-white rounded-xl gap-2"
          onClick={() => setDirectChatOpen(true)}
        >
          <MessageSquare className="w-4 h-4" />
          Contactar Profesional
        </Button>
      )}

      {/* Panel CTA flotante — desde radar.
          En móvil el bottom nav (h-16, fixed bottom-0 z-50) taparía esta barra:
          levantarla justo encima del nav. En desktop (lg) no hay bottom nav. */}
      {hasServiceContext && (
        <div className="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/50 shadow-2xl px-4 py-3">
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Tu solicitud activa</p>
              <p className="text-sm font-bold text-foreground truncate">{serviceTitle || "Servicio"}</p>
            </div>
            {["accepted", "in_progress"].includes((serviceData as any)?.status) && (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 rounded-xl shrink-0"
                onClick={() => setCancelOpen(true)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                <span className="ml-1.5 text-xs font-semibold">Cancelar</span>
              </Button>
            )}
            <Button onClick={() => setChatOpen(true)} className="fixgo-gradient font-bold text-white shrink-0 gap-1.5" size="sm">
              <MessageSquare className="w-4 h-4" />
              Abrir Chat
            </Button>
          </div>
        </div>
      )}

      {/* Diálogo de confirmación de cancelación */}
      {hasServiceContext && (
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar este trabajo?</AlertDialogTitle>
              <AlertDialogDescription>
                {(serviceData as any)?.freeCancelUntil && new Date((serviceData as any).freeCancelUntil) > new Date()
                  ? "Estás dentro del tiempo de cancelación gratis. Puedes cancelar ahora sin costo."
                  : <>Ya elegiste a este experto y el tiempo de cancelación gratis terminó. Si cancelas ahora, deberás transferirle su tarifa de visita técnica{(serviceData as any)?.worker?.visitFee ? <> de <strong>${Number((serviceData as any).worker.visitFee).toLocaleString("es-CL")}</strong></> : null} dentro de 24 horas.</>
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Mantener el trabajo</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={async () => {
                  if (!fromService) return;
                  try {
                    await cancelMutation.mutateAsync({ id: parseInt(fromService) });
                    toast.success("Trabajo cancelado");
                    navigate("/mis-trabajos");
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error || e?.message || "Error al cancelar");
                  }
                }}
              >
                {cancelMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Sí, cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Chat directo con el profesional */}
      {!!workerId && (
        <DirectChatSheet
          open={directChatOpen}
          onOpenChange={setDirectChatOpen}
          otherUserId={workerId}
          otherUserName={(worker as any)?.name || "Profesional"}
          otherUserAvatar={(worker as any)?.avatarUrl}
        />
      )}

      {/* Chat desde propuesta */}
      {hasServiceContext && !!workerId && (
        <ProposalChatSheet
          open={chatOpen}
          onOpenChange={setChatOpen}
          serviceId={parseInt(fromService!)}
          workerId={workerId}
          workerName={(worker as any)?.name || "Especialista"}
          workerAvatar={(worker as any)?.avatarUrl}
          otherUserId={workerId}
          proposalId={proposalIdParam ? parseInt(proposalIdParam) : undefined}
          budgetNote={(serviceData as any)?.budgetNote || null}
          requestQuote={!!(serviceData as any)?.requestQuote}
          isPending={!!proposalIdParam}
          onAccept={proposalIdParam ? handleAcceptFromProfile : undefined}
          accepting={acceptMutation.isPending}
          iAmClient={true}
          serviceStatus={(serviceData as any)?.status ?? null}
          paymentMethod={(serviceData as any)?.paymentMethod ?? null}
          freeCancelUntil={(serviceData as any)?.freeCancelUntil ?? null}
          clientAddress={(serviceData as any)?.address || null}
          clientLat={typeof (serviceData as any)?.lat === "number" ? (serviceData as any).lat : null}
          clientLng={typeof (serviceData as any)?.lng === "number" ? (serviceData as any).lng : null}
        />
      )}
    </div>
  );
}
