import { useAuth } from "@/hooks/use-auth";
import { useGetWorkerReviews } from "@/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, ArrowLeft, MessageSquareText } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Máximo de opiniones consideradas para la nota (debe calzar con RATING_WINDOW del server)
const RATING_WINDOW = 75;

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${s <= value ? "fill-[#f5a83c] text-[#f5a83c]" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export default function Valoraciones() {
  const { user } = useAuth();
  // El hook generado ya trae enabled: !!workerId (con 0 no consulta)
  const { data: reviews, isLoading } = useGetWorkerReviews(user?.id ?? 0);

  const list: any[] = Array.isArray(reviews) ? reviews : [];
  const totalReviews = (user as any)?.totalReviews ?? list.length;
  const windowCount = Math.min(totalReviews, RATING_WINDOW);
  const rating = (user as any)?.rating;

  // Agrupar por día (más recientes primero; el server ya ordena desc)
  const groups: { key: string; label: string; items: any[] }[] = [];
  for (const r of list) {
    const d = new Date(r.createdAt);
    const key = format(d, "yyyy-MM-dd");
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: format(d, "d 'de' MMMM, yyyy", { locale: es }), items: [] };
      groups.push(group);
    }
    group.items.push(r);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile" className="p-2 -ml-2 rounded-full hover:bg-muted/40 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Valoración y opiniones</h1>
      </div>

      {/* Nota grande estilo inDriver */}
      <div className="flex flex-col items-center py-6">
        <div className="flex items-center gap-2">
          <span className="text-5xl font-bold tabular-nums">
            {rating ? Number(rating).toFixed(2) : "—"}
          </span>
          <Star className="w-8 h-8 fill-[#f5a83c] text-[#f5a83c]" />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {windowCount > 0
            ? `Según ${windowCount === 1 ? "tu última opinión" : `las últimas ${windowCount} opiniones`}`
            : "Aún no tienes opiniones"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <MessageSquareText className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Cuando los clientes te califiquen, sus opiniones aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {group.items.length === 1 ? "1 reseña" : `${group.items.length} reseñas`}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((r) => (
                  <div key={r.id} className="bg-card border border-border rounded-xl px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Stars value={r.rating} />
                      <span className="text-xs text-muted-foreground truncate">
                        {r.client?.name ?? "Cliente"}
                      </span>
                    </div>
                    {r.comment && <p className="text-sm text-foreground">{r.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
