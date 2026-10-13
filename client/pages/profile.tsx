import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentPosition } from "@/lib/geolocation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser, useUpdateWorkerAvailability, useListCategories } from "@/api";
import { uploadFileToStorage } from "@/lib/storage";
import PhotoPicker from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Camera, Star, Check, CheckCircle2, Shield, ChevronRight, Bell, Wrench, ImagePlus, X, ShieldCheck, MapPin, Upload, Zap, User as UserIcon, ArrowLeftRight, Crown } from "lucide-react";
import SupportCenter from "@/components/support-center";
import { getCategoryStyle } from "@/lib/category-icons";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@/api";
import { Link, useLocation } from "wouter";
import { useSubscription } from "@/hooks/use-subscription";

const roleLabels: Record<string, string> = {
  client: "Usuario",
  worker: "Fixgo",
  admin: "Administrador",
};

function SwitchRoleButton({
  isRoleSwitched,
  originalRole,
  isWorker,
  isClient,
  isAdmin,
  switchRole,
}: {
  isRoleSwitched: boolean;
  originalRole: string | null;
  isWorker: boolean;
  isClient: boolean;
  isAdmin: boolean;
  switchRole: (role: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handle = async (targetRole: string) => {
    setLoading(true);
    try {
      await switchRole(targetRole);
    } catch (e: any) {
      toast.error(e?.message || "Error al cambiar rol");
    } finally {
      setLoading(false);
    }
  };

  if (isRoleSwitched && originalRole) {
    const label = originalRole === "admin"
      ? "Cambiar a Admin"
      : originalRole === "worker"
      ? "Cambiar a Experto"
      : "Cambiar a Usuario";
    return (
      <button
        onClick={() => handle(originalRole)}
        disabled={loading}
        className="mt-2 flex items-center gap-2 text-xs font-semibold text-orange-400 border-2 border-orange-500/50 bg-orange-500/10 px-4 py-2 rounded-2xl active:bg-orange-500/20 transition-all shadow-sm disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
        {label}
      </button>
    );
  }

  if (isWorker) {
    return (
      <button
        onClick={() => handle("client")}
        disabled={loading}
        className="mt-2 flex items-center gap-2 text-xs font-semibold text-primary border-2 border-primary/50 bg-primary/10 px-4 py-2 rounded-2xl active:bg-primary/20 transition-all shadow-sm disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
        Cambiar a Usuario
      </button>
    );
  }

  if (isClient) {
    return (
      <button
        onClick={() => handle("worker")}
        disabled={loading}
        className="mt-2 flex items-center gap-2 text-xs font-semibold text-primary border-2 border-primary/50 bg-primary/10 px-4 py-2 rounded-2xl active:bg-primary/20 transition-all shadow-sm disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
        Cambiar a Experto
      </button>
    );
  }

  if (isAdmin) {
    return (
      <div className="mt-2 flex gap-2 flex-wrap">
        <button
          onClick={() => handle("worker")}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-medium text-primary border border-primary/30 bg-primary/5 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeftRight className="w-3 h-3" />}
          Ver como Experto
        </button>
        <button
          onClick={() => handle("client")}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground border border-border/50 bg-muted/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeftRight className="w-3 h-3" />}
          Ver como Usuario
        </button>
      </div>
    );
  }

  return null;
}

const profileSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  bio: z.string().optional().nullable(),
  skills: z.string().optional().nullable(),
  visitFee: z.string().optional().nullable(),
  // Datos de transferencia del experto (para el cobro de la visita técnica
  // por cancelación tardía — pago directo entre usuarios, fuera de la app)
  payoutBankName: z.string().optional().nullable(),
  payoutBankAccountType: z.string().optional().nullable(),
  payoutBankAccountNumber: z.string().optional().nullable(),
  payoutBankRut: z.string().optional().nullable(),
  payoutDataConsent: z.boolean().default(false),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function Profile() {
  const { user, isLoading: authLoading, isWorker, isAdmin, isClient, switchRole, isRoleSwitched, originalRole } = useAuth();
  const isRestrictedAccount = user?.status === "blocked"
    || (!!(user as any)?.suspendedUntil && new Date((user as any).suspendedUntil).getTime() > Date.now());
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login?redirect=/profile");
    }
  }, [authLoading, user, setLocation]);
  const queryClient = useQueryClient();
  const { limit: subLimit, isProPlus, isActive: subscriptionActive } = useSubscription();
  const canSelectAllCategories = subscriptionActive && isProPlus;
  const updateMutation = useUpdateUser();
  const availabilityMutation = useUpdateWorkerAvailability();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [serviceRadius, setServiceRadius] = useState(10);
  const [savingRadius, setSavingRadius] = useState(false);
  const [alertRadiusKm, setAlertRadiusKm] = useState<number | null>(null);
  const [savingAlertRadius, setSavingAlertRadius] = useState(false);

  // Worker profession categories
  const { data: allCategories } = useListCategories({ query: { staleTime: 30 * 60_000 } } as any);
  const [workerCategoryIds, setWorkerCategoryIds] = useState<number[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] = useState<number | null>(null);
  const [savingCategories, setSavingCategories] = useState(false);
  const [focusedCategoryId, setFocusedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (!isWorker || isRestrictedAccount || !user?.id) return;
    const token = localStorage.getItem("fixgo_token");
    fetch(`/api/workers/${user.id}/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((rows: { categoryId: number; isPrimary: boolean }[]) => {
        if (!Array.isArray(rows) || rows.length === 0) {
          const primary = (user as any).categoryId;
          if (primary) { setWorkerCategoryIds([primary]); setPrimaryCategoryId(primary); }
          return;
        }
        setWorkerCategoryIds(rows.map(r => r.categoryId));
        const prim = rows.find(r => r.isPrimary);
        setPrimaryCategoryId(prim?.categoryId ?? rows[0]?.categoryId ?? null);
      })
      .catch(() => {});
  }, [isWorker, isRestrictedAccount, user?.id, (user as any)?.categoryId]);

  const focusCategory = (catId: number) => {
    setFocusedCategoryId(catId);
  };

  const addCategory = (catId: number) => {
    const maxCats = subLimit("categories");
    setWorkerCategoryIds(prev => {
      if (prev.includes(catId)) return prev;
      if (prev.length >= maxCats) {
        toast.error(
          maxCats === 1
            ? "Tu plan solo permite 1 categoría. Mejora tu plan para agregar más."
            : `Tu plan permite hasta ${maxCats} categorías. Mejora tu plan para agregar más.`,
          { action: { label: "Ver planes", onClick: () => window.location.href = "/planes" } }
        );
        return prev;
      }
      return [...prev, catId];
    });
  };

  const removeCategory = (catId: number) => {
    const next = workerCategoryIds.filter(id => id !== catId);
    setWorkerCategoryIds(next);
    if (primaryCategoryId === catId) setPrimaryCategoryId(next[0] ?? null);
  };

  const saveCategories = async () => {
    if (workerCategoryIds.length === 0) { toast.error("Selecciona al menos una profesión"); return; }
    if (!canSelectAllCategories && workerCategoryIds.length > subLimit("categories")) {
      const maxCats = subLimit("categories");
      toast.error(
        maxCats === 1
          ? "Tu plan solo permite 1 categoría. Mejora tu plan para agregar más."
          : `Tu plan permite hasta ${maxCats} categorías. Mejora tu plan para agregar más.`,
        { action: { label: "Ver planes", onClick: () => window.location.href = "/planes" } }
      );
      return;
    }
    const effectivePrimary = primaryCategoryId ?? workerCategoryIds[0];
    setSavingCategories(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/workers/${user!.id}/categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categoryIds: workerCategoryIds, primaryCategoryId: effectivePrimary }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success("Profesiones actualizadas");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar profesiones");
    } finally {
      setSavingCategories(false);
    }
  };

  // Datos bancarios enmascarados: se muestran •••• + últimos 4 hasta tocar "Ver completo"
  const [revealedBank, setRevealedBank] = useState<Record<string, boolean>>({});

  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [portfolioCaption, setPortfolioCaption] = useState("");

  const [certifications, setCertifications] = useState<any[]>([]);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certName, setCertName] = useState("");
  const [certIssuer, setCertIssuer] = useState("");

  const fetchPortfolio = useCallback(async () => {
    if (!user?.id) return;
    const token = localStorage.getItem("fixgo_token");
    const res = await fetch(`/api/portfolio/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setPortfolio(Array.isArray(data) ? data : []);
  }, [user?.id]);

  const fetchCertifications = useCallback(async () => {
    if (!user?.id) return;
    const token = localStorage.getItem("fixgo_token");
    const res = await fetch(`/api/certifications/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setCertifications(Array.isArray(data) ? data : []);
  }, [user?.id]);

  useEffect(() => {
    if (isWorker && user?.id) {
      fetchPortfolio();
      fetchCertifications();
    }
  }, [isWorker, user?.id, fetchPortfolio, fetchCertifications]);

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty, dirtyFields } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
  });
  const dirtyFieldCount = Object.keys(dirtyFields).length;
  const visitFeeInput = watch("visitFee") ?? "";
  const visitFeeInputAmount = Number.parseInt(visitFeeInput.replace(/\D/g, ""), 10);
  const visitFeeInputComplete = Number.isFinite(visitFeeInputAmount) && visitFeeInputAmount > 0;
  const payoutFormComplete = [
    watch("payoutBankName"),
    watch("payoutBankAccountType"),
    watch("payoutBankAccountNumber"),
    watch("payoutBankRut"),
  ].every((value) => typeof value === "string" && value.trim().length > 0);
  const savedVisitFeeComplete = Number((user as any)?.visitFee) > 0;
  const savedPayoutComplete = [
    (user as any)?.payoutBankName,
    (user as any)?.payoutBankAccountType,
    (user as any)?.payoutBankAccountNumber,
    (user as any)?.payoutBankRut,
  ].every((value) => typeof value === "string" && value.trim().length > 0);

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        bio: user.bio,
        skills: user.skills,
        visitFee: (user as any).visitFee != null ? String((user as any).visitFee) : "",
        payoutBankName: (user as any).payoutBankName ?? "",
        payoutBankAccountType: (user as any).payoutBankAccountType ?? "",
        payoutBankAccountNumber: (user as any).payoutBankAccountNumber ?? "",
        payoutBankRut: (user as any).payoutBankRut ?? "",
        payoutDataConsent: (user as any).payoutDataConsent ?? false,
      }, { keepDirtyValues: true });
      const r = (user as any).serviceRadius;
      if (r) setServiceRadius(Math.min(50, Math.max(1, r)));
      const ar = (user as any).alertRadiusKm;
      setAlertRadiusKm(ar != null ? ar : null);
    }
  }, [user, reset]);

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5MB");
      return;
    }
    setUploadingAvatar(true);
    try {
      const objectPath = await uploadFileToStorage(file);
      const avatarUrl = `/api/storage/objects/${objectPath}`;
      await updateMutation.mutateAsync({
        id: user!.id,
        data: { avatarUrl },
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success("Foto de perfil actualizada");
    } catch {
      toast.error("Error al subir la foto");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (!user) return null;

  const onSubmit = async (data: ProfileForm) => {
    try {
      const visitFeeVal = data.visitFee ? parseInt(data.visitFee.replace(/\D/g, ""), 10) : null;
      await updateMutation.mutateAsync({
        id: user.id,
        data: {
          name: data.name,
          bio: data.bio || null,
          skills: data.skills || null,
          visitFee: isNaN(visitFeeVal as any) ? null : visitFeeVal,
          payoutBankName: data.payoutBankName?.trim() || null,
          payoutBankAccountType: data.payoutBankAccountType?.trim() || null,
          payoutBankAccountNumber: data.payoutBankAccountNumber?.trim() || null,
          payoutBankRut: data.payoutBankRut?.trim() || null,
          payoutDataConsent: !!data.payoutDataConsent,
        } as any,
      });
      reset(data);
      toast.success("Perfil actualizado exitosamente");
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar el perfil");
    }
  };

  const saveServiceRadius = async () => {
    setSavingRadius(true);
    try {
      await updateMutation.mutateAsync({ id: user!.id, data: { serviceRadius } as any });
      toast.success("Radio de servicio actualizado");
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch { toast.error("Error al guardar el radio"); }
    finally { setSavingRadius(false); }
  };

  const saveAlertRadius = async (value: number | null) => {
    setSavingAlertRadius(true);
    try {
      await updateMutation.mutateAsync({ id: user!.id, data: { alertRadiusKm: value } as any });
      setAlertRadiusKm(value);
      toast.success(value == null ? "Radio ilimitado — recibirás alertas de toda Chile" : `Radio configurado en ${value} km`);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch { toast.error("Error al guardar el radio de alertas"); }
    finally { setSavingAlertRadius(false); }
  };

  const uploadFile = async (file: File) => {
    const objectPath = await uploadFileToStorage(file);
    return `/api/storage/objects/${objectPath}`;
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Solo se permiten archivos de video"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("El video no puede superar los 50MB"); return; }
    const checkDuration = () => new Promise<number>((resolve) => {
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => { URL.revokeObjectURL(vid.src); resolve(vid.duration); };
      vid.onerror = () => resolve(0);
      vid.src = URL.createObjectURL(file);
    });
    const duration = await checkDuration();
    if (duration > 10.5) { toast.error("El video no puede durar más de 10 segundos"); return; }
    setUploadingVideo(true);
    try {
      const videoUrl = await uploadFile(file);
      await updateMutation.mutateAsync({ id: user!.id, data: { presentationVideoUrl: videoUrl } as any });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success("Video de presentación subido");
    } catch (e: any) { toast.error(e.message || "Error al subir el video"); }
    finally { setUploadingVideo(false); if (videoInputRef.current) videoInputRef.current.value = ""; }
  };

  const handleVideoDelete = async () => {
    try {
      await updateMutation.mutateAsync({ id: user!.id, data: { presentationVideoUrl: null } as any });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success("Video eliminado");
    } catch { toast.error("Error al eliminar el video"); }
  };

  const handlePortfolioUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Máximo 10MB"); return; }
    setUploadingPortfolio(true);
    try {
      const imageUrl = await uploadFile(file);
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl, caption: portfolioCaption.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast.success("Foto de portfolio subida");
      setPortfolioCaption("");
      fetchPortfolio();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadingPortfolio(false); }
  };

  const deletePortfolioImage = async (id: number) => {
    const token = localStorage.getItem("fixgo_token");
    await fetch(`/api/portfolio/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    fetchPortfolio();
    toast.success("Imagen eliminada");
  };

  const handleCertUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0];
    if (!file) return;
    if (!certName.trim()) { toast.error("Ingresa el nombre de la certificación primero"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Máximo 10MB"); return; }
    setUploadingCert(true);
    try {
      const imageUrl = await uploadFile(file);
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/certifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: certName.trim(), issuer: certIssuer.trim() || null, imageUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast.success("Certificación enviada para revisión");
      setCertName(""); setCertIssuer("");
      fetchCertifications();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadingCert(false); }
  };

  const deleteCertification = async (id: number) => {
    const token = localStorage.getItem("fixgo_token");
    await fetch(`/api/certifications/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    fetchCertifications();
    toast.success("Certificación eliminada");
  };

  const toggleAvailability = async (checked: boolean) => {
    if (!user?.id) return;
    if (checked && (user as any).kycStatus !== "approved") {
      toast.error("Debes verificar tu identidad (KYC) antes de activarte como disponible");
      return;
    }
    try {
      await availabilityMutation.mutateAsync({
        id: user.id,
        data: { isAvailable: checked }
      });
      toast.success(`Ahora estás ${checked ? 'disponible' : 'no disponible'}`);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: any) {
      const msg = e?.data?.error ?? e?.data?.message ?? e?.data?.detail ?? e?.message ?? "Error al actualizar la disponibilidad";
      const clean = typeof msg === "string" ? msg.replace(/^HTTP \d+[^:]*:\s*/i, "") : "Error al actualizar la disponibilidad";
      toast.error(clean);
    }
  };

  return (
    <div className="container w-full min-w-0 max-w-full px-4 py-6 md:py-8 md:max-w-4xl mx-auto space-y-6 md:space-y-8 overflow-x-hidden">
      {!user.avatarUrl && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <Camera className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-foreground">
            <span className="font-semibold text-primary">Foto de perfil requerida.</span>{" "}
            Para continuar usando Fixgo debes agregar una foto de perfil. Toca tu avatar para cargarla.
          </p>
        </div>
      )}
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold tracking-tight">Tu Perfil</h1>
        <p className="text-muted-foreground mt-1">Administra tu cuenta y preferencias.</p>
      </div>

      <div className="flex items-center gap-4 md:hidden">
        <PhotoPicker onFile={handleAvatarUpload} capture="user">
          {(open) => (
            <div className="relative cursor-pointer" onClick={() => !uploadingAvatar && open()}>
              <Avatar className="w-20 h-20 border-3 border-primary/30">
                <AvatarImage src={user.avatarUrl || undefined} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">{user.name.substring(0,2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 active:opacity-100 flex items-center justify-center transition-opacity">
                {uploadingAvatar ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                <Camera className="w-3.5 h-3.5 text-black" />
              </div>
            </div>
          )}
        </PhotoPicker>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold text-foreground capitalize">{user.name.toLowerCase()}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {isWorker ? (
              <>
                {(() => {
                  const jobs = (user as any).completedJobs ?? 0;
                  const isAfixxer = jobs >= 5;
                  return (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${isAfixxer ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {isAfixxer ? <Zap className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                      {isAfixxer ? 'Experto' : 'Nuevo'}
                    </span>
                  );
                })()}
                <Link
                  href="/valoraciones"
                  className="flex items-center gap-1 rounded-full px-1.5 py-0.5 -mx-1 hover:bg-muted/40 transition-colors"
                >
                  {user.rating ? (
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <Star className="w-3.5 h-3.5 fill-blue-400 text-blue-400" />
                      {Number(user.rating).toFixed(1)}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">({user.totalReviews || 0} reseñas)</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{roleLabels[user.role] || user.role}</span>
            )}
          </div>
          {!isRestrictedAccount && (
            <SwitchRoleButton
              isRoleSwitched={isRoleSwitched}
              originalRole={originalRole}
              isWorker={isWorker}
              isClient={isClient}
              isAdmin={isAdmin}
              switchRole={switchRole}
            />
          )}
        </div>
      </div>

      {isWorker && !isRestrictedAccount && (
        <div className="md:hidden">
          <div className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${user.isAvailable ? 'bg-green-500' : 'bg-muted-foreground'}`} />
              <div>
                <p className="text-sm font-semibold text-foreground">{user.isAvailable ? 'Disponible para trabajar' : 'No disponible'}</p>
                <p className="text-xs text-muted-foreground">{user.isAvailable ? 'Los clientes pueden verte' : 'Oculto para clientes'}</p>
              </div>
            </div>
            <Switch 
              checked={user.isAvailable} 
              onCheckedChange={toggleAvailability}
              disabled={availabilityMutation.isPending}
            />
          </div>
        </div>
      )}

      {isWorker && !isRestrictedAccount && (
        <div className="grid grid-cols-3 gap-3 md:hidden">
          <div className="bg-card rounded-2xl border border-border/50 p-4 text-center">
            <Star className="w-4 h-4 fill-blue-400 text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">
              {user.rating ? Number(user.rating).toFixed(1) : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">Calificación</p>
            {user.totalReviews ? (
              <p className="text-[9px] text-muted-foreground/60">{user.totalReviews} reseña{user.totalReviews !== 1 ? 's' : ''}</p>
            ) : null}
          </div>
          <div className="bg-card rounded-2xl border border-border/50 p-4 text-center">
            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{(user as any).completedJobs ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Trabajos</p>
          </div>
          <div className="bg-card rounded-2xl border border-border/50 p-4 text-center">
            <Shield className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{(user as any).cumplimiento ?? 100}%</p>
            <p className="text-[10px] text-muted-foreground">Cumplimiento</p>
          </div>
        </div>
      )}

      <div className="md:hidden">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Área Personal</h2>
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
          {!isRestrictedAccount && (
            <>
              <Link href="/mi-plan" className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30 active:bg-secondary/50 transition-colors">
                <Crown className="w-5 h-5 text-blue-500" />
                <span className="flex-1 text-sm font-medium text-foreground">Mi Plan</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
              <Link href="/planes" className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30 active:bg-secondary/50 transition-colors">
                <Zap className="w-5 h-5 text-blue-500" />
                <span className="flex-1 text-sm font-medium text-foreground">Ver Planes</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
              <Link href="/notifications" className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30 active:bg-secondary/50 transition-colors">
                <Bell className="w-5 h-5 text-primary" />
                <span className="flex-1 text-sm font-medium text-foreground">Notificaciones</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
              <Link href="/services" className="flex items-center gap-3 px-4 py-3.5 active:bg-secondary/50 transition-colors">
                <Wrench className="w-5 h-5 text-primary" />
                <span className="flex-1 text-sm font-medium text-foreground">Mis Contactos</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid min-w-0 md:grid-cols-3 gap-6 md:gap-8">
        <div className="space-y-6 hidden md:block">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
              <PhotoPicker onFile={handleAvatarUpload} capture="user">
                {(open) => (
                  <div className="relative group cursor-pointer" onClick={() => !uploadingAvatar && open()}>
                    <Avatar className="w-32 h-32 border-4 border-background shadow-md">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback className="text-3xl bg-primary/10 text-primary">{user.name.substring(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      {uploadingAvatar ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Camera className="w-8 h-8 text-white" />}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                      <Camera className="w-4 h-4 text-black" />
                    </div>
                  </div>
                )}
              </PhotoPicker>
              <div>
                <h3 className="font-display font-semibold text-xl capitalize">{user.name.toLowerCase()}</h3>
                {isWorker ? (
                  <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
                    {(() => {
                      const jobs = (user as any).completedJobs ?? 0;
                      const isAfixxer = jobs >= 5;
                      return (
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${isAfixxer ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {isAfixxer ? <Zap className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                          {isAfixxer ? 'Experto' : 'Nuevo'}
                        </span>
                      );
                    })()}
                    {user.rating && (
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        <Star className="w-3.5 h-3.5 fill-blue-400 text-blue-400" />
                        {Number(user.rating).toFixed(1)}
                        <span className="text-xs text-muted-foreground font-normal">({user.totalReviews})</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground capitalize">{roleLabels[user.role] || user.role}</p>
                )}
                {!isRestrictedAccount && (
                  <div className="flex justify-center mt-3">
                    <SwitchRoleButton
                      isRoleSwitched={isRoleSwitched}
                      originalRole={originalRole}
                      isWorker={isWorker}
                      isClient={isClient}
                      isAdmin={isAdmin}
                      switchRole={switchRole}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isWorker && !isRestrictedAccount && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Estado de Trabajo</CardTitle>
                <CardDescription>Controla si los clientes pueden verte</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label htmlFor="availability-desktop" className="flex flex-col space-y-1">
                    <span className="font-medium">Aceptando Trabajos</span>
                    <span className="text-xs text-muted-foreground">Actualmente estás {user.isAvailable ? 'visible para clientes' : 'oculto para clientes'}</span>
                  </Label>
                  <Switch 
                    id="availability-desktop" 
                    checked={user.isAvailable} 
                    onCheckedChange={toggleAvailability}
                    disabled={availabilityMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 md:col-span-2">
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardHeader className="hidden md:block">
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualiza tus datos personales</CardDescription>
            </CardHeader>
            <div className="md:hidden px-4 pt-4">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Editar Información</h2>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="min-w-0 space-y-4 pt-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre Completo</Label>
                    <Input id="name" {...register("name")} />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <Input id="email" value={user.email} disabled className="bg-muted" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <div className="relative">
                    <Input
                      id="phone"
                      value={user.phone ?? ""}
                      disabled
                      className="bg-muted pr-32"
                    />
                    <Link href="/support">
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-primary cursor-pointer hover:underline underline-offset-2">
                        Solicitar cambio
                      </span>
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">Para cambiar tu teléfono contacta al soporte desde el Centro de Ayuda.</p>
                </div>

                {isWorker && !isRestrictedAccount && (
                  <div className="space-y-2">
                    <Label htmlFor="bio">Biografía</Label>
                    <Textarea 
                      id="bio" 
                      {...register("bio")} 
                      placeholder="Cuéntale a los clientes sobre tu experiencia..."
                      className="min-h-[100px]"
                    />
                  </div>
                )}

                {isWorker && !isRestrictedAccount && (
                  <div className="space-y-1.5">
                    <Label htmlFor="visitFee" className="flex items-center justify-between gap-1.5">
                      Tarifa de visita técnica
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          visitFeeInputComplete && savedVisitFeeComplete
                            ? "bg-green-500/15 text-green-500"
                            : "bg-[#f5a83c]/15 text-[#f5a83c]"
                        }`}
                        title={visitFeeInputComplete && savedVisitFeeComplete
                          ? "Guardada; requerida para recibir trabajos"
                          : visitFeeInputComplete
                            ? "Completa en el formulario, pero aún no está guardada"
                            : "Requerida para recibir trabajos"}
                      >
                        {visitFeeInputComplete ? (savedVisitFeeComplete ? "Completo" : "Guardar") : "Requerido"}
                      </span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">$</span>
                      <Input
                        id="visitFee"
                        {...register("visitFee")}
                        placeholder="Ej: 5000"
                        className="pl-6"
                        inputMode="numeric"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Se cobra si no hay acuerdo o si cancelan pasados los 10 min.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Una tarifa muy alta puede desincentivar a los clientes.
                    </p>
                  </div>
                )}

                {isWorker && !isRestrictedAccount && (
                  <div className="space-y-2.5 rounded-xl border border-border bg-muted/10 p-3">
                    <div>
                      <Label className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-semibold">Para que te paguen el trabajo y la visita técnica.</span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            payoutFormComplete && savedPayoutComplete
                              ? "bg-green-500/15 text-green-500"
                              : "bg-[#f5a83c]/15 text-[#f5a83c]"
                          }`}
                          title={payoutFormComplete && savedPayoutComplete
                            ? "Guardados; requeridos para recibir trabajos"
                            : payoutFormComplete
                              ? "Completos en el formulario, pero aún no están guardados"
                              : "Requeridos para recibir trabajos"}
                        >
                          {payoutFormComplete ? (savedPayoutComplete ? "Completo" : "Guardar") : "Requerido"}
                        </span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        El cliente los ve solo cuando corresponde pagar. Fix Master no procesa el pago.
                      </p>
                    </div>
                    <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor="payoutBankName" className="break-words text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Banco</Label>
                        <Input id="payoutBankName" {...register("payoutBankName")} placeholder="Banco Estado" className="h-9 w-full min-w-0 text-sm" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor="payoutBankAccountType" className="break-words text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo de cuenta</Label>
                        <Input id="payoutBankAccountType" {...register("payoutBankAccountType")} placeholder="Cuenta RUT" className="h-9 w-full min-w-0 text-sm" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor="payoutBankAccountNumber" className="break-words text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">N° de cuenta</Label>
                        {!revealedBank.accountNumber && (watch("payoutBankAccountNumber") ?? "").length > 4 ? (
                          <button
                            type="button"
                            onClick={() => setRevealedBank(prev => ({ ...prev, accountNumber: true }))}
                            className="flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2.5 text-sm"
                          >
                            <span className="tracking-wider truncate">•••• {(watch("payoutBankAccountNumber") ?? "").slice(-4)}</span>
                            <span className="text-[10px] font-semibold text-primary shrink-0">Ver</span>
                          </button>
                        ) : (
                          <Input id="payoutBankAccountNumber" {...register("payoutBankAccountNumber")} placeholder="12345678" inputMode="numeric" className="h-9 w-full min-w-0 text-sm" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor="payoutBankRut" className="break-words text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">RUT titular</Label>
                        {!revealedBank.rut && (watch("payoutBankRut") ?? "").length > 4 ? (
                          <button
                            type="button"
                            onClick={() => setRevealedBank(prev => ({ ...prev, rut: true }))}
                            className="flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2.5 text-sm"
                          >
                            <span className="tracking-wider truncate">•••• {(watch("payoutBankRut") ?? "").slice(-4)}</span>
                            <span className="text-[10px] font-semibold text-primary shrink-0">Ver</span>
                          </button>
                        ) : (
                          <Input id="payoutBankRut" {...register("payoutBankRut")} placeholder="12.345.678-9" className="h-9 w-full min-w-0 text-sm" />
                        )}
                      </div>
                    </div>
                    <label className="flex min-w-0 items-start gap-2 pt-1 text-[11px] leading-snug text-muted-foreground">
                      <input
                        type="checkbox"
                        {...register("payoutDataConsent")}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#f5a83c]"
                      />
                      <span>Acepto que mis datos de transferencia se muestren al cliente o experto correspondiente cuando el sistema lo determine necesario.</span>
                    </label>
                    {(visitFeeInputComplete && !savedVisitFeeComplete) ||
                    (payoutFormComplete && !savedPayoutComplete) ? (
                      <p className="text-[11px] text-[#f5a83c]">
                        Los datos están completos en este formulario, pero debes guardar el perfil para que se apliquen al recibir trabajos.
                      </p>
                    ) : null}
                  </div>
                )}

                {isWorker && !isRestrictedAccount && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <span>Video de Presentación</span>
                      <span className="text-xs text-muted-foreground font-normal">(máx. 10 seg · 50 MB)</span>
                    </Label>
                    {(user as any).presentationVideoUrl ? (
                      <div className="space-y-2">
                        <div className="rounded-xl overflow-hidden bg-black aspect-video border border-border">
                        <video
                          src={(user as any).presentationVideoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                        /></div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => videoInputRef.current?.click()} disabled={uploadingVideo}>
                            {uploadingVideo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            Cambiar video
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={handleVideoDelete} className="text-destructive border-destructive/40 hover:bg-destructive/10">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={uploadingVideo}
                        className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                      >
                        {uploadingVideo ? (
                          <><Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm font-medium">Subiendo video...</span></>
                        ) : (
                          <><Upload className="w-6 h-6" /><span className="text-sm font-medium">Toca para subir tu video</span><span className="text-xs">MP4, MOV · máx. 10 segundos</span></>
                        )}
                      </button>
                    )}
                    <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  </div>
                )}
              </CardContent>
              <CardFooter className="min-w-0 border-t px-4 py-4 flex justify-end sm:px-6">
                <Button type="submit" className="w-full md:w-auto fixgo-gradient font-bold text-white" disabled={(!isDirty && dirtyFieldCount === 0) || updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>

      {isWorker && !isRestrictedAccount && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" /> Mis Profesiones
              </CardTitle>
              <CardDescription>
                Toca una tarjeta para agregarla o quitarla de tus especialidades — al tocarla verás también sus servicios incluidos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                // Agrupar por el rubro administrable que llega desde la API.
                const cats = (allCategories as any[] | undefined) ?? [];
                const groups = new Map<string, { name: string; sortOrder: number; items: any[] }>();
                for (const c of cats) {
                  const name = c.group?.name || c.groupName || "Otros Servicios";
                  const key = c.group?.id ? String(c.group.id) : name.toLowerCase();
                  if (!groups.has(key)) groups.set(key, { name, sortOrder: c.group?.sortOrder ?? 99, items: [] });
                  groups.get(key)!.items.push(c);
                }
                const orderedGroups = [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
                return orderedGroups.map(({ name: groupName, items }) => {
                  items.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.id - b.id);
                  const selCount = items.filter((c) => workerCategoryIds.includes(c.id)).length;
                  return (
                    <div key={groupName} className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2 border-b border-primary/20 pb-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <h3 className="text-sm font-bold text-primary">{groupName}</h3>
                          <div className="h-px min-w-4 flex-1 bg-gradient-to-r from-primary/35 to-transparent" aria-hidden="true" />
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {selCount > 0 ? `${selCount} seleccionada${selCount === 1 ? "" : "s"}` : `${items.length} disponibles`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {items.map((cat: any) => {
                          const selected = workerCategoryIds.includes(cat.id);
                          const style = getCategoryStyle(cat.icon);
                          const CatIcon = style.icon;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                if (selected) {
                                  removeCategory(cat.id);
                                  // Al quitar, cerrar el panel de servicios si era el de esta tarjeta
                                  if (focusedCategoryId === cat.id) setFocusedCategoryId(null);
                                } else {
                                  addCategory(cat.id);
                                  focusCategory(cat.id);
                                }
                              }}
                              className={`relative flex flex-col items-center gap-1.5 p-3 pt-4 rounded-xl border-2 text-sm font-medium transition-all ${
                                selected ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50"
                              }`}
                            >
                              {/* Check circular: estado seleccionado */}
                              <span
                                className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                  selected ? "bg-primary text-primary-foreground" : "border-2 border-border text-transparent"
                                }`}
                                aria-hidden="true"
                              >
                                <Check className="w-3 h-3" strokeWidth={3.5} />
                              </span>

                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${style.bg} ${style.border} border`}>
                                <CatIcon className={`w-5 h-5 ${style.color}`} />
                              </div>
                              <span className="text-center leading-tight text-xs">{cat.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Panel de subcategorías de la categoría enfocada */}
              {focusedCategoryId && (() => {
                const focused = (allCategories as any[] | undefined)?.find((c: any) => c.id === focusedCategoryId);
                const subs: any[] = focused?.subcategories || [];
                if (!focused) return null;
                const style = getCategoryStyle(focused.icon);
                const FocIcon = style.icon;
                return (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2 transition-all">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${style.bg} border ${style.border}`}>
                        <FocIcon className={`w-4 h-4 ${style.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground leading-tight">{focused.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {subs.length > 0 ? `${subs.length} servicios incluidos` : "Sin especialidades registradas"}
                        </p>
                      </div>
                    </div>
                    {subs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {subs.map((sub: any) => (
                          <span
                            key={sub.id}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-background border border-border/60 text-muted-foreground"
                          >
                            {sub.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {workerCategoryIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Seleccionadas: <strong>{workerCategoryIds.length}</strong> de <strong>{(allCategories as any[])?.length ?? 0}</strong>
                </p>
              )}

              {/* Solo Premium puede seleccionar todas las especialidades */}
              {canSelectAllCategories && (() => {
                const all = (allCategories as any[] | undefined) ?? [];
                const allSelected = all.length > 0 && all.every((c: any) => workerCategoryIds.includes(c.id));
                return (
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        if (!canSelectAllCategories) return;
                        setWorkerCategoryIds(e.target.checked ? all.map((c: any) => c.id) : []);
                      }}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    <span className="text-xs text-muted-foreground font-medium">Seleccionar todas las especialidades</span>
                  </label>
                );
              })()}
            </CardContent>
            <CardFooter className="border-t px-6 py-4 flex justify-end">
                <Button type="button" onClick={saveCategories} disabled={savingCategories || workerCategoryIds.length === 0} className="fixgo-gradient font-bold text-white">
                {savingCategories ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</> : "Guardar Profesiones"}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" /> Área de Servicio Geográfica
              </CardTitle>
              <CardDescription>Define el radio máximo en kilómetros donde ofreces tus servicios.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Radio de cobertura</Label>
                  <span className="font-bold text-primary text-lg">{serviceRadius} km</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={serviceRadius}
                  onChange={(e) => setServiceRadius(parseInt(e.target.value))}
                  onInput={(e) => setServiceRadius(parseInt((e.target as HTMLInputElement).value))}
                  className="w-full accent-primary h-2 cursor-pointer"
                  style={{ touchAction: "none" }}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 km</span>
                  <span>50 km</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={saveServiceRadius} disabled={savingRadius} className="w-full sm:w-auto">
                  {savingRadius && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Radio
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto gap-2"
                  disabled={savingRadius}
                  onClick={async () => {
                    try {
                      toast.loading("Obteniendo ubicación GPS...", { id: "gps" });
                      const pos = await getCurrentPosition();
                      await updateMutation.mutateAsync({ id: user!.id, data: { lat: pos.lat, lng: pos.lng } as any });
                      toast.success("Ubicación actualizada correctamente", { id: "gps" });
                    } catch (e: any) {
                      toast.error("No se pudo obtener la ubicación: " + (e?.message || "Error"), { id: "gps" });
                    }
                  }}
                >
                  <MapPin className="w-4 h-4" />
                  Actualizar ubicación GPS
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Radio de alertas Pro Max ─────────────────────────────── */}
          {isWorker && !isRestrictedAccount && isProPlus && (
            <Card style={{ borderColor: "rgba(245,158,11,0.3)", background: "linear-gradient(135deg, rgba(245,158,11,0.04) 0%, transparent 60%)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span>Radio de Alertas <span className="text-amber-400">Pro Max</span></span>
                </CardTitle>
                <CardDescription>
                  Define hasta qué distancia quieres recibir alertas de nuevas solicitudes. Si eres de un pueblo, configura un radio pequeño para no recibir avisos de otras ciudades.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Toggle sin límite */}
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Sin límite de distancia</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Recibe alertas de solicitudes en cualquier parte</p>
                  </div>
                  <Switch
                    checked={alertRadiusKm === null}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        saveAlertRadius(null);
                      } else {
                        const defaultKm = 50;
                        setAlertRadiusKm(defaultKm);
                      }
                    }}
                    disabled={savingAlertRadius}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>

                {/* Slider de radio (solo visible cuando tiene límite) */}
                {alertRadiusKm !== null && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label>Radio máximo de alertas</Label>
                      <span className="font-bold text-amber-400 text-lg">{alertRadiusKm} km</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={300}
                      step={5}
                      value={alertRadiusKm}
                      onChange={(e) => setAlertRadiusKm(parseInt(e.target.value))}
                      onInput={(e) => setAlertRadiusKm(parseInt((e.target as HTMLInputElement).value))}
                      className="w-full h-2 cursor-pointer rounded-full appearance-none"
                      style={{ accentColor: "#f59e0b", touchAction: "none" }}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>5 km</span>
                      <span className="text-center">ciudad</span>
                      <span>300 km</span>
                    </div>
                    {/* Ejemplos referenciales */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { km: 15, label: "Mi barrio" },
                        { km: 50, label: "Mi ciudad" },
                        { km: 150, label: "Mi región" },
                      ].map(({ km, label }) => (
                        <button
                          key={km}
                          onClick={() => setAlertRadiusKm(km)}
                          className="py-1.5 px-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: alertRadiusKm === km ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)",
                            border: alertRadiusKm === km ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.08)",
                            color: alertRadiusKm === km ? "#f59e0b" : "var(--muted-foreground)",
                          }}
                        >
                          {label}<br />
                          <span className="opacity-70">{km} km</span>
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={() => saveAlertRadius(alertRadiusKm)}
                      disabled={savingAlertRadius}
                      className="w-full font-bold"
                      style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white" }}
                    >
                      {savingAlertRadius ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</> : "Guardar radio de alertas"}
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground leading-relaxed">
                  💡 La bandeja de solicitudes (<span className="text-foreground font-medium">Solicitudes disponibles</span>) también respeta tu radio de área de servicio configurado arriba.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Trabajos y Certificados
              </CardTitle>
              <CardDescription>Fotos de tus trabajos y tus certificados verificados. Los clientes los ven en tu perfil.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="trabajos">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="trabajos">
                    Trabajos{portfolio.length > 0 ? ` (${portfolio.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="certificados">
                    Certificados{certifications.length > 0 ? ` (${certifications.length})` : ""}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="trabajos" className="space-y-3 pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    {portfolio.map((img: any) => (
                      <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                        <img src={img.imageUrl} alt={img.caption || "Portfolio"} className="w-full h-full object-cover" />
                        {img.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5">
                            <p className="text-white text-[10px] truncate">{img.caption}</p>
                          </div>
                        )}
                        <button
                          onClick={() => deletePortfolioImage(img.id)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {portfolio.length < 20 && (
                      <PhotoPicker onFile={handlePortfolioUpload}>
                        {(open) => (
                          <button
                            type="button"
                            onClick={open}
                            disabled={uploadingPortfolio}
                            className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                          >
                            {uploadingPortfolio ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImagePlus className="w-5 h-5" /><span className="text-[10px]">Añadir</span></>}
                          </button>
                        )}
                      </PhotoPicker>
                    )}
                  </div>
                  <Input
                    placeholder="Descripción de la foto (opcional)"
                    value={portfolioCaption}
                    onChange={(e) => setPortfolioCaption(e.target.value)}
                    className="h-9 text-sm"
                  />
                </TabsContent>

                <TabsContent value="certificados" className="space-y-3 pt-3">
                  {certifications.length > 0 && (
                    <div className="space-y-2">
                      {certifications.map((cert: any) => (
                        <div key={cert.id} className="flex items-center gap-2.5 p-2.5 border rounded-lg bg-card">
                          <div className="w-9 h-9 rounded-md border overflow-hidden bg-muted shrink-0">
                            <img src={cert.imageUrl} alt={cert.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{cert.name}</p>
                            <div className="flex items-center gap-1.5">
                              {cert.issuer && <p className="text-[11px] text-muted-foreground truncate">{cert.issuer}</p>}
                              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                cert.status === "verified" ? "bg-green-500/15 text-green-500" :
                                cert.status === "rejected" ? "bg-red-500/15 text-red-500" :
                                "bg-blue-500/15 text-blue-500"
                              }`}>
                                {cert.status === "verified" ? "✓ Verificado" :
                                 cert.status === "rejected" ? "✗ Rechazado" : "⏳ En revisión"}
                              </span>
                            </div>
                          </div>
                          <button onClick={() => deleteCertification(cert.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 border-2 border-dashed border-muted-foreground/20 rounded-lg space-y-2.5">
                    <p className="text-sm font-medium">Agregar certificación</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Nombre (ej: Licencia de Electricista)"
                        value={certName}
                        onChange={(e) => setCertName(e.target.value)}
                        className="h-9 text-sm"
                      />
                      <Input
                        placeholder="Institución emisora (opcional)"
                        value={certIssuer}
                        onChange={(e) => setCertIssuer(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <PhotoPicker onFile={handleCertUpload}>
                      {(open) => (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingCert || !certName.trim()}
                          onClick={open}
                          className="w-full sm:w-auto"
                        >
                          {uploadingCert ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                          Subir Certificado / Licencia
                        </Button>
                      )}
                    </PhotoPicker>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {!isAdmin && <SupportCenter />}


    </div>
  );
}
