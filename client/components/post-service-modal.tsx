import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, UserPlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface PostServiceModalProps {
  open: boolean;
  onClose: () => void;
  counterpartId: number;
  counterpartName: string;
  serviceId: number;
}

type Step = "favorite" | "review";

export function PostServiceModal({ open, onClose, counterpartId, counterpartName, serviceId }: PostServiceModalProps) {
  const { isClient, isWorker } = useAuth();
  const [step, setStep] = useState<Step>("favorite");
  const [loading, setLoading] = useState(false);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const label = isClient ? "Técnico de Confianza" : "Cliente de Confianza";

  const handleClose = () => {
    setStep("favorite");
    setReviewStars(5);
    setReviewComment("");
    onClose();
  };

  const addFavorite = async () => {
    setLoading(true);
    try {
      const tipoRelacion = isClient ? "cliente_a_experto" : "experto_a_cliente";
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ vinculadoId: counterpartId, tipoRelacion }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success(
        isClient
          ? `${counterpartName} agregado a tus Técnicos de Confianza`
          : `${counterpartName} agregado a tus Clientes de Confianza`
      );
    } catch {
      toast.error("No se pudo agregar");
    } finally {
      setLoading(false);
      setStep("review");
    }
  };

  const skipFavorite = () => {
    setStep("review");
  };

  const submitReview = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("fixgo_token");
      const endpoint = isClient ? "/api/reviews" : "/api/reviews/rate-client";
      const body = isClient
        ? { workerId: counterpartId, serviceId, rating: reviewStars, comment: reviewComment }
        : { clientId: counterpartId, serviceId, rating: reviewStars, comment: reviewComment };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${res.status}`);
      }
      toast.success("¡Gracias por tu calificación!");
    } catch (err: any) {
      toast.error(err?.message || "Error al enviar la calificación");
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        {step === "favorite" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <UserPlus className="w-5 h-5 text-primary" />
                ¿Agregar como {label}?
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                ¿Te gustó trabajar con <strong className="text-foreground">{counterpartName}</strong>? Puedes guardarlo para futuras solicitudes directas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Button
                className="w-full gap-2 fixgo-gradient font-bold text-white"
                onClick={addFavorite}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Agregar como {label}
              </Button>

              <Button
                variant="outline"
                className="w-full gap-2 text-muted-foreground"
                onClick={skipFavorite}
              >
                <X className="w-4 h-4" />
                Omitir por ahora
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Star className="w-5 h-5 text-yellow-400" />
                Califica tu experiencia
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                ¿Cómo estuvo el trabajo con <strong className="text-foreground">{counterpartName}</strong>?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewStars(star)}
                    className="p-1 transition-transform active:scale-90"
                  >
                    <Star
                      className={`w-9 h-9 transition-colors ${reviewStars >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/40"}`}
                    />
                  </button>
                ))}
              </div>

              <Textarea
                placeholder="Cuéntanos brevemente tu experiencia... (opcional)"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 text-muted-foreground"
                  onClick={handleClose}
                >
                  Omitir
                </Button>
                <Button
                className="flex-1 fixgo-gradient font-bold text-white"
                  onClick={submitReview}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Calificar
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
