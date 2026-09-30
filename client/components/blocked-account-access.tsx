import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, LifeBuoy, LockKeyhole, Pencil } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface BlockedAccountAccessProps {
  blockedUntil?: string | null;
  onExpired?: () => void;
}

function getRemainingSeconds(blockedUntil?: string | null): number | null {
  if (!blockedUntil) return null;
  return Math.max(0, Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / 1000));
}

function formatRemaining(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days} día${days === 1 ? "" : "s"} ${hours} hora${hours === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

export function BlockedAccountBanner({ blockedUntil, onExpired }: BlockedAccountAccessProps) {
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(blockedUntil));
  const expiredNotified = useRef(false);

  useEffect(() => {
    expiredNotified.current = false;
    const update = () => {
      const next = getRemainingSeconds(blockedUntil);
      setRemaining(next);
      if (next === 0 && blockedUntil && !expiredNotified.current) {
        expiredNotified.current = true;
        onExpired?.();
        // The server scheduler and this browser timer can hit the boundary a
        // few milliseconds apart. Retry periodically until /auth/me confirms
        // that the account has been reactivated.
        window.setTimeout(() => {
          expiredNotified.current = false;
        }, 5000);
      }
    };
    update();
    if (!blockedUntil) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil, onExpired]);

  return (
    <div className="w-full border-b-2 border-red-500/50 bg-red-950/40 px-4 py-4 text-red-50 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <span className="mt-0.5 text-2xl" aria-hidden="true">⚠️</span>
        <div className="min-w-0">
          <p className="text-base font-extrabold uppercase tracking-wide sm:text-lg">Cuenta bloqueada</p>
          {blockedUntil ? (
            <p className="mt-1 text-sm font-medium sm:text-base">
              Te quedan: <strong className="font-extrabold tabular-nums">{remaining === null ? "calculando..." : formatRemaining(remaining)}</strong> para que se desbloquee sola.
            </p>
          ) : (
            <p className="mt-1 text-sm font-medium sm:text-base">Hasta nuevo aviso.</p>
          )}
          <p className="mt-1 text-xs text-red-100/80">Mientras tanto, solo puedes editar tu perfil o contactar a Soporte.</p>
        </div>
      </div>
    </div>
  );
}

export function BlockedAccountHome({ blockedUntil }: BlockedAccountAccessProps) {
  const remainingLabel = useMemo(() => {
    const seconds = getRemainingSeconds(blockedUntil);
    return seconds === null ? "Hasta nuevo aviso" : `Desbloqueo automático en ${formatRemaining(seconds)}`;
  }, [blockedUntil]);

  return (
    <div className="flex min-h-full items-start justify-center bg-background px-4 py-8 sm:items-center">
      <div className="w-full max-w-xl rounded-2xl border border-red-500/30 bg-card p-6 text-center shadow-xl sm:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <LockKeyhole className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-red-400 sm:text-3xl">⚠️ Cuenta bloqueada</h1>
        <p className="mt-3 text-base text-foreground">{remainingLabel}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Tu cuenta está en modo restringido. No puedes publicar, buscar, enviar mensajes, aceptar trabajos ni ver ofertas mientras dure el bloqueo.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg" variant="outline" className="h-12 gap-2 border-primary/40">
            <Link href="/profile">
              <Pencil className="h-4 w-4" /> Editar mi perfil
            </Link>
          </Button>
          <Button asChild size="lg" className="h-12 gap-2 fixgo-gradient font-bold text-white">
            <Link href="/support">
              <LifeBuoy className="h-4 w-4" /> Ir a Soporte
            </Link>
          </Button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          El desbloqueo se aplica automáticamente desde el servidor.
        </div>
      </div>
    </div>
  );
}