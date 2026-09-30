import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, User, Hammer, Receipt, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const TOKEN = () => localStorage.getItem("fixgo_token");

type CancellationRow = {
  serviceId: number;
  title: string;
  cancellationReason: string | null;
  cancelledByRole: "client" | "worker" | "admin" | null;
  updatedAt: string;
  createdAt: string;
  clientId: number;
  clientName: string;
  clientEmail: string;
  workerId: number | null;
  workerName: string | null;
  workerEmail: string | null;
  chargeAmount: number | null;
  chargeStatus: string | null;
  chargeReceiptUrl: string | null;
  chargeAdminNote: string | null;
};

const roleLabel: Record<string, string> = {
  client: "Cliente",
  worker: "Experto",
  admin: "Admin",
};

const chargeStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "Cargo pendiente de pago", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  receipt_uploaded: { label: "Comprobante subido", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  settled: { label: "Pago confirmado", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  disputed: { label: "⚠️ En revisión: experto no recibió el pago", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  voided: { label: "Cargo anulado por soporte", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

function DisputeActions({ serviceId }: { serviceId: number }) {
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resolve = useMutation({
    mutationFn: async (resolution: "settled" | "voided") => {
      const token = TOKEN();
      const res = await fetch(`/api/admin/services/${serviceId}/cancellation-charge/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ resolution, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Error resolviendo el caso");
      }
      return res.json();
    },
    onSuccess: (_data, resolution) => {
      toast({
        title: resolution === "settled" ? "Caso marcado como pagado" : "Cargo anulado",
        description: "Se notificó al cliente y al experto.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "cancellations"] });
    },
    onError: (err: Error) => {
      toast({ title: "No se pudo resolver el caso", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["admin", "cancellations"] });
    },
  });

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 space-y-2">
      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5" /> Resolver caso (acción de soporte)
      </p>
      <Textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Nota interna (opcional): qué se verificó, con quién se habló…"
        className="text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate("settled")}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Marcar como pagado
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate("voided")}
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          <XCircle className="w-4 h-4 mr-1.5" /> Anular el cargo
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ambas acciones cierran el caso y notifican al cliente y al experto.
      </p>
    </div>
  );
}

function CancellationCard({ row }: { row: CancellationRow }) {
  const [expanded, setExpanded] = useState(false);
  const charge = row.chargeStatus ? chargeStatusMap[row.chargeStatus] : null;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${row.chargeStatus === "disputed" ? "border-amber-500/50" : "border-border"}`}>
      <button className="w-full text-left px-4 py-3 flex items-start gap-3" onClick={() => setExpanded(v => !v)}>
        <div className="mt-0.5 p-1.5 rounded-lg bg-destructive/10 shrink-0">
          <Ban className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{row.title}</span>
            {row.cancelledByRole && (
              <Badge variant="outline" className="text-[10px]">Canceló: {roleLabel[row.cancelledByRole]}</Badge>
            )}
            {charge && (
              <Badge variant="outline" className={`text-[10px] ${charge.className}`}>{charge.label}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(row.updatedAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })} · Servicio #{row.serviceId}
          </p>
        </div>
        <div className="shrink-0 text-muted-foreground mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
          <div className="rounded-lg bg-muted/20 border border-border px-3 py-2.5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Motivo de la cancelación (privado)
            </p>
            <p className="text-sm text-foreground">
              {row.cancellationReason || <span className="text-muted-foreground italic">Sin motivo declarado</span>}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Cliente
              </p>
              <Link href={`/admin/users/${row.clientId}`} className="text-sm font-medium text-primary hover:underline">
                {row.clientName}
              </Link>
              <p className="text-xs text-muted-foreground truncate">{row.clientEmail}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Hammer className="w-3.5 h-3.5" /> Experto
              </p>
              {row.workerId ? (
                <>
                  <Link href={`/admin/users/${row.workerId}`} className="text-sm font-medium text-primary hover:underline">
                    {row.workerName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{row.workerEmail}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sin experto asignado</p>
              )}
            </div>
          </div>

          {row.chargeAmount != null && (
            <div className="rounded-lg border border-border px-3 py-2.5 space-y-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" /> Cargo de visita técnica
              </p>
              <p className="text-sm text-foreground">
                Monto: <strong>${row.chargeAmount.toLocaleString("es-CL")}</strong>
                {charge && <span className="text-muted-foreground"> · {charge.label}</span>}
              </p>
              {row.chargeReceiptUrl && (
                <a href={row.chargeReceiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  Ver comprobante subido por el cliente
                </a>
              )}
              {row.chargeAdminNote && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold">Nota interna:</span> {row.chargeAdminNote}
                </p>
              )}
              {row.chargeStatus === "disputed" && <DisputeActions serviceId={row.serviceId} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminCancellations() {
  const { data, isLoading } = useQuery<CancellationRow[]>({
    queryKey: ["admin", "cancellations"],
    queryFn: async () => {
      const token = TOKEN();
      const res = await fetch("/api/admin/cancellations", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error cargando cancelaciones");
      return res.json();
    },
    staleTime: 30_000,
  });

  const rows = data ?? [];
  // Los casos en disputa (experto no recibió el pago) primero
  const sorted = [...rows].sort((a, b) =>
    (b.chargeStatus === "disputed" ? 1 : 0) - (a.chargeStatus === "disputed" ? 1 : 0)
  );

  return (
    <div className="container px-4 py-6 max-w-3xl mx-auto pb-24">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Ban className="w-5 h-5 text-destructive" /> Cancelaciones
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Motivos privados de cancelación por trabajo, con los dos usuarios que participaron. Los usuarios no ven estos motivos.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          No hay servicios cancelados todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(r => <CancellationCard key={r.serviceId} row={r} />)}
        </div>
      )}
    </div>
  );
}
