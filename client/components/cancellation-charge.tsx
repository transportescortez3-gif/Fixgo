import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, CheckCircle2, Landmark, Clock, Receipt, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/*
 * Cargos por cancelación tardía (visita técnica).
 *
 * IMPORTANTE (legal): Fixgo NO procesa pagos entre usuarios. Estas tarjetas
 * solo muestran los datos de transferencia del experto para que el cliente
 * pague DIRECTAMENTE (fuera de la app) y suba el comprobante como imagen.
 */

/** Countdown reactivo contra un timestamp del servidor. */
export function useCountdown(until?: string | Date | null) {
  const target = until ? new Date(until).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  const active = target != null && target > now;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, target]);

  if (target == null) return { active: false as const, expired: false, label: "" };
  const remaining = Math.max(0, target - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  return {
    active,
    expired: !active,
    label: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
  };
}

export function formatCLP(amount: number): string {
  return `$${amount.toLocaleString("es-CL")}`;
}

async function authFetch(url: string, init?: RequestInit) {
  const token = localStorage.getItem("fixgo_token");
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error || `Error ${res.status}`);
  }
  return res.json();
}

type Charge = {
  id: number;
  serviceId: number;
  amount: number;
  status: string;
  receiptUrl?: string | null;
  deadlineAt: string;
  holderName: string;
  bankName?: string | null;
  bankAccountType?: string | null;
  bankAccountNumber?: string | null;
  bankRut?: string | null;
  serviceTitle: string;
  categoryName?: string | null;
  counterpartName: string;
};

export const MY_CHARGES_QUERY_KEY = ["cancellation-charges", "my"];

/** Tarjeta del CLIENTE: debe transferir la visita técnica y subir comprobante. */
function ClientChargeCard({ charge }: { charge: Charge }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleReceipt = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("El comprobante debe ser una imagen"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("La imagen no puede superar 10MB"); return; }
    setUploading(true);
    try {
      const objectPath = await uploadFileToStorage(file);
      await authFetch(`/api/services/${charge.serviceId}/cancellation-charge/receipt`, {
        method: "POST",
        body: JSON.stringify({ receiptUrl: `/api/storage/objects/${objectPath}` }),
      });
      toast.success("Comprobante enviado al experto ✓");
      queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY });
    } catch (e: any) {
      toast.error(e?.message || "Error al subir el comprobante");
    } finally {
      setUploading(false);
    }
  };

  const uploaded = charge.status === "receipt_uploaded";

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Landmark className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">
            Debes transferir {formatCLP(charge.amount)} — visita técnica
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cancelaste "{charge.categoryName || charge.serviceTitle}" después del tiempo permitido. Transfiere directamente a {charge.counterpartName}.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-background/60 border border-border px-3 py-2.5 text-[13px] space-y-1">
        <p><span className="text-muted-foreground">Titular:</span> <strong>{charge.holderName}</strong></p>
        {charge.bankName && <p><span className="text-muted-foreground">Banco:</span> <strong>{charge.bankName}</strong></p>}
        {charge.bankAccountType && <p><span className="text-muted-foreground">Tipo de cuenta:</span> <strong>{charge.bankAccountType}</strong></p>}
        {charge.bankAccountNumber && <p><span className="text-muted-foreground">N° de cuenta:</span> <strong>{charge.bankAccountNumber}</strong></p>}
        {charge.bankRut && <p><span className="text-muted-foreground">RUT:</span> <strong>{charge.bankRut}</strong></p>}
        <p><span className="text-muted-foreground">Monto:</span> <strong>{formatCLP(charge.amount)}</strong></p>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        Plazo: hasta el {format(new Date(charge.deadlineAt), "d 'de' MMMM 'a las' HH:mm", { locale: es })} (24 horas)
      </p>

      {charge.status === "disputed" ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[13px] font-medium text-amber-500">
            El experto indicó que no recibió el pago — caso siendo revisado por soporte
          </p>
        </div>
      ) : uploaded ? (
        <div className="flex items-center gap-2 text-[13px] text-green-500 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Comprobante enviado — esperando confirmación del experto
          {charge.receiptUrl && (
            <a href={charge.receiptUrl} target="_blank" rel="noreferrer" className="underline text-xs text-muted-foreground">ver</a>
          )}
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReceipt(f); e.target.value = ""; }}
          />
          <Button
            size="sm"
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            Ya transferí — subir comprobante
          </Button>
        </>
      )}

      <p className="text-[10px] text-muted-foreground/70 leading-snug">
        Fixgo no procesa este pago: la transferencia es directa entre tú y el experto. La app solo muestra los datos y guarda tu comprobante.
      </p>
    </div>
  );
}

/** Tarjeta del EXPERTO: le corresponde su visita técnica; ve el comprobante. */
function WorkerChargeCard({ charge }: { charge: Charge }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [settling, setSettling] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const uploaded = charge.status === "receipt_uploaded";
  const disputed = charge.status === "disputed";
  // Reactivo: cuando vence el plazo de 24h estando la página abierta, el botón
  // "No recibí el pago" aparece solo (sin necesidad de recargar).
  const deadline = useCountdown(charge.deadlineAt);

  const handleDispute = async () => {
    setDisputing(true);
    try {
      await authFetch(`/api/services/${charge.serviceId}/cancellation-charge/dispute`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY });
      toast.info("Caso enviado a soporte para revisión");
      // Redirigir al área de soporte; el experto queda libre para tomar más trabajos.
      setLocation("/support");
    } catch (e: any) {
      toast.error(e?.message || "Error al reportar el pago");
    } finally {
      setDisputing(false);
    }
  };

  const handleSettle = async () => {
    setSettling(true);
    try {
      await authFetch(`/api/services/${charge.serviceId}/cancellation-charge/settle`, { method: "POST" });
      toast.success("Pago confirmado — cargo cerrado");
      queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY });
    } catch (e: any) {
      toast.error(e?.message || "Error al confirmar el pago");
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Receipt className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">
            Te corresponde tu visita técnica: {formatCLP(charge.amount)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {charge.counterpartName} canceló "{charge.serviceTitle}" fuera del tiempo permitido. Le enviamos tus datos de transferencia.
          </p>
        </div>
      </div>

      {disputed ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[13px] font-medium text-amber-500">Caso siendo revisado por soporte</p>
        </div>
      ) : uploaded && charge.receiptUrl ? (
        <div className="space-y-2">
          <p className="text-[13px] text-green-500 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> El cliente subió el comprobante:
          </p>
          <a href={charge.receiptUrl} target="_blank" rel="noreferrer">
            <img src={charge.receiptUrl} alt="Comprobante de transferencia" className="max-h-48 rounded-lg border border-border object-contain" />
          </a>
          <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold" disabled={settling || disputing} onClick={handleSettle}>
            {settling ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            Confirmé que recibí el pago
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold"
            disabled={settling || disputing}
            onClick={handleDispute}
          >
            {disputing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-1.5" />}
            No recibí el pago
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 shrink-0" />
            El cliente tiene hasta el {format(new Date(charge.deadlineAt), "d 'de' MMMM 'a las' HH:mm", { locale: es })} para transferir y subir el comprobante.
          </p>
          {deadline.expired && (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold"
              disabled={disputing}
              onClick={handleDispute}
            >
              {disputing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-1.5" />}
              No recibí el pago
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Banner con los cargos de cancelación pendientes del usuario actual
 * (como cliente que debe pagar o experto que espera su visita técnica).
 * Escucha el socket event "cancellation_charge" desde la página que lo monta
 * (invalidate con MY_CHARGES_QUERY_KEY).
 */
export function MyChargesBanner({ role, focusServiceId }: { role: "client" | "worker"; focusServiceId?: number | null }) {
  const { data } = useQuery({
    queryKey: MY_CHARGES_QUERY_KEY,
    queryFn: () => authFetch("/api/cancellation-charges/my"),
    staleTime: 30_000,
  });

  const charges: Charge[] = role === "client" ? (data?.asClient ?? []) : (data?.asWorker ?? []);
  const hasFocusedCharge = focusServiceId != null && charges.some(charge => charge.serviceId === focusServiceId);

  useEffect(() => {
    if (!hasFocusedCharge || focusServiceId == null) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`cancellation-charge-${focusServiceId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [focusServiceId, hasFocusedCharge]);

  if (charges.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {charges.map((c) => (
        <div key={c.id} id={`cancellation-charge-${c.serviceId}`} className="scroll-mt-4">
          {role === "client"
            ? <ClientChargeCard charge={c} />
            : <WorkerChargeCard charge={c} />}
        </div>
      ))}
    </div>
  );
}
