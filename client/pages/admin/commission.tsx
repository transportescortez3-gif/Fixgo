import { useEffect, useState } from "react";
import { useGetCommissionRate, useUpdateCommissionRate, getGetCommissionRateQueryKey } from "@/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Percent, DollarSign, Info, CheckCircle2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminCommission() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetCommissionRate();
  const updateMutation = useUpdateCommissionRate();

  const [inputValue, setInputValue] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (config && !isDirty) {
      const pct = config.rate > 0 ? Math.round(config.rate * 100) : 0;
      setInputValue(String(pct));
    }
  }, [config, isDirty]);

  const parsedPct = parseFloat(inputValue);
  const isValid = inputValue === "" || inputValue === "0" || (!isNaN(parsedPct) && parsedPct >= 0 && parsedPct <= 100);
  const effectivePct = isNaN(parsedPct) ? 0 : parsedPct;
  const hasCommission = effectivePct > 0;

  const workerPct = hasCommission ? 100 - effectivePct : 100;

  const handleSave = async () => {
    if (!isValid) {
      toast.error("Ingresa un porcentaje entre 0 y 100");
      return;
    }
    const rate = effectivePct / 100;
    try {
      await updateMutation.mutateAsync({ data: { rate } });
      toast.success(rate === 0 ? "Comisión desactivada — trabajadores reciben el 100%" : `Comisión actualizada a ${effectivePct}%`);
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: getGetCommissionRateQueryKey() });
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar la comisión");
    }
  };

  const currentRate = config?.rate ?? 0;
  const currentPct = Math.round(currentRate * 100);

  return (
    <div className="container px-4 py-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Comisión de la Plataforma</h1>
        <p className="text-muted-foreground mt-1">
          Elige cuánto cobra Fixgo por cada trabajo completado. Puedes cambiarlo en cualquier momento.
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Comisión Actual</CardTitle>
              <CardDescription>Se aplica a todos los servicios nuevos completados</CardDescription>
            </div>
            <Badge
              variant="outline"
              className={currentPct > 0
                ? "bg-primary/10 text-primary border-primary/30 text-base font-bold px-3 py-1"
                : "bg-muted text-muted-foreground border-border text-base font-bold px-3 py-1"}
            >
              {currentPct > 0 ? `${currentPct}%` : "Sin comisión"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className={`rounded-xl border p-4 text-center ${currentPct > 0 ? 'border-primary/20 bg-primary/5' : 'border-border/40 bg-muted/20'}`}>
              <DollarSign className={`w-5 h-5 mx-auto mb-1 ${currentPct > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className={`text-2xl font-bold ${currentPct > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{currentPct}%</p>
              <p className="text-xs text-muted-foreground mt-1">Fixgo recibe</p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
              <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-500">{100 - currentPct}%</p>
              <p className="text-xs text-muted-foreground mt-1">El trabajador recibe</p>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Nuevo Porcentaje</Label>
            <div className="flex gap-3 items-start">
              <div className="relative flex-1">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="Ej: 15"
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); setIsDirty(true); }}
                  className={`pr-10 text-lg font-bold ${!isValid ? 'border-destructive' : ''}`}
                />
                <Percent className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              </div>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || !isValid || !isDirty}
                className="fixgo-gradient font-bold text-white shrink-0"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>

            {!isValid && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Ingresa un número entre 0 y 100
              </p>
            )}

            {isDirty && isValid && (
              <div className="rounded-xl bg-muted/40 border border-border/50 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vista previa del cambio</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className={`text-xl font-bold ${hasCommission ? 'text-primary' : 'text-muted-foreground'}`}>
                      {hasCommission ? `${effectivePct}%` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">Fixgo recibe</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-500">{workerPct}%</p>
                    <p className="text-xs text-muted-foreground">El trabajador recibe</p>
                  </div>
                </div>
                {!hasCommission && (
                  <p className="text-xs text-center text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    <Info className="w-3 h-3" /> Con 0%, los trabajadores reciben el pago completo
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-muted/20 border border-border/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Ejemplos
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 10, 15].map(pct => (
                <button
                  key={pct}
                  onClick={() => { setInputValue(String(pct)); setIsDirty(true); }}
                  className="text-center p-2 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-bold">{pct === 0 ? 'Sin comisión' : `${pct}%`}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {pct === 0 ? '100% al trabajador' : `${100 - pct}% al trabajador`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
