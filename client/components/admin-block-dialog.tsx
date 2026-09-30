import { useEffect, useState } from "react";
import { Clock, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AdminBlockDuration = "24h" | "7d" | "30d" | "indefinite";

export interface AdminBlockTarget {
  id: number;
  name: string;
}

const durationOptions: Array<{
  value: AdminBlockDuration;
  title: string;
  description: string;
}> = [
  { value: "24h", title: "24 horas", description: "Se desbloquea automáticamente al cumplirse un día." },
  { value: "7d", title: "7 días", description: "Se desbloquea automáticamente al cumplirse una semana." },
  { value: "30d", title: "30 días", description: "Se desbloquea automáticamente al cumplirse un mes." },
  { value: "indefinite", title: "Sin fecha de término", description: "Permanece bloqueada hasta que un administrador la desbloquee." },
];

interface AdminBlockDialogProps {
  target: AdminBlockTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AdminBlockDialog({ target, open, onOpenChange, onSuccess }: AdminBlockDialogProps) {
  const [duration, setDuration] = useState<AdminBlockDuration>("24h");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setDuration("24h");
  }, [open, target?.id]);

  const handleSubmit = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("fixgo_token") || localStorage.getItem("fixxer_token");
      const response = await fetch(`/api/admin/users/${target.id}/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ duration }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo bloquear la cuenta");

      toast.success(`Cuenta bloqueada por ${durationOptions.find((option) => option.value === duration)?.title}`);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo bloquear la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-destructive" />
            ¿Bloquear a {target?.name}?
          </DialogTitle>
          <DialogDescription>
            Selecciona cuánto tiempo durará el bloqueo. La cuenta no podrá iniciar sesión ni operar mientras esté bloqueada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2" role="radiogroup" aria-label="Duración del bloqueo">
          {durationOptions.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                duration === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="admin-block-duration"
                value={option.value}
                checked={duration === option.value}
                onChange={() => setDuration(option.value)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {option.value === "indefinite" ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  {option.title}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting || !target}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar bloqueo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}