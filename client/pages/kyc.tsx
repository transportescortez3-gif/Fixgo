import { useEffect, useState, useRef } from "react";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getGetMeQueryKey, useGetKycStatus, useSubmitKyc } from "@/api";
import { uploadFileToStorage } from "@/lib/storage";
import { openBrowserCamera, openBrowserGallery } from "@/components/photo-picker";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2, ShieldCheck, Clock, XCircle, Upload, Camera, CreditCard, User, CheckCircle2, AlertTriangle, Car, FileText,
} from "lucide-react";

function formatRut(value: string): string {
  let clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length > 9) clean = clean.slice(0, 9);
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

function FileUploadBox({
  label,
  icon: Icon,
  description,
  value,
  onChange,
  uploading,
  captureMode = "environment",
}: {
  label: string;
  icon: React.ElementType;
  description: string;
  value: string;
  onChange: (path: string) => void;
  uploading: boolean;
  captureMode?: "user" | "environment";
}) {
  const [localUploading, setLocalUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const cooldownRef = useRef(false);

  const handleFile = async (file: File) => {
    // Cierra la hoja antes de validar/subir para que nunca quede sobre el toast.
    setSheetOpen(false);
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen no puede superar 10MB");
      return;
    }

    setLocalUploading(true);
    try {
      const objectPath = await uploadFileToStorage(file);
      onChange(objectPath);
      toast.success(`${label} subida correctamente`);
      // Bloquear re-apertura por 800ms para ignorar taps residuales nativos
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 800);
    } catch (err) {
      console.error("KYC image upload failed", err);
      toast.error(err instanceof Error && err.message ? err.message : "Error al subir la imagen");
    } finally {
      setLocalUploading(false);
    }
  };

  const handleNativeCapture = async () => {
    const { Camera, CameraSource, CameraResultType, CameraDirection } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      promptLabelHeader: "Foto",
      promptLabelPhoto: "Desde Fotos",
      promptLabelPicture: "Tomar foto",
      promptLabelCancel: "Cancelar",
      direction: captureMode === "user" ? CameraDirection.Front : CameraDirection.Rear,
      saveToGallery: false,
      width: 1920,
      height: 1920,
      correctOrientation: true,
    });
    if (!photo.dataUrl) return;
    const res = await fetch(photo.dataUrl);
    const blob = await res.blob();
    handleFile(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
  };

  const openPicker = () => {
    if (isLoading || cooldownRef.current) return;
    if (Capacitor.isNativePlatform()) {
      handleNativeCapture().catch(console.error);
    } else {
      setSheetOpen(true);
    }
  };

  const isUploaded = !!value;
  const isLoading = localUploading || uploading;

  return (
    <>
      <div
        onClick={openPicker}
        className={`relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center ${
          isUploaded
            ? "border-green-500/50 bg-green-500/5"
            : "border-border/50 hover:border-primary/50 hover:bg-primary/5"
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          ) : isUploaded ? (
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          ) : (
            <Icon className="w-8 h-8 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isUploaded ? "✓ Imagen cargada" : description}
            </p>
          </div>
        </div>
      </div>
      <PhotoSourceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCamera={() => { flushSync(() => setSheetOpen(false)); openBrowserCamera(captureMode, handleFile); }}
        onGallery={() => { flushSync(() => setSheetOpen(false)); openBrowserGallery(handleFile); }}
      />
    </>
  );
}

export default function KycPage() {
  const { user, isFletes } = useAuth();
  const queryClient = useQueryClient();
  const { data: kycStatus, isLoading, refetch } = useGetKycStatus();
  const submitKyc = useSubmitKyc();

  const [documentType, setDocumentType] = useState<"cedula" | "licencia">("cedula");
  const [rut, setRut] = useState("");
  const [fullName, setFullName] = useState(user?.name || "");
  const [cedulaFrontPath, setCedulaFrontPath] = useState("");
  const [cedulaBackPath, setCedulaBackPath] = useState("");
  const [selfiePath, setSelfiePath] = useState("");
  const [antecedentesPath, setAntecedentesPath] = useState("");
  const [, setLocation] = useLocation();

  const docLabel = documentType === "cedula" ? "Cédula de Identidad" : "Licencia de Conducir";
  const docLabelShort = documentType === "cedula" ? "Cédula" : "Licencia";
  const docIcon = documentType === "cedula" ? CreditCard : Car;
  const status = (kycStatus as any)?.status || "not_submitted";

  useEffect(() => {
    if (status === "approved") {
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    }
  }, [queryClient, status]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div className="max-w-lg mx-auto p-4 mt-8">
        <Card className="border-green-500/30">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-20 h-20 bg-green-500/15 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Identidad Verificada</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tu documento de identidad fue verificado exitosamente. Ya puedes aceptar trabajos.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-400 px-4 py-2 rounded-full text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Trabajador Verificado
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="max-w-lg mx-auto p-4 mt-8">
        <Card className="border-amber-500/30">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-20 h-20 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-10 h-10 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Verificación en Proceso</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tus documentos están siendo revisados por nuestro equipo. Te notificaremos cuando el proceso se complete.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 px-4 py-2 rounded-full text-sm font-semibold">
              <Clock className="w-4 h-4" />
              Pendiente de Revisión
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              RUT: {(kycStatus as any)?.rut}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isRejected = status === "rejected";

  const handleSubmit = async () => {
    if (!rut || rut.length < 9) {
      toast.error("Ingresa un RUT válido");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Ingresa tu nombre completo");
      return;
    }
    if (!cedulaFrontPath || !cedulaBackPath || !selfiePath || !antecedentesPath) {
      toast.error("Debes subir las 4 imágenes requeridas");
      return;
    }

    try {
      await submitKyc.mutateAsync({
        data: { documentType, rut, fullName, cedulaFrontPath, cedulaBackPath, selfiePath, antecedentesPath },
      });
      toast.success("¡Documentos enviados! Te notificaremos cuando sean revisados.");
      setLocation("/");
    } catch (err: any) {
      toast.error(err?.message || "Error al enviar documentos");
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 py-8">
      <Card className="border-primary/20">
        <CardHeader className="space-y-2 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Verificación de Identidad</CardTitle>
          <CardDescription>
            Para trabajar en Fixgo necesitamos verificar tu identidad con un documento oficial chileno
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isRejected && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">Verificación Rechazada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(kycStatus as any)?.rejectionReason || "Tus documentos no pudieron ser verificados. Intenta nuevamente."}
                </p>
              </div>
            </div>
          )}

          {/* Tipo de documento: Fletes pide cédula + licencia; Expertos solo cédula */}
          {isFletes ? (
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: "cedula", icon: CreditCard, label: "Cédula de Identidad" },
                  { type: "licencia", icon: Car, label: "Licencia de Conducir" },
                ] as const).map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setDocumentType(type); setCedulaFrontPath(""); setCedulaBackPath(""); setSelfiePath(""); setAntecedentesPath(""); }}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      documentType === type
                        ? "border-primary bg-primary/10"
                        : "border-border/50 hover:border-primary/30"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${documentType === type ? "text-primary" : "text-muted-foreground"}`} />
                    <p className={`text-xs font-semibold text-center leading-tight ${documentType === type ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <CreditCard className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Cédula de Identidad</p>
                <p className="text-xs text-muted-foreground">Documento requerido para FIXGO Expertos</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rut">RUT</Label>
            <Input
              id="rut"
              placeholder="12.345.678-9"
              value={rut}
              onChange={(e) => setRut(formatRut(e.target.value))}
              maxLength={12}
            />
            <p className="text-xs text-muted-foreground">Ingresa tu RUT sin puntos ni guión, se formatea automáticamente</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo (como aparece en {documentType === "cedula" ? "la cédula" : "la licencia"})</Label>
            <Input
              id="fullName"
              placeholder="Juan Andrés Pérez González"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          {/* 4 fotos requeridas */}
          <div className="space-y-3">
            <Label>Documentos requeridos <span className="text-xs text-muted-foreground font-normal">(4 fotos)</span></Label>
            <div className="grid gap-3">
              <FileUploadBox
                label={`${docLabelShort} Frontal`}
                icon={docIcon}
                description={`Foto del frente de tu ${docLabel.toLowerCase()}`}
                value={cedulaFrontPath}
                onChange={setCedulaFrontPath}
                uploading={false}
              />
              <FileUploadBox
                label={`${docLabelShort} Trasera`}
                icon={docIcon}
                description={`Foto del reverso de tu ${docLabel.toLowerCase()}`}
                value={cedulaBackPath}
                onChange={setCedulaBackPath}
                uploading={false}
              />
              <FileUploadBox
                label={`Selfie con ${docLabelShort}`}
                icon={Camera}
                description={`Tómate una selfie sosteniendo tu ${docLabel.toLowerCase()}`}
                value={selfiePath}
                onChange={setSelfiePath}
                uploading={false}
                captureMode="user"
              />
              <FileUploadBox
                label="Antecedentes Penales"
                icon={FileText}
                description="Foto o escáner del certificado de antecedentes (puede obtenerse en www.registrocivil.cl)"
                value={antecedentesPath}
                onChange={setAntecedentesPath}
                uploading={false}
              />
            </div>
          </div>

          <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Importante:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Las fotos deben ser claras y legibles</li>
              <li>La selfie debe mostrar tu rostro junto a {documentType === "cedula" ? "la cédula" : "la licencia"}</li>
              <li>El certificado de antecedentes debe ser vigente</li>
              <li>La revisión puede tomar hasta 24 horas</li>
            </ul>
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full fixgo-gradient font-bold text-white h-12 text-base"
            disabled={submitKyc.isPending || !rut || !fullName || !cedulaFrontPath || !cedulaBackPath || !selfiePath || !antecedentesPath}
          >
            {submitKyc.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar para Verificación
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
