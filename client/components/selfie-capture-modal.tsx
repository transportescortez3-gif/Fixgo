import { useRef, useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { uploadFileToStorage } from "@/lib/storage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, ShieldCheck, RefreshCw, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { openBrowserGallery } from "@/components/photo-picker";
import { detectFace, warmUpFaceDetector } from "@/lib/face-detection";

interface SelfieCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (selfieUrl: string) => void;
  title?: string;
  description?: string;
  /** Si se pasa y no es "approved", se muestra una pantalla bloqueante en vez de la cámara */
  kycStatus?: string | null;
}

async function uploadFile(file: File): Promise<string> {
  return uploadFileToStorage(file);
}

type CameraState = "idle" | "starting" | "streaming" | "captured" | "error";

export function SelfieCaptureModal({ open, onClose, onCapture, title, description, kycStatus }: SelfieCaptureModalProps) {
  const [uploading, setUploading] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [faceError, setFaceError] = useState(false);
  const [checkingFace, setCheckingFace] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sourceChosen, setSourceChosen] = useState(false);
  const [introShown, setIntroShown] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streamReady, setStreamReady] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreamReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      setStreamReady(true);
      return;
    }
    setCameraState("starting");
    setFaceError(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      toast.error("Tu navegador no soporta acceso a la cámara");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setStreamReady(true);
    } catch (err: any) {
      setCameraState("error");
      if (err?.name === "NotAllowedError") {
        toast.error("Debes permitir el acceso a la cámara en tu navegador");
      } else if (err?.name === "NotFoundError") {
        toast.error("No se encontró ninguna cámara en tu dispositivo");
      }
    }
  }, []);

  // Enlazar el stream al elemento <video> cuando ambos están listos.
  // Este useEffect reintenta hasta que videoRef esté disponible (el Dialog tarda en montarse).
  useEffect(() => {
    if (!streamReady || !sourceChosen) return;
    let attempts = 0;
    const tryBind = () => {
      const stream = streamRef.current;
      if (!stream) return;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const v = videoRef.current;
        const onMeta = () => {
          v.play().then(() => setCameraState("streaming")).catch(() => setCameraState("error"));
        };
        v.onloadedmetadata = onMeta;
        // En algunos navegadores los metadatos ya están listos:
        if (v.readyState >= 1) onMeta();
        return;
      }
      attempts += 1;
      if (attempts < 30) requestAnimationFrame(tryBind);
    };
    tryBind();
  }, [streamReady, sourceChosen]);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0);
    ctx.restore();

    setCheckingFace(true);
    setFaceError(false);

    const faceResult = await detectFace(canvas);

    setCheckingFace(false);

    if (faceResult === "no-face") {
      setFaceError(true);
      return;
    }

    setFaceError(false);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedDataUrl(canvas.toDataURL("image/jpeg", 0.85));
          setCameraState("captured");
          stopCamera();
        }
      },
      "image/jpeg",
      0.85
    );
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCapturedBlob(null);
    setCapturedDataUrl(null);
    setFaceError(false);
    setCameraState("idle");
    startCamera();
  }, [startCamera]);

  const handleAccept = async () => {
    if (!capturedBlob) return;
    setUploading(true);
    try {
      const file = new File([capturedBlob], "selfie.jpg", { type: "image/jpeg" });
      const url = await uploadFile(file);
      onCapture(url);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo subir la selfie");
    } finally {
      setUploading(false);
    }
  };

  const handleNativeCapture = async () => {
    setUploading(true);
    try {
      const { Camera: CapCamera, CameraSource, CameraResultType, CameraDirection } = await import("@capacitor/camera");
      const photo = await CapCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        direction: CameraDirection.Front,
        saveToGallery: false,
        width: 1600,
        height: 1600,
        correctOrientation: true,
      });
      if (!photo.dataUrl) throw new Error("No se obtuvo imagen");

      const faceResult = await detectFace(photo.dataUrl);
      if (faceResult === "no-face") {
        toast.error("No se detectó un rostro. Toma una selfie donde se vea claramente tu cara.");
        return;
      }

      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "selfie.jpg", { type: blob.type || "image/jpeg" });
      const url = await uploadFile(file);
      onCapture(url);
    } catch (err: any) {
      if (err?.message !== "User cancelled photos app") {
        toast.error(err?.message || "No se pudo tomar la selfie");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      let faceResult: Awaited<ReturnType<typeof detectFace>>;
      try {
        faceResult = await detectFace(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      if (faceResult === "no-face") {
        toast.error("No se detectó un rostro en la imagen. Elige una foto donde se vea claramente tu cara.");
        return;
      }
      const url = await uploadFile(file);
      onCapture(url);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  }, [onCapture]);

  // El startCamera ya se llama directamente en el gesto del usuario (onCamera),
  // requisito de iOS Safari para getUserMedia. No usar useEffect aquí.

  useEffect(() => {
    if (open) {
      warmUpFaceDetector();
      if (!Capacitor.isNativePlatform()) {
        setIntroShown(true);
        setSheetOpen(false);
        setSourceChosen(false);
      }
    } else {
      stopCamera();
      setCameraState("idle");
      setCapturedBlob(null);
      setCapturedDataUrl(null);
      setFaceError(false);
      setSheetOpen(false);
      setSourceChosen(false);
      setIntroShown(false);
    }
    return () => {
      if (!open) stopCamera();
    };
  }, [open, stopCamera]);

  // Capa defensiva: si se exige KYC y el usuario no está aprobado, bloqueamos antes de la cámara
  if (kycStatus !== undefined && kycStatus !== null && kycStatus !== "approved") {
    const kycMessage =
      kycStatus === "pending"
        ? "Tu verificación de identidad (KYC) está en revisión. Espera la aprobación para enviar propuestas."
        : kycStatus === "rejected"
        ? "Tu verificación de identidad (KYC) fue rechazada. Vuelve a enviar tus documentos desde Perfil."
        : "Aún no has completado tu verificación de identidad (KYC). Debes hacerlo antes de enviar propuestas.";
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Identidad no verificada
            </DialogTitle>
            <DialogDescription>{kycMessage}</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-foreground">
              Para garantizar la seguridad de los clientes, todos los especialistas deben tener su identidad verificada antes de tomar trabajos.
            </div>
            <Button
              className="w-full fixgo-gradient text-white font-bold h-12"
              onClick={() => { onClose(); window.location.href = "/kyc"; }}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              {kycStatus === "rejected" ? "Reenviar documentos" : kycStatus === "pending" ? "Ver estado de mi KYC" : "Completar verificación"}
            </Button>
            <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!Capacitor.isNativePlatform()) {
    return (
      <>
        <Dialog open={open && introShown} onOpenChange={(v) => { if (!v) { setIntroShown(false); onClose(); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                {title || "Foto de Seguridad"}
              </DialogTitle>
              <DialogDescription>
                {description || "Por seguridad, necesitamos una selfie donde se vea claramente tu rostro. Esta imagen es solo para verificación de identidad."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="bg-muted/40 rounded-xl border p-4 text-center text-sm text-muted-foreground space-y-1">
                <Camera className="w-8 h-8 mx-auto text-primary/60 mb-2" />
                <p className="font-medium text-foreground">Verifica tu identidad</p>
                <p className="text-xs">A continuación podrás elegir entre tomar la foto con la cámara o seleccionar una imagen de tu galería.</p>
              </div>
              <Button
              className="w-full fixgo-gradient text-white font-bold h-12"
                onClick={() => { setIntroShown(false); setSheetOpen(true); }}
              >
                <Camera className="w-4 h-4 mr-2" />Tomar Selfie
              </Button>
              <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => { setIntroShown(false); onClose(); }}>
                Cancelar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <PhotoSourceSheet
          open={sheetOpen && open}
          onClose={() => { setSheetOpen(false); onClose(); }}
          onCamera={() => {
            // CRÍTICO: invocar startCamera dentro del mismo gesto del usuario
            // (iOS Safari rechaza getUserMedia si se llama desde un useEffect/setTimeout)
            setSheetOpen(false);
            setSourceChosen(true);
            startCamera();
          }}
          onGallery={() => {
            setSheetOpen(false);
            setSourceChosen(true);
            openBrowserGallery(handleGalleryFile);
          }}
        />

        <Dialog open={open && sourceChosen} onOpenChange={(v) => { if (!v) { stopCamera(); onClose(); } }}>
          <DialogContent className="max-w-sm p-0 overflow-hidden">
            <div className="relative bg-black">
              {(cameraState === "starting" || cameraState === "idle") && !uploading && (
                <div className="w-full aspect-[4/3] flex items-center justify-center bg-black">
                  <div className="text-center space-y-2">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                    <p className="text-white text-xs">Iniciando cámara...</p>
                  </div>
                </div>
              )}

              {uploading && (
                <div className="w-full aspect-[4/3] flex items-center justify-center bg-zinc-900">
                  <div className="text-center space-y-2">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                    <p className="text-white text-xs">Subiendo imagen...</p>
                  </div>
                </div>
              )}

              {cameraState === "error" && (
                <div className="w-full aspect-[4/3] flex items-center justify-center bg-zinc-900">
                  <div className="text-center space-y-3 px-6">
                    <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
                    <p className="text-white text-sm font-semibold">No se pudo acceder a la cámara</p>
                    <p className="text-zinc-400 text-xs">Por favor permite el acceso a la cámara en tu navegador.</p>
                    <Button size="sm" onClick={startCamera} className="mt-2">
                      <RefreshCw className="w-3 h-3 mr-1" /> Reintentar
                    </Button>
                  </div>
                </div>
              )}

              <video
                ref={videoRef}
                className="w-full aspect-[4/3] object-cover"
                playsInline
                muted
                style={{
                  display: cameraState === "streaming" ? "block" : "none",
                  transform: "scaleX(-1)",
                }}
              />

              {cameraState === "streaming" && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    style={{
                      width: 160,
                      height: 200,
                      borderRadius: "50%",
                      border: faceError ? "3px solid #ef4444" : "3px solid #2563EB",
                      boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
                      transition: "border-color 0.2s",
                    }}
                  />
                </div>
              )}

              {cameraState === "captured" && capturedDataUrl && (
                <img src={capturedDataUrl} alt="Selfie capturada" className="w-full aspect-[4/3] object-cover" />
              )}

              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="px-4 pt-3 pb-5 space-y-3 bg-background">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs font-semibold text-foreground">
                  {title || "Foto de Seguridad"}
                </p>
              </div>

              {cameraState === "streaming" && (
                <>
                  {faceError && (
                    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive font-medium">
                        No se detectó un rostro. Centra tu cara en el óvalo.
                      </p>
                    </div>
                  )}
                  {!faceError && (
                    <p className="text-xs text-muted-foreground text-center">
                      Centra tu rostro en el óvalo y presiona el botón
                    </p>
                  )}
                  <Button
                    className="w-full fixgo-gradient text-white font-bold h-12"
                    onClick={capture}
                    disabled={checkingFace}
                  >
                    {checkingFace
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verificando...</>
                      : <><Camera className="w-4 h-4 mr-2" />Capturar</>}
                  </Button>
                </>
              )}

              {cameraState === "captured" && (
                <>
                  <p className="text-xs text-green-500 font-semibold text-center flex items-center justify-center gap-1">
                    <Check className="w-4 h-4" /> Selfie capturada correctamente
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-11 text-sm" onClick={retake} disabled={uploading}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Reintentar
                    </Button>
                    <Button
                    className="flex-[2] fixgo-gradient text-white font-bold h-11 text-sm"
                      onClick={handleAccept}
                      disabled={uploading}
                    >
                      {uploading
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Subiendo...</>
                        : <><Check className="w-4 h-4 mr-1" />Usar esta foto</>}
                    </Button>
                  </div>
                </>
              )}

              {(cameraState === "starting" || cameraState === "idle" || cameraState === "error") && !uploading && (
                <p className="text-xs text-muted-foreground text-center">
                  {description || "Se usa únicamente con fines de seguridad y se elimina automáticamente 5 días hábiles después de la captura."}
                </p>
              )}

              <Button variant="ghost" className="w-full text-xs text-muted-foreground h-8" onClick={() => { stopCamera(); onClose(); }}>
                Cancelar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {title || "Foto de Seguridad"}
          </DialogTitle>
          <DialogDescription>
            {description || "Por seguridad, necesitamos una selfie donde se vea claramente tu rostro."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <div className="bg-muted/40 rounded-xl border p-4 text-center text-sm text-muted-foreground space-y-1">
            <Camera className="w-8 h-8 mx-auto text-primary/60 mb-2" />
            <p className="font-medium text-foreground">Verifica tu identidad</p>
            <p className="text-xs">La cámara frontal se abrirá. Asegúrate de que tu rostro sea visible y bien iluminado.</p>
          </div>
          <Button
            className="w-full fixgo-gradient text-white font-bold h-12"
            disabled={uploading}
            onClick={handleNativeCapture}
          >
            {uploading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Subiendo...</>
              : <><Camera className="w-4 h-4 mr-2" />Tomar Selfie</>}
          </Button>
          <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
