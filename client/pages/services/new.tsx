import { useRef, useState, useEffect } from "react";
import { uploadFileToStorage } from "@/lib/storage";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateService, useListCategories } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { toast } from "sonner";
import { Loader2, CalendarIcon, MapPin, X, ImagePlus, Zap, Home, Building2, Store, Lock, AlertTriangle, ShieldCheck, Crown, Star } from "lucide-react";
import { SelfieCaptureModal } from "@/components/selfie-capture-modal";
import { getCategoryStyle } from "@/lib/category-icons";
import { useSubscription } from "@/hooks/use-subscription";
import { Link } from "wouter";

const serviceSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  description: z.string().min(10, "Por favor proporciona más detalles"),
  categoryId: z.coerce.number().min(1, "Selecciona una categoría"),
  address: z.string().optional(),
  scheduledAt: z.string().optional().nullable(),
});

type ServiceForm = z.infer<typeof serviceSchema>;

export default function NewService() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const createServiceMutation = useCreateService();
  const { data: categories, isLoading: catsLoading } = useListCategories({ query: { staleTime: 30 * 60_000 } } as any);
  const {
    limit: subLimit,
    isActive: subActive,
    hasActivePlan,
    isLoading: subLoading,
  } = useSubscription();

  const params = new URLSearchParams(search);
  const urlCategoryId = params.get("categoryId") ? parseInt(params.get("categoryId")!) : undefined;
  const urlSubcategoryId = params.get("subcategoryId") ? parseInt(params.get("subcategoryId")!) : undefined;
  const urlDirectWorkerId = params.get("directWorkerId") ? parseInt(params.get("directWorkerId")!) : undefined;
  const urlWorkerName = params.get("workerName") ?? undefined;

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isUrgent, setIsUrgent] = useState(() => params.get("isUrgent") === "true");
  const [serviceCoords, setServiceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showSelfieModal, setShowSelfieModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [clientSelfieUrl, setClientSelfieUrl] = useState<string | null>(null);
  const [propertyType, setPropertyType] = useState<"casa" | "departamento" | "local">("casa");
  const [aptNumber, setAptNumber] = useState("");
  const [originAddress, setOriginAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [originPropertyType, setOriginPropertyType] = useState<"casa" | "departamento" | "local">("casa");
  const [destinationPropertyType, setDestinationPropertyType] = useState<"casa" | "departamento" | "local">("casa");
  const [originAptNumber, setOriginAptNumber] = useState("");
  const [destinationAptNumber, setDestinationAptNumber] = useState("");
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | undefined>(urlSubcategoryId);
  const [budgetNote, setBudgetNote] = useState("");
  const [requestQuote, setRequestQuote] = useState(false);
  // Cómo pagará el cliente — OBLIGATORIO (al completarse el trabajo, si es
  // transferencia la app entrega los datos bancarios oficiales del experto).
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | null>(null);


  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      categoryId: urlCategoryId,
      title: params.get("title") || undefined,
      address: params.get("address") || undefined,
    },
  });

  const watchedCategoryId = watch("categoryId");

  // Placeholder dinámico según categoría seleccionada
  const selectedCategory: any = (categories ?? []).find((c: any) => c.id === watchedCategoryId);
  const selectedCategoryName: string = selectedCategory?.name ?? "";
  const isFleteCategory = selectedCategory?.platform === "fletes"
    || /flete|transporte/i.test(selectedCategoryName)
    || /transporte/i.test(selectedCategory?.group?.name ?? selectedCategory?.groupName ?? "");
  const descriptionPlaceholder = isFleteCategory
    ? "Describe qué necesitas mover: tipo de objetos, cantidad, peso aproximado, y si necesitas ayuda para cargar o descargar."
    : "Describe el problema, dimensiones, materiales u otros detalles relevantes...";

  const subcategoryData = urlSubcategoryId && categories
    ? categories
        .flatMap((c: any) => c.subcategories ?? [])
        .find((s: any) => s.id === urlSubcategoryId) ?? null
    : null;

  useEffect(() => {
    if (urlCategoryId && categories && categories.length > 0) {
      setValue("categoryId", urlCategoryId);
    }
  }, [categories, urlCategoryId, setValue]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (imageUrls.length + files.length > 4) {
      toast.error("Máximo 4 fotos permitidas (2 obligatorias + 2 opcionales)");
      return;
    }
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) { toast.error(`${file.name} no es una imagen válida`); continue; }
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} supera el límite de 10MB`); continue; }

        const objectPath = await uploadFileToStorage(file);
        const imageUrl = `/api/storage/objects/${objectPath}`;
        setImageUrls(prev => [...prev, imageUrl]);
      }
      toast.success("Foto(s) subida(s)");
    } catch (err: any) {
      toast.error(err?.message || "Error al subir foto");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: ServiceForm) => {
    if (!paymentMethod) {
      toast.error("Indica cómo pagarás: Efectivo o Transferencia");
      return;
    }
    if (isFleteCategory && (!originAddress.trim() || !destinationAddress.trim())) {
      toast.error("Completa la dirección de origen y la dirección de destino");
      return;
    }
    if (!isFleteCategory && !data.address?.trim()) {
      toast.error("La dirección es obligatoria");
      return;
    }
    let fullAddress = data.address?.trim() || "";
    if (isFleteCategory) {
      const origin = `${originAddress.trim()}${originPropertyType === "departamento" && originAptNumber.trim() ? `, Departamento ${originAptNumber.trim()}` : originPropertyType === "local" ? " (Local)" : ""}`;
      const destination = `${destinationAddress.trim()}${destinationPropertyType === "departamento" && destinationAptNumber.trim() ? `, Departamento ${destinationAptNumber.trim()}` : destinationPropertyType === "local" ? " (Local)" : ""}`;
      fullAddress = `Origen: ${origin} · Destino: ${destination}`;
    } else if (propertyType === "departamento" && aptNumber.trim()) {
      fullAddress = `${fullAddress}, Departamento ${aptNumber.trim()}`;
    } else if (propertyType === "local") {
      fullAddress = `${fullAddress} (Local)`;
    }
    const payload = {
      ...data,
      address: fullAddress,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      isUrgent,
      lat: serviceCoords?.lat ?? undefined,
      lng: serviceCoords?.lng ?? undefined,
      originAddress: isFleteCategory ? originAddress.trim() : undefined,
      destinationAddress: isFleteCategory ? destinationAddress.trim() : undefined,
      subcategoryId: selectedSubcategoryId ?? undefined,
      budgetNote: budgetNote.trim() || undefined,
      requestQuote,
      paymentMethod,
      ...(urlDirectWorkerId ? { directWorkerId: urlDirectWorkerId } : {}),
    };
    setPendingPayload(payload);
    setShowTermsModal(true);
  };

  const onAcceptTerms = () => {
    setShowTermsModal(false);
    setShowSelfieModal(true);
  };

  const submitWithSelfie = async (selfieUrl: string) => {
    setClientSelfieUrl(selfieUrl);
    setShowSelfieModal(false);
    try {
      const result = await createServiceMutation.mutateAsync({ data: { ...pendingPayload, clientSelfieUrl: selfieUrl } as any });
      toast.success("¡Publicación de necesidad creada!");
      sessionStorage.setItem("fixgo_active_service_id", String(result.id));
      setLocation("/");
    } catch (error: any) {
      toast.error(error?.message || "Error al crear la solicitud");
    }
  };

  return (
    <div className="container px-4 py-4 md:py-8 max-w-3xl mx-auto pb-6">
      <div className="mb-4 md:mb-8">
        <h1 className="text-xl md:text-3xl font-bold tracking-tight">
          {urlDirectWorkerId ? "Solicitud Directa" : "Publicar una necesidad"}
        </h1>
        <p className="text-muted-foreground mt-0.5 text-sm hidden md:block">
          {urlDirectWorkerId
            ? `Enviarás esta solicitud directamente a ${urlWorkerName ?? "tu técnico de confianza"}.`
            : "Describe tu necesidad para que los profesionales puedan contactarte con sus propuestas."}
        </p>
      </div>

      {urlDirectWorkerId && urlWorkerName && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <Star className="w-4 h-4 shrink-0 text-amber-400 fill-amber-400" />
          <p className="text-sm text-foreground flex-1">
            Solicitud directa a <strong>{urlWorkerName}</strong>. Solo él/ella podrá ver y aceptar esta solicitud.
          </p>
        </div>
      )}

      {!subLoading && (() => {
        const postsLimit = subLimit("posts_per_month");
        // The active plan shown in /planes is authoritative. Do not show the
        // paywall when that plan is active, even if an older plan row has a
        // missing/stale posts_per_month feature payload.
        if (!hasActivePlan) {
          return (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
              <Crown className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">Necesitas un plan activo para publicar</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Activa un plan para publicar necesidades y conectar con profesionales.</p>
              </div>
              <Link href="/planes">
                <span className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90 cursor-pointer">Ver planes</span>
              </Link>
            </div>
          );
        }
        if (postsLimit !== Infinity && postsLimit > 0) {
          return (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <Crown className="h-4 w-4 shrink-0 text-primary" />
              <p className="flex-1 text-muted-foreground">Tu plan permite <strong className="text-foreground">{postsLimit} publicaciones/mes</strong>.</p>
            </div>
          );
        }
        if (postsLimit === Infinity) {
          return (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm">
              <Crown className="h-4 w-4 shrink-0 text-blue-400" />
              <p className="flex-1 text-blue-100">Tu plan actual permite <strong>publicaciones ilimitadas</strong>.</p>
            </div>
          );
        }
        if (subActive) {
          return (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm">
              <Crown className="h-4 w-4 shrink-0 text-blue-400" />
              <p className="flex-1 text-blue-100">Tu plan actual está activo. Puedes publicar tu necesidad.</p>
            </div>
          );
        }
        return null;
      })()}

      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5 pt-5 md:space-y-6 md:pt-6">
            
            <div className="space-y-2">
              <Label htmlFor="title">Título de la publicación</Label>
              <Input 
                id="title" 
                placeholder="Ej: Reparar fuga en la cocina" 
                className="md:text-lg md:py-6"
                {...register("title")} 
              />
              {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
            </div>

            {(() => {
              const activeCategoryId = urlCategoryId ?? watchedCategoryId;
              const activeCat = categories?.find((c: any) => c.id === activeCategoryId);
              const subcategories: any[] = (activeCat as any)?.subcategories ?? [];
              return (
                <>
                  <div className="grid gap-4 md:gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        {urlSubcategoryId ? "Especialidad" : urlCategoryId ? "Categoría" : "Categoría"}
                      </Label>
                      {urlCategoryId ? (
                        (() => {
                          const catData = categories?.find((c: any) => c.id === urlCategoryId);
                          const catStyle = catData ? getCategoryStyle(catData.icon ?? undefined) : null;
                          const CatIcon = catStyle?.icon;
                          const displayName = urlSubcategoryId
                            ? (subcategoryData?.name || (catsLoading ? "Cargando..." : "Especialidad"))
                            : (catData?.name || (catsLoading ? "Cargando..." : "Categoría"));
                          return (
                            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${catStyle ? catStyle.border : "border-border/60"} ${catStyle ? catStyle.bg : "bg-muted/30"}`}>
                              {CatIcon && catStyle && (
                                <div className={`w-7 h-7 rounded-lg ${catStyle.bg} border ${catStyle.border} flex items-center justify-center shrink-0`}>
                                  <CatIcon className={`w-4 h-4 ${catStyle.color}`} strokeWidth={1.8} />
                                </div>
                              )}
                              <span className={`text-sm font-semibold flex-1 ${catStyle ? catStyle.color : "text-foreground"}`}>{displayName}</span>
                              <Lock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          <Select
                            value={watchedCategoryId ? String(watchedCategoryId) : ""}
                            onValueChange={(val) => {
                              setValue("categoryId", parseInt(val), { shouldValidate: true });
                              setSelectedSubcategoryId(undefined);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={catsLoading ? "Cargando..." : "Selecciona una categoría"} />
                            </SelectTrigger>
                            <SelectContent>
                              {categories?.filter((c: any) => c.isActive).map((cat: any) => (
                                <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId.message}</p>}
                        </>
                      )}
                    </div>

                    {/* Especialidad: aparece cuando hay subcategorías y no viene fija por URL */}
                    {!urlSubcategoryId && subcategories.length > 0 && (
                      <div className="space-y-2">
                        <Label>Especialidad</Label>
                        <Select
                          value={selectedSubcategoryId ? String(selectedSubcategoryId) : ""}
                          onValueChange={(val) => setSelectedSubcategoryId(val ? parseInt(val) : undefined)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una especialidad" />
                          </SelectTrigger>
                          <SelectContent>
                            {subcategories.map((sub: any) => (
                              <SelectItem key={sub.id} value={sub.id.toString()}>{sub.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="description">Descripción Detallada</Label>
              <Textarea 
                id="description" 
                placeholder={descriptionPlaceholder}
                className="min-h-[120px] resize-y"
                {...register("description")} 
              />
              {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="budgetNote">Presupuesto aproximado</Label>
              <Input
                id="budgetNote"
                placeholder={requestQuote ? "Desactivado: pediste cotización al experto" : "Ej: Entre $30.000 y $50.000 CLP"}
                value={budgetNote}
                disabled={requestQuote}
                className={requestQuote ? "opacity-50 cursor-not-allowed" : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\./g, "");
                  if (/^\d*$/.test(raw)) {
                    setBudgetNote(raw ? Number(raw).toLocaleString("es-CL") : "");
                  } else {
                    setBudgetNote(e.target.value);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Solo visible dentro del chat cifrado con cada profesional, no en el listado público.
              </p>
              {/* Precio y cotización son mutuamente excluyentes: si el cliente ya
                  escribió un precio, no puede pedir cotización, y viceversa. */}
              <label className={`flex items-center gap-2.5 mt-1 select-none ${budgetNote.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-orange-500 cursor-pointer disabled:cursor-not-allowed"
                  checked={requestQuote}
                  disabled={!!budgetNote.trim()}
                  onChange={(e) => setRequestQuote(e.target.checked)}
                />
                <span className="text-sm text-foreground font-medium">Solicitar cotización</span>
                <span className="text-xs text-muted-foreground">
                  {budgetNote.trim() ? "(desactivado: ya indicaste un presupuesto)" : "(pedir que el experto indique su precio)"}
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Label>¿Cómo pagarás? <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                    paymentMethod === "cash"
                      ? "border-orange-500 bg-orange-500/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-orange-300"
                  }`}
                >
                  💵 Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                    paymentMethod === "transfer"
                      ? "border-orange-500 bg-orange-500/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-orange-300"
                  }`}
                >
                  🏦 Transferencia
                </button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Si eliges transferencia, al completarse el trabajo la app te mostrará los datos bancarios oficiales del experto. Nunca compartas datos de pago fuera de la app.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Fotos del Problema</Label>
              <p className="text-xs text-muted-foreground">
                Sube fotos para que los profesionales entiendan mejor el trabajo (recomendado al menos 2).
              </p>
              {imageUrls.length < 2 && (
                <p className="text-xs text-muted-foreground font-medium">
                  {imageUrls.length === 0 ? "Aún sin fotos adjuntas." : "Solo 1 foto adjunta — agrega al menos 1 más para que el experto entienda mejor el trabajo."}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {imageUrls.map((url, i) => (
                  <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border bg-muted group">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {imageUrls.length < 4 && (
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="w-6 h-6" />
                        <span className="text-xs">Añadir</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border-2 border-orange-500/30 bg-orange-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <Label className="text-sm font-semibold cursor-pointer" htmlFor="urgent-toggle">Servicio Urgente</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Máxima prioridad. Los profesionales disponibles serán notificados inmediatamente.</p>
                </div>
              </div>
              <Switch id="urgent-toggle" checked={isUrgent} onCheckedChange={setIsUrgent} />
            </div>

            <div className="space-y-3">
              <Label>{isFleteCategory ? "Direcciones del Servicio" : "Dirección del Servicio"}</Label>
              {isFleteCategory ? (
                <div className="space-y-4">
                  {([
                    { key: "origin", title: "Dirección de Origen (dónde recoge)", value: originAddress, setValue: setOriginAddress, type: originPropertyType, setType: setOriginPropertyType, apt: originAptNumber, setApt: setOriginAptNumber, coords: setOriginCoords },
                    { key: "destination", title: "Dirección de Destino (dónde entrega)", value: destinationAddress, setValue: setDestinationAddress, type: destinationPropertyType, setType: setDestinationPropertyType, apt: destinationAptNumber, setApt: setDestinationAptNumber, coords: setDestinationCoords },
                  ] as const).map((field) => (
                    <div key={field.key} className="space-y-2 rounded-xl border border-border/50 bg-muted/10 p-3">
                      <p className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />{field.title}</p>
                      <div className="flex gap-2">
                        {[
                          { key: "casa", label: "Casa", Icon: Home },
                          { key: "departamento", label: "Depto.", Icon: Building2 },
                          { key: "local", label: "Local", Icon: Store },
                        ].map(({ key, label, Icon }) => (
                          <button key={key} type="button" onClick={() => field.setType(key as any)} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[11px] font-semibold ${field.type === key ? "bg-primary text-black border-primary" : "bg-background border-border/60 text-muted-foreground"}`}>
                            <Icon className="w-3 h-3" />{label}
                          </button>
                        ))}
                      </div>
                      <AddressAutocomplete
                        id={`${field.key}-address`}
                        value={field.value}
                        onChange={field.setValue}
                        onLatLng={(lat, lng) => field.coords({ lat, lng })}
                        placeholder={field.key === "origin" ? "Calle, número, comuna de origen..." : "Calle, número, comuna de destino..."}
                        className="text-sm"
                      />
                      {field.type === "departamento" && (
                        <Input placeholder="Número de departamento (ej: 4B, 302)" value={field.apt} onChange={(e) => field.setApt(e.target.value)} className="text-sm" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    {[
                      { key: "casa", label: "Casa", Icon: Home },
                      { key: "departamento", label: "Depto.", Icon: Building2 },
                      { key: "local", label: "Local", Icon: Store },
                    ].map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPropertyType(key as any)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                          propertyType === key ? "bg-primary text-black border-primary shadow-sm" : "bg-background border-border/60 text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />{label}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                    <AddressAutocomplete
                      id="address"
                      value={watch("address") || ""}
                      onChange={(val) => setValue("address", val, { shouldValidate: true })}
                      onLatLng={(lat, lng) => setServiceCoords({ lat, lng })}
                      placeholder="Calle, número..."
                      className="pl-9"
                    />
                  </div>
                  {propertyType === "departamento" && (
                    <Input placeholder="Número de departamento (ej: 4B, 302)" value={aptNumber} onChange={(e) => setAptNumber(e.target.value)} className="text-sm" />
                  )}
                  {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Fecha y Hora Preferida (Opcional)</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  className="pl-9"
                  {...register("scheduledAt")}
                />
              </div>
            </div>

          </CardContent>
          <CardFooter className="flex gap-3 border-t pt-4 pb-4 md:pt-6 bg-muted/20 md:justify-end">
            <Button type="button" variant="outline" className="flex-1 md:flex-none" onClick={() => setLocation("/services")}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 md:flex-none fixgo-gradient font-bold text-white" disabled={createServiceMutation.isPending || uploadingPhoto}>
              {createServiceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar Necesidad
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Dialog open={showTermsModal} onOpenChange={(open) => { if (!open) { setShowTermsModal(false); setPendingPayload(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Condiciones del Servicio
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3 text-sm">
              <p className="text-foreground font-medium">Antes de continuar, lee con atención:</p>
              <ul className="space-y-2 text-muted-foreground list-none">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span>Asegúrate de que tu publicación <strong className="text-foreground">describa correctamente el trabajo</strong> que necesitas realizar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span>Revisa siempre la <strong className="text-foreground">tarifa de visita técnica</strong> indicada en el perfil del experto.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span>Si al llegar el experto encuentra que el trabajo es <strong className="text-foreground">más complicado o distinto</strong> a lo publicado, te presentará un nuevo presupuesto.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span>Si llegan a acuerdo, el trabajo se realiza con normalidad y <strong className="text-foreground">NO se cobra la visita técnica</strong>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span>Si no llegan a acuerdo y el trabajo no se realiza, <strong className="text-foreground">se cobra la tarifa de visita técnica</strong> del perfil del experto.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span>También se cobra la visita técnica si <strong className="text-foreground">cancelas después de los 10 minutos</strong> de haber aceptado al experto.</span>
                </li>
              </ul>
            </div>

          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => { setShowTermsModal(false); setPendingPayload(null); }}
            >
              Cancelar
            </Button>
            <Button
              onClick={onAcceptTerms}

              className="fixgo-gradient font-bold text-white"
            >
              Acepto y continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SelfieCaptureModal
        open={showSelfieModal}
        onClose={() => { setShowSelfieModal(false); setPendingPayload(null); }}
        onCapture={submitWithSelfie}
        title="Selfie de Seguridad"
        description="Antes de publicar tu solicitud, necesitamos una foto tuya para verificación de identidad. Esta imagen se usa únicamente con fines de seguridad y se elimina automáticamente 5 días hábiles después de la captura."
      />
    </div>
  );
}
