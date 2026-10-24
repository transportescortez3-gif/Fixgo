import { Link } from "wouter";
import { CheckCircle2, Circle, AlertCircle, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
  required?: boolean;
}

interface WorkerOnboardingProps {
  user: {
    avatarUrl?: string | null;
    bio?: string | null;
    skills?: string | null;
    categoryId?: number | null;
    serviceRadius?: number | null;
    kycStatus?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
}

export default function WorkerOnboarding({ user }: WorkerOnboardingProps) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("fixgo_onboarding_dismissed") === "1";
  });

  const steps: OnboardingStep[] = [
    {
      id: "avatar",
      label: "Foto de perfil",
      description: "Sube una foto para que los clientes te reconozcan. Es obligatorio.",
      href: "/profile",
      done: !!user.avatarUrl,
      required: true,
    },
    {
      id: "bio",
      label: "Descripción personal",
      description: "Cuéntales a los clientes quién eres y qué haces.",
      href: "/profile",
      done: !!(user.bio && user.bio.trim().length > 10),
    },
    {
      id: "skills",
      label: "Habilidades y especialidades",
      description: "Agrega tus oficios y servicios que ofreces.",
      href: "/profile",
      done: !!(user.categoryId || (user.skills && user.skills.trim().length > 0)),
    },
    {
      id: "location",
      label: "Ubicación actualizada",
      description: "Actualiza tu ubicación para aparecer en búsquedas cercanas.",
      href: "/profile",
      done: !!(user.lat && user.lng),
    },
    {
      id: "kyc",
      label: "Verificación de identidad (KYC)",
      description: "Verifica tu identidad para desbloquear propuestas de trabajo.",
      href: "/kyc",
      done: user.kycStatus === "approved",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const avatarDone = !!user.avatarUrl;

  if (dismissed || allDone) return null;

  const canDismiss = avatarDone;

  const handleDismiss = () => {
    if (!canDismiss) return;
    localStorage.setItem("fixgo_onboarding_dismissed", "1");
    setDismissed(true);
  };

  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className={`rounded-xl border bg-card p-4 pt-4 space-y-4 relative shadow-xl ${!avatarDone ? "border-destructive/50" : "border-border"}`}>
      {!avatarDone && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs font-semibold text-destructive">
            Debes subir tu foto de perfil para comenzar a recibir solicitudes.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-foreground">Completa tu perfil profesional</span>
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {completedCount}/{steps.length}
          </span>
          {canDismiss && (
            <button
              onClick={handleDismiss}
              className="ml-auto p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Completa estos pasos para recibir más solicitudes y generar confianza.
        </p>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <Link key={step.id} href={step.href}>
            <div className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors cursor-pointer ${step.done ? "opacity-60" : step.required && !step.done ? "hover:bg-destructive/10 bg-destructive/5" : "hover:bg-primary/10"}`}>
              {step.done ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              ) : step.required ? (
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : step.required && !step.done ? "text-destructive" : "text-foreground"}`}>
                  {step.label}{step.required && !step.done && " *"}
                </p>
                {!step.done && (
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {canDismiss && completedCount >= 3 && (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleDismiss}>
          Ya lo completaré después
        </Button>
      )}
    </div>
  );
}
