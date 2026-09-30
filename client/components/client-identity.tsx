import { Star } from "lucide-react";

type ClientIdentityProps = {
  name?: string | null;
  score?: number | null;
  variant?: "modal" | "request";
  className?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "CL";
}

export function ClientIdentity({
  name,
  score,
  variant = "request",
  className = "",
}: ClientIdentityProps) {
  const displayName = name?.trim() || "Cliente";
  const isModal = variant === "modal";

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <div
        className={`flex items-center justify-center rounded-full shrink-0 font-black ${
          isModal ? "w-9 h-9 text-xs" : "w-7 h-7 text-[10px]"
        }`}
        style={isModal
          ? {
              background: "rgba(26,140,248,0.18)",
              color: "#60a5fa",
              border: "1.5px solid rgba(96,165,250,0.2)",
            }
          : undefined}
      >
        {initials(displayName)}
      </div>
      <div className="min-w-0 leading-tight">
        <p className={`font-bold truncate ${isModal ? "text-sm text-white" : "text-[11px] text-foreground"}`}>
          {displayName}
        </p>
        <div className={`flex items-center gap-1 mt-0.5 ${isModal ? "text-white/55" : "text-muted-foreground"}`}>
          <Star className={`fill-amber-400 text-amber-400 ${isModal ? "w-3 h-3" : "w-2.5 h-2.5"}`} />
          <span className={`${isModal ? "text-[10px]" : "text-[10px]"} font-medium`}>
            {score != null ? `${score.toFixed(1)} · Buena convivencia` : "Sin calificaciones"}
          </span>
        </div>
      </div>
    </div>
  );
}