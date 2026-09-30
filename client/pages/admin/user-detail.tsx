import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { getListUsersQueryKey } from "@/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Star, Mail, Phone, MapPin, Calendar, ShieldCheck, CreditCard, Loader2, Trash2, Lock, Unlock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AdminBlockDialog, type AdminBlockTarget } from "@/components/admin-block-dialog";

interface CurrentSubscription {
  id: number;
  planCode: string;
  status: string;
  interval: string;
  currentPeriodEnd: string | null;
}

interface UserDetailResponse {
  user: any;
  stats: {
    servicesAsClient: number;
    servicesAsWorker: number;
    completedAsClient: number;
    completedAsWorker: number;
    avgRating: number;
    totalReviews: number;
  };
  currentSubscription: CurrentSubscription | null;
  servicesAsClient: any[];
  servicesAsWorker: any[];
  reviewsReceived: any[];
  reviewsGiven: any[];
  paymentsAsClient: any[];
  paymentsAsWorker: any[];
  balanceTransactions: any[];
  manualPhoneVerification: {
    id: number;
    phone: string;
    reason: string;
    method: string;
    createdAt: string;
    adminId: number | null;
    adminName: string | null;
  } | null;
  blockHistory: Array<{
    id: number;
    duration: string;
    durationLabel: string;
    blockedAt: string;
    blockedUntil: string | null;
    endedAt: string | null;
    endReason: string | null;
    blockedByAdminId: number | null;
    blockedByAdminName: string | null;
    unblockedByAdminId: number | null;
    unblockedByAdminName: string | null;
  }>;
}


const statusLabels: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

const serviceStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
  rejected: "Rechazado",
};

const formatCLP = (n: number) => `$${Math.round(n || 0).toLocaleString("es-CL")}`;
const formatDate = (d: string) => format(new Date(d), "d 'de' MMM yyyy, HH:mm", { locale: es });

export default function AdminUserDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const id = parseInt(params.id);
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [selectedInterval, setSelectedInterval] = useState("monthly");
  const [selectedDays, setSelectedDays] = useState("30");
  const [grantingPlan, setGrantingPlan] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState("client");
  const [editKycStatus, setEditKycStatus] = useState("not_submitted");
  const [editEmailVerified, setEditEmailVerified] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [manualVerifyOpen, setManualVerifyOpen] = useState(false);
  const [manualReason, setManualReason] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [blockTarget, setBlockTarget] = useState<AdminBlockTarget | null>(null);

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          kycStatus: editKycStatus,
          emailVerified: editEmailVerified,
        }),
      });
      const json = await r.json();
      if (!r.ok) { toast.error(json.error ?? "Error al guardar"); return; }
      toast.success("Usuario actualizado correctamente");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      await reload();
    } catch {
      toast.error("Error al guardar los cambios");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleManualPhoneVerify = async () => {
    if (!data?.user.phone) {
      toast.error("El usuario no tiene un teléfono registrado");
      return;
    }
    if (manualReason.trim().length < 10) {
      toast.error("Escribe una razón de al menos 10 caracteres");
      return;
    }
    if (!manualConfirmed) {
      toast.error("Confirma que verificaste el control del número");
      return;
    }

    setVerifyingPhone(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const r = await fetch(`/api/admin/users/${id}/phone-verify-manual`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: manualReason.trim(), confirmed: true }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(json.message ?? json.error ?? "No se pudo verificar el teléfono");
        return;
      }
      toast.success(json.alreadyVerified ? "El teléfono ya estaba verificado" : "Teléfono verificado manualmente");
      setManualVerifyOpen(false);
      setManualReason("");
      setManualConfirmed(false);
      await reload();
    } catch {
      toast.error("Error de conexión al verificar el teléfono");
    } finally {
      setVerifyingPhone(false);
    }
  };

  const loadPlans = async () => {
    try {
      const token = localStorage.getItem("fixgo_token");
      const r = await fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      setPlans(Array.isArray(j) ? j : []);
    } catch {
      toast.error("Error al cargar los planes");
    }
  };

  const handleGrantPlan = async () => {
    if (!selectedPlanCode) { toast.error("Selecciona un plan"); return; }
    setGrantingPlan(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const r = await fetch("/api/admin/subscriptions/grant", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, planCode: selectedPlanCode, interval: selectedInterval, days: parseInt(selectedDays) || 30 }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Error al asignar plan"); }
      toast.success("Plan actualizado correctamente");
      setChangePlanOpen(false);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Error al cambiar el plan");
    } finally {
      setGrantingPlan(false);
    }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const r = await fetch(`/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("No se pudo cargar el usuario");
      const j = await r.json();
      setData(j);
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!isNaN(id)) reload(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (data?.user) {
      setEditRole(data.user.role);
      setEditKycStatus(data.user.kycStatus || "not_submitted");
      setEditEmailVerified(!!data.user.emailVerified);
    }
  }, [data?.user]);

  const handleUnblock = async () => {
    try {
      const token = localStorage.getItem("fixgo_token") || localStorage.getItem("fixxer_token");
      const response = await fetch(`/api/admin/users/${id}/unblock`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo desbloquear la cuenta");
      toast.success("Cuenta desbloqueada");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo desbloquear la cuenta");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (!r.ok) { toast.error(json.error ?? "Error al eliminar"); return; }
      toast.success("Cuenta eliminada correctamente");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setLocation("/admin/users");
    } catch {
      toast.error("Error al eliminar la cuenta");
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="container px-4 py-8 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { user, stats } = data;
  const isWorker = user.role === "worker";
  const isBlocked = user.status === "blocked";

  return (
    <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/users")} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Volver
        </Button>
        {user.role !== "admin" && (
          <div className="flex gap-2 flex-wrap">
            {/* Editar rol / KYC / verificación */}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <ShieldCheck className="w-4 h-4" /> Editar
            </Button>

            {/* Bloquear / Reactivar */}
            {isBlocked ? (
              <Button size="sm" variant="default" onClick={() => void handleUnblock()} className="gap-1.5">
                <Unlock className="w-4 h-4" /> Desbloquear
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBlockTarget({ id: user.id, name: user.name })}>
                <Lock className="w-4 h-4" /> Bloquear
              </Button>
            )}

            {/* Eliminar cuenta */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5 border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300">
                  <Trash2 className="w-4 h-4" /> Eliminar cuenta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar la cuenta de {user.name}?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>Esta acción es <strong className="text-foreground">permanente e irreversible</strong>.</p>
                      <p>Se eliminarán <strong className="text-foreground">todos</strong> los datos de esta cuenta: servicios, conversaciones, mensajes, reseñas, propuestas, pagos y cualquier otro registro asociado.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-700 hover:bg-red-600 text-white"
                  >
                    {deleting ? "Eliminando..." : "Sí, eliminar cuenta"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback className="text-xl">{user.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
                <Badge variant={user.status === "active" ? "default" : user.status === "blocked" ? "destructive" : "secondary"} className={user.status === "active" ? "bg-green-500" : ""}>
                  {statusLabels[user.status] || user.status}
                </Badge>
                <Badge variant="outline" className="capitalize">{user.role === "worker" ? "Fixgo" : user.role === "client" ? "Usuario" : "Admin"}</Badge>
                {user.kycStatus && (
                  <Badge variant={user.kycStatus === "verified" ? "default" : "outline"} className={user.kycStatus === "verified" ? "bg-blue-500" : ""}>
                    KYC: {user.kycStatus}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {user.email}</div>
                {user.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {user.phone}</div>}
                {user.address && <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {user.address}</div>}
                <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Registrado {format(new Date(user.createdAt), "d MMM yyyy", { locale: es })}</div>
                {user.rut && <div className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> RUT: {user.rut}</div>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {user.role !== "admin" && (
        <Card className={user.phoneVerified ? "border-green-500/30" : "border-amber-500/30"}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4 text-primary" />
                Verificación de teléfono
              </CardTitle>
              <Badge
                variant={user.phoneVerified ? "default" : "outline"}
                className={user.phoneVerified ? "bg-green-600" : "border-amber-500/50 text-amber-500"}
              >
                {user.phoneVerified ? "Verificado" : "Pendiente"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {user.phone ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">{user.phone}</p>
                  {user.phoneVerified ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      Verificado el {user.phoneVerifiedAt ? formatDate(user.phoneVerifiedAt) : "sin fecha registrada"}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      El usuario aún no ha completado la verificación por SMS.
                    </p>
                  )}
                </div>
                {!user.phoneVerified && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                    onClick={() => setManualVerifyOpen(true)}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Verificar manualmente
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">El usuario no tiene un teléfono registrado.</p>
            )}

            {data.manualPhoneVerification && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                <p className="font-semibold text-foreground">Última verificación manual</p>
                <p className="mt-1 text-muted-foreground">
                  {data.manualPhoneVerification.adminName || `Administrador #${data.manualPhoneVerification.adminId ?? "desconocido"}`} ·{" "}
                  {formatDate(data.manualPhoneVerification.createdAt)}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Motivo: <span className="text-foreground">{data.manualPhoneVerification.reason}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data.blockHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-destructive" /> Historial de bloqueos administrativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.blockHistory.map((block) => (
              <div key={block.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={block.endedAt ? "secondary" : "destructive"}>
                    {block.endedAt ? "Finalizado" : "Activo"}
                  </Badge>
                  <span className="font-medium">{block.durationLabel}</span>
                </div>
                <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                  <span>Inicio: <strong className="font-medium text-foreground">{formatDate(block.blockedAt)}</strong></span>
                  <span>Término automático: <strong className="font-medium text-foreground">{block.blockedUntil ? formatDate(block.blockedUntil) : "Sin fecha de término"}</strong></span>
                  <span>Aplicado por: <strong className="font-medium text-foreground">{block.blockedByAdminName || (block.blockedByAdminId ? `Administrador #${block.blockedByAdminId}` : "Registro anterior")}</strong></span>
                  {block.endedAt && (
                    <span>{block.endReason === "expired" ? "Terminó automáticamente" : "Desbloqueado el"}: <strong className="font-medium text-foreground">{formatDate(block.endedAt)}</strong></span>
                  )}
                  {block.endReason === "manual" && (
                    <span>Desbloqueado por: <strong className="font-medium text-foreground">{block.unblockedByAdminName || (block.unblockedByAdminId ? `Administrador #${block.unblockedByAdminId}` : "Administrador")}</strong></span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isWorker && (
          <>
            <StatCard label="Trabajos como Fixgo" value={stats.servicesAsWorker} sub={`${stats.completedAsWorker} completados`} />
            <StatCard label="Calificación" value={stats.avgRating.toFixed(2)} sub={`${stats.totalReviews} valoraciones`} icon={<Star className="w-4 h-4 text-amber-400" />} />
            <StatCard label="Solicitudes" value={stats.servicesAsClient} sub={`${stats.completedAsClient} completadas`} />
            <StatCard label="Estado KYC" value={user.kycStatus || "—"} />
          </>
        )}
        {!isWorker && (
          <>
            <StatCard label="Solicitudes creadas" value={stats.servicesAsClient} sub={`${stats.completedAsClient} completadas`} />
            <StatCard label="Reseñas dadas" value={data.reviewsGiven.length} />
            <StatCard label="Conversaciones" value={data.servicesAsClient.length} sub="Total" />
            <StatCard label="Estado KYC" value={user.kycStatus || "—"} />
          </>
        )}
      </div>

      {/* Plan del usuario */}
      {user.role !== "admin" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Plan de Suscripción
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/40 hover:bg-primary/10 text-xs"
                onClick={() => { loadPlans(); setSelectedPlanCode(data.currentSubscription?.planCode || ""); setChangePlanOpen(true); }}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Cambiar Plan
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {data.currentSubscription ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge className="bg-primary text-primary-foreground font-mono text-sm px-3 py-1">
                  {data.currentSubscription.planCode}
                </Badge>
                <Badge variant={data.currentSubscription.status === "active" ? "default" : "secondary"} className={data.currentSubscription.status === "active" ? "bg-green-500" : ""}>
                  {data.currentSubscription.status === "active" ? "Activo" : data.currentSubscription.status === "expired" ? "Expirado" : data.currentSubscription.status}
                </Badge>
                <span className="text-muted-foreground">
                  Intervalo: <span className="text-foreground font-medium">{data.currentSubscription.interval === "monthly" ? "Mensual" : data.currentSubscription.interval === "annual" ? "Anual" : data.currentSubscription.interval}</span>
                </span>
                {data.currentSubscription.currentPeriodEnd && (
                  <span className="text-muted-foreground">
                    Vence: <span className="text-foreground font-medium">{format(new Date(data.currentSubscription.currentPeriodEnd), "d MMM yyyy", { locale: es })}</span>
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin suscripción activa registrada.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar Plan de {user.name}</DialogTitle>
            <DialogDescription>
              El plan actual se marcará como expirado y se asignará el nuevo plan de inmediato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nuevo plan</Label>
              <Select value={selectedPlanCode} onValueChange={setSelectedPlanCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name} — {p.code} {p.priceClp > 0 ? `($${p.priceClp.toLocaleString("es-CL")}/mes)` : "(Gratis)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Intervalo</Label>
                <Select value={selectedInterval} onValueChange={setSelectedInterval}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Días de vigencia</Label>
                <Input
                  type="number"
                  min="1"
                  max="3650"
                  value={selectedDays}
                  onChange={e => setSelectedDays(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanOpen(false)} disabled={grantingPlan}>
              Cancelar
            </Button>
            <Button onClick={handleGrantPlan} disabled={grantingPlan || !selectedPlanCode} className="fixgo-gradient text-white font-bold">
              {grantingPlan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
              Confirmar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar a {user.name}</DialogTitle>
            <DialogDescription>
              Cambia el rol, el estado del KYC o la verificación del correo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Usuario</SelectItem>
                  <SelectItem value="worker">Fixgo</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado KYC</Label>
              <Select value={editKycStatus} onValueChange={setEditKycStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_submitted">not_submitted</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="approved">approved</SelectItem>
                  <SelectItem value="rejected">rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <Label htmlFor="edit-email-verified" className="cursor-pointer">Correo verificado</Label>
              <input
                id="edit-email-verified"
                type="checkbox"
                checked={editEmailVerified}
                onChange={e => setEditEmailVerified(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="fixgo-gradient text-white font-bold">
              {savingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manualVerifyOpen}
        onOpenChange={(open) => {
          setManualVerifyOpen(open);
          if (!open && !verifyingPhone) {
            setManualReason("");
            setManualConfirmed(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verificar teléfono manualmente</DialogTitle>
            <DialogDescription>
              Esta acción omitirá la validación por SMS y quedará registrada con tu usuario de administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-start gap-2 text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Confirma que verificaste por otro medio que <strong>{user.phone}</strong> pertenece a esta persona.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-phone-reason">Motivo de la verificación</Label>
              <Textarea
                id="manual-phone-reason"
                value={manualReason}
                onChange={(event) => setManualReason(event.target.value)}
                placeholder="Ej: SMS no recibido; se confirmó el control del número mediante llamada."
                maxLength={500}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 10 caracteres. Este motivo quedará guardado en la auditoría.
              </p>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={manualConfirmed}
                onChange={(event) => setManualConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                Confirmo que revisé la identidad de la persona y que controla este número telefónico.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualVerifyOpen(false)} disabled={verifyingPhone}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleManualPhoneVerify()}
              disabled={verifyingPhone || manualReason.trim().length < 10 || !manualConfirmed}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {verifyingPhone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {verifyingPhone ? "Verificando…" : "Confirmar verificación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminBlockDialog
        target={blockTarget}
        open={!!blockTarget}
        onOpenChange={(open) => { if (!open) setBlockTarget(null); }}
        onSuccess={() => {
          setBlockTarget(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          void reload();
        }}
      />

      {/* Tabs */}
      <Tabs defaultValue={isWorker ? "worker-services" : "client-services"} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          {isWorker && <TabsTrigger value="worker-services">Como Fixgo ({data.servicesAsWorker.length})</TabsTrigger>}
          <TabsTrigger value="client-services">Solicitudes ({data.servicesAsClient.length})</TabsTrigger>
          {isWorker && <TabsTrigger value="reviews-received">Valoraciones ({data.reviewsReceived.length})</TabsTrigger>}
          <TabsTrigger value="reviews-given">Reseñas dadas ({data.reviewsGiven.length})</TabsTrigger>
        </TabsList>

        {isWorker && (
          <TabsContent value="worker-services" className="mt-4">
            <ServiceList items={data.servicesAsWorker} />
          </TabsContent>
        )}

        <TabsContent value="client-services" className="mt-4">
          <ServiceList items={data.servicesAsClient} />
        </TabsContent>

        {isWorker && (
          <TabsContent value="reviews-received" className="mt-4">
            <ReviewList items={data.reviewsReceived} authorLabel="Cliente" />
          </TabsContent>
        )}

        <TabsContent value="reviews-given" className="mt-4">
          <ReviewList items={data.reviewsGiven.map(r => ({ ...r, authorName: r.targetName }))} authorLabel="Para" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: any; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent></Card>;
}

function ServiceList({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty text="Sin servicios registrados." />;
  return (
    <Card><CardContent className="p-0">
      <div className="divide-y divide-border">
        {items.map(s => (
          <Link key={s.id} href={`/services/${s.id}`}>
            <div className="px-4 py-3 hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">{serviceStatusLabels[s.status] || s.status}</Badge>
                <span className="text-sm font-semibold">{formatCLP(s.finalPrice ?? s.estimatedPrice ?? 0)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </CardContent></Card>
  );
}

function ReviewList({ items, authorLabel }: { items: any[]; authorLabel: string }) {
  if (items.length === 0) return <Empty text="Sin reseñas." />;
  return (
    <Card><CardContent className="p-0">
      <div className="divide-y divide-border">
        {items.map(r => (
          <div key={r.id} className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{authorLabel}:</span>
                <span className="text-sm font-medium">{r.authorName || `Usuario #${r.authorId || r.targetId}`}</span>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i < (r.rating || 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                ))}
              </div>
            </div>
            {r.comment && <p className="text-sm text-foreground/80">{r.comment}</p>}
            <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)} · <Link href={`/services/${r.serviceId}`} className="underline">Ver servicio</Link></p>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

