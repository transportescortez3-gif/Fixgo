import { ArrowRight, Briefcase, CheckCircle2, Clock3, MapPin, MessageCircle } from "lucide-react";

type ActiveServiceQuickCardProps = {
  service: any;
  counterpartName?: string | null;
  onChat: () => void;
  onArrive?: () => void;
  arriving?: boolean;
  onStart?: () => void;
  starting?: boolean;
  onGoToJobs?: () => void;
};

/**
 * Resumen compacto del trabajo activo sobre el mapa.
 * Toda la tarjeta es un acceso rápido al chat; el botón solo hace explícita
 * la misma acción para que sea evidente en móvil.
 */
export default function ActiveServiceQuickCard({
  service,
  counterpartName,
  onChat,
  onArrive,
  arriving = false,
  onStart,
  starting = false,
  onGoToJobs,
}: ActiveServiceQuickCardProps) {
  if (!service) return null;
  const workStarted = Boolean(service.workStartedAt);
  const arrived = Boolean(service.workerArrivedAt);
  const autoStartAt = arrived
    ? new Date(new Date(service.workerArrivedAt).getTime() + 10 * 60_000)
    : null;
  const openCard = workStarted ? (onGoToJobs ?? onChat) : onChat;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openCard}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard();
        }
      }}
      className={`w-full text-left rounded-2xl border bg-card shadow-xl px-3 py-3 transition-transform active:scale-[0.98] ${
        workStarted
          ? "border-emerald-400/80 ring-2 ring-emerald-400/30 shadow-emerald-500/20 motion-safe:animate-pulse motion-reduce:animate-none"
          : "border-border/60"
      }`}
      aria-label={workStarted ? `Ir a Mis Trabajos: ${service.title}` : `Abrir chat del trabajo ${service.title}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-xl bg-primary/10 shrink-0">
          <Briefcase className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-foreground truncate">{service.title}</p>
          <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            workStarted
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : arrived
                ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                : "border-orange-500/40 bg-orange-500/10 text-orange-400"
          }`}>
            {workStarted
              ? <><CheckCircle2 className="w-3 h-3" /> Trabajo iniciado</>
              : arrived
                ? <><MapPin className="w-3 h-3" /> Experto llegó</>
                : <><Clock3 className="w-3 h-3" /> Esperando llegada</>}
          </span>
          {arrived && !workStarted && autoStartAt && (
            <p className="text-[11px] text-sky-300 mt-1">
              Inicio automático a las {autoStartAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {workStarted && service.workStartedAt && (
            <p className="text-[11px] text-emerald-300 mt-1">
              Iniciado a las {new Date(service.workStartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {service.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{service.description}</p>
          )}
          <p className="text-[11px] text-green-400 font-semibold mt-1">
            Propuesta: aceptada{counterpartName ? ` · ${counterpartName}` : ""}
          </p>
        </div>
        {workStarted ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              (onGoToJobs ?? onChat)();
            }}
            className="mt-1 inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 shrink-0"
          >
            Ir a Mis Trabajos <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChat();
            }}
            className="mt-1 p-2 rounded-xl bg-orange-500 text-white shrink-0 transition-transform active:scale-90"
            aria-label={`Abrir chat del trabajo ${service.title}`}
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        )}
      </div>
      {onArrive && !workStarted && !arrived && ["accepted", "in_progress"].includes(service.status) && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Se te darán 10 minutos para iniciar el trabajo. Si no lo inicias manualmente, se dará por iniciado automáticamente al finalizar el tiempo.
          </p>
          <button
            type="button"
            disabled={arriving}
            onClick={(event) => {
              event.stopPropagation();
              onArrive();
            }}
            className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            aria-label={`Llegué al domicilio: ${service.title}`}
          >
            <MapPin className="inline w-4 h-4 mr-1.5" />
            {arriving ? "Registrando llegada…" : "Llegué al domicilio"}
          </button>
        </div>
      )}
      {onStart && arrived && !workStarted && (
        <button
          type="button"
          disabled={starting}
          onClick={(event) => {
            event.stopPropagation();
            onStart();
          }}
          className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60"
        >
          {starting ? "Iniciando…" : "Iniciar trabajo"}
        </button>
      )}
      {workStarted && (
        <p role="status" className="mt-2 text-sm font-bold text-emerald-300">
          Para finalizar el trabajo, dirígete al perfil de Mis Trabajos.
        </p>
      )}
    </div>
  );
}