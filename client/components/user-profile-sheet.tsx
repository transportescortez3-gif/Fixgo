import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { customFetch } from "@/api/custom-fetch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft, BadgeCheck, MessageSquare, ShieldCheck, Star, Loader2,
  MapPin, Calendar, Wrench, ThumbsUp, Clock,
} from "lucide-react";

interface UserProfileSheetProps {
  userId: number | null;
  open: boolean;
  onClose: () => void;
  onOpenChat?: () => void;
}

function formatCLP(n: number) {
  return "$" + n.toLocaleString("es-CL");
}

export function UserProfileSheet({ userId, open, onClose, onOpenChat }: UserProfileSheetProps) {
  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/users", userId],
    queryFn: () => customFetch(`/api/users/${userId}`),
    enabled: open && !!userId,
    staleTime: 60_000,
  });

  const { data: reviews } = useQuery<any[]>({
    queryKey: ["/api/reviews/worker", userId],
    queryFn: () => customFetch(`/api/reviews/worker/${userId}`),
    enabled: open && !!userId && profile?.role === "worker",
    staleTime: 60_000,
  });

  if (!open) return null;

  const name = profile?.name ?? "";
  const isWorker = profile?.role === "worker";
  const avatarUrl = profile?.avatarUrl;
  const bio = profile?.bio;
  const skillsRaw: string = profile?.skills ?? "";
  const skills = skillsRaw ? skillsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  const rating = profile?.rating ? parseFloat(profile.rating) : null;
  const totalReviews = profile?.totalReviews ?? 0;
  const isKycVerified = profile?.kycVerified === true || profile?.kyc_verified === true;
  const subscriptionPlan = profile?.subscriptionPlan;
  const isAvailable = profile?.isAvailable;
  const visitFee = profile?.visitFee ? parseInt(profile.visitFee, 10) : null;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("es-CL", { year: "numeric", month: "long" })
    : null;
  const reviewList = Array.isArray(reviews) ? reviews.slice(0, 3) : [];
  const recommendsCount = reviewList.filter((r: any) => r.recommends === true).length;
  const recommendsPct = reviewList.length > 0 ? Math.round((recommendsCount / reviewList.length) * 100) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
      style={{ background: "hsl(220 15% 5%)", animation: "slideInRight 0.28s cubic-bezier(0.32,0.72,0,1)" }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div
        className="flex items-center gap-3 px-2 py-2 flex-shrink-0"
        style={{
          background: "hsl(218 25% 9%)",
          borderBottom: "1px solid hsl(218 12% 13%)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 8px)",
        }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-white/5 transition-all active:scale-90 flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="font-semibold text-[15px] text-foreground">Perfil</p>
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
            No se pudo cargar el perfil
          </div>
        ) : (
          <>
            {/* ── HERO ── */}
            <div
              className="relative flex flex-col items-center pt-10 pb-7 px-6 gap-4"
              style={{
                background: "linear-gradient(180deg, hsl(213 60% 10%) 0%, hsl(220 15% 5%) 100%)",
                borderBottom: "1px solid hsl(218 12% 13%)",
              }}
            >
              {/* Avatar */}
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #60c8ff44 0%, #1a8cf844 100%)",
                    transform: "scale(1.12)",
                    filter: "blur(10px)",
                  }}
                />
                <Avatar className="relative w-28 h-28 border-[3px] border-primary/40 shadow-2xl">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-4xl font-black bg-primary/20 text-primary">
                    {name.charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                {isKycVerified && (
                  <div
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 shadow"
                    style={{ background: "hsl(213 100% 55%)", borderColor: "hsl(220 15% 5%)" }}
                  >
                    <BadgeCheck className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>

              {/* Nombre y rol */}
              <div className="text-center">
                <h2 className="text-2xl font-black text-foreground leading-tight flex items-center justify-center gap-2">
                  {name || "Usuario"}
                </h2>
                {isWorker && (
                  <p className="text-sm font-medium mt-0.5" style={{ color: "hsl(213 80% 65%)" }}>
                    Profesional verificado en Fixgo
                  </p>
                )}
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 justify-center">
                {isKycVerified && (
                  <span
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border"
                    style={{ color: "hsl(213 100% 70%)", background: "hsl(213 100% 55% / 0.12)", borderColor: "hsl(213 100% 55% / 0.30)" }}
                  >
                    <ShieldCheck className="w-3 h-3" /> Identidad verificada
                  </span>
                )}
                {subscriptionPlan && (
                  <span
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                    style={subscriptionPlan === "pro_plus"
                      ? { color: "#a78bfa", background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.30)" }
                      : { color: "#1a8cf8", background: "rgba(26,140,248,0.12)", borderColor: "rgba(26,140,248,0.30)" }
                    }
                  >
                    {subscriptionPlan === "pro_plus" ? "⭐ Pro+" : "Pro"}
                  </span>
                )}
                {isWorker && isAvailable && (
                  <span
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border"
                    style={{ color: "hsl(142 70% 55%)", background: "hsl(142 60% 20% / 0.25)", borderColor: "hsl(142 60% 35% / 0.35)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Disponible ahora
                  </span>
                )}
              </div>

              {/* Rating */}
              {rating !== null && rating > 0 && (
                <div
                  className="flex items-center gap-3 px-4 py-2.5 rounded-2xl"
                  style={{ background: "hsl(218 15% 11%)", border: "1px solid hsl(218 12% 17%)" }}
                >
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-white/8 text-white/8"}`}
                      />
                    ))}
                  </div>
                  <span className="text-base font-black text-amber-400">{rating.toFixed(1)}</span>
                  {totalReviews > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {totalReviews} {totalReviews === 1 ? "reseña" : "reseñas"}
                    </span>
                  )}
                  {recommendsPct !== null && recommendsPct >= 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "hsl(142 70% 55%)" }}>
                        <ThumbsUp className="w-3 h-3" /> {recommendsPct}% recomiendan
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── SECCIONES DE INFO ── */}
            <div className="space-y-0">

              {/* Bio */}
              {bio && (
                <div
                  className="px-5 py-4"
                  style={{ borderBottom: "1px solid hsl(218 12% 11%)" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Sobre mí</p>
                  <p className="text-sm text-foreground/85 leading-relaxed">{bio}</p>
                </div>
              )}

              {/* Tarifa de visita */}
              {isWorker && visitFee !== null && visitFee > 0 && (
                <div
                  className="px-5 py-4 flex items-center gap-3"
                  style={{ borderBottom: "1px solid hsl(218 12% 11%)" }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "hsl(213 100% 55% / 0.12)" }}
                  >
                    <MapPin className="w-4 h-4" style={{ color: "hsl(213 100% 65%)" }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tarifa de visita a domicilio</p>
                    <p className="text-sm font-bold text-foreground mt-0.5">{formatCLP(visitFee)} CLP</p>
                  </div>
                </div>
              )}

              {/* Habilidades */}
              {skills.length > 0 && (
                <div
                  className="px-5 py-4"
                  style={{ borderBottom: "1px solid hsl(218 12% 11%)" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Especialidades</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s, i) => (
                      <span
                        key={i}
                        className="text-[12px] font-medium px-3 py-1 rounded-full"
                        style={{ background: "hsl(218 15% 11%)", border: "1px solid hsl(218 12% 18%)", color: "hsl(210 20% 80%)" }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats fila */}
              <div
                className="grid grid-cols-2 divide-x"
                style={{ borderBottom: "1px solid hsl(218 12% 11%)", borderTop: "1px solid hsl(218 12% 11%)" }}
              >
                {memberSince && (
                  <div className="px-5 py-4 flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Miembro desde</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5 capitalize">{memberSince}</p>
                    </div>
                  </div>
                )}
                {isWorker && totalReviews > 0 && (
                  <div className="px-5 py-4 flex items-center gap-3">
                    <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reseñas</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{totalReviews} evaluaciones</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Reseñas recientes */}
              {reviewList.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Reseñas recientes</p>
                  <div className="space-y-3">
                    {reviewList.map((r: any) => (
                      <div
                        key={r.id}
                        className="rounded-2xl px-4 py-3"
                        style={{ background: "hsl(218 15% 9%)", border: "1px solid hsl(218 12% 14%)" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(i => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "fill-white/10 text-white/10"}`}
                              />
                            ))}
                          </div>
                          {r.recommends && (
                            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: "hsl(142 70% 55%)" }}>
                              <ThumbsUp className="w-2.5 h-2.5" /> Recomienda
                            </span>
                          )}
                        </div>
                        {r.comment && (
                          <p className="text-[13px] text-foreground/75 leading-relaxed line-clamp-3">{r.comment}</p>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Clock className="w-3 h-3 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground/50">
                            {new Date(r.createdAt).toLocaleDateString("es-CL", { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Padding bottom para que el footer no tape contenido */}
              <div className="h-4" />
            </div>
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      {onOpenChat && (
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
            borderTop: "1px solid hsl(218 12% 13%)",
            background: "hsl(218 25% 9%)",
          }}
        >
          <button
            onClick={() => { onClose(); onOpenChat(); }}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-[15px] active:scale-[0.98] transition-all text-white"
            style={{ background: "linear-gradient(135deg, #60c8ff 0%, #1a8cf8 40%, #0050d0 100%)" }}
          >
            <MessageSquare className="w-5 h-5" />
            Abrir Chat
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
