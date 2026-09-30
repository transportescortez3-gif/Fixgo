import { useState } from "react";
import { useListKycSubmissions, useApproveKyc, useRejectKyc } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, ShieldCheck, Clock, XCircle, CheckCircle2, Eye, ChevronDown, ChevronUp, User,
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendiente", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  approved: { label: "Aprobado", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  rejected: { label: "Rechazado", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
};

function KycCard({ submission, onAction }: { submission: any; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approveKyc = useApproveKyc();
  const rejectKyc = useRejectKyc();

  const config = statusConfig[submission.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  const handleApprove = async () => {
    try {
      await approveKyc.mutateAsync({ id: submission.id });
      toast.success("KYC aprobado exitosamente");
      onAction();
    } catch (err) {
      toast.error("Error al aprobar KYC");
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Ingresa un motivo de rechazo");
      return;
    }
    try {
      await rejectKyc.mutateAsync({ id: submission.id, data: { reason: rejectReason } });
      toast.success("KYC rechazado");
      setRejecting(false);
      setRejectReason("");
      onAction();
    } catch (err) {
      toast.error("Error al rechazar KYC");
    }
  };

  return (
    <Card className="border-border/50">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{submission.userName}</p>
              <p className="text-xs text-muted-foreground">{submission.userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${config.color}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
            <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-muted/30 rounded">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>Documento: <strong className="text-foreground">{submission.documentType === "licencia" ? "Licencia de Conducir" : submission.documentType === "pasaporte" ? "Pasaporte" : "Cédula de Identidad"}</strong></span>
          <span>RUT: <strong className="text-foreground">{submission.rut}</strong></span>
          <span>Nombre: <strong className="text-foreground">{submission.fullName}</strong></span>
          {submission.userPhone && <span>Tel: {submission.userPhone}</span>}
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className={`grid gap-3 ${submission.documentType === "pasaporte" ? "grid-cols-2" : "grid-cols-3"}`}>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  {submission.documentType === "pasaporte" ? "Página principal" : submission.documentType === "licencia" ? "Licencia Frontal" : "Cédula Frontal"}
                </p>
                <a href={`/api/storage/objects/${submission.cedulaFrontPath}`} target="_blank" rel="noopener" className="block">
                  <img
                    src={`/api/storage/objects/${submission.cedulaFrontPath}`}
                    alt="Documento frontal"
                    className="w-full h-28 object-cover rounded-lg border border-border/50 hover:opacity-80 transition-opacity"
                  />
                </a>
              </div>
              {submission.documentType !== "pasaporte" && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">{submission.documentType === "licencia" ? "Licencia Trasera" : "Cédula Trasera"}</p>
                  <a href={`/api/storage/objects/${submission.cedulaBackPath}`} target="_blank" rel="noopener" className="block">
                    <img
                      src={`/api/storage/objects/${submission.cedulaBackPath}`}
                      alt="Documento trasero"
                      className="w-full h-28 object-cover rounded-lg border border-border/50 hover:opacity-80 transition-opacity"
                    />
                  </a>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  Selfie con {submission.documentType === "pasaporte" ? "Pasaporte" : submission.documentType === "licencia" ? "Licencia" : "Cédula"}
                </p>
                <a href={`/api/storage/objects/${submission.selfiePath}`} target="_blank" rel="noopener" className="block">
                  <img
                    src={`/api/storage/objects/${submission.selfiePath}`}
                    alt="Selfie"
                    className="w-full h-28 object-cover rounded-lg border border-border/50 hover:opacity-80 transition-opacity"
                  />
                </a>
              </div>
            </div>

            {submission.rejectionReason && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-400">Motivo de rechazo:</p>
                <p className="text-xs text-muted-foreground mt-1">{submission.rejectionReason}</p>
              </div>
            )}

            {submission.status === "pending" && (
              <div className="space-y-3">
                {rejecting ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Motivo del rechazo..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleReject}
                        disabled={rejectKyc.isPending}
                        className="flex-1"
                      >
                        {rejectKyc.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        Confirmar Rechazo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(false)} className="flex-1">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleApprove}
                      disabled={approveKyc.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {approveKyc.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejecting(true)}
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminKycPage() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data: submissions, isLoading, refetch } = useListKycSubmissions(
    filter ? { status: filter as any } : {}
  );

  return (
    <div className="max-w-3xl mx-auto p-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Verificación KYC</h1>
            <p className="text-sm text-muted-foreground">Revisa y aprueba documentos de identidad</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: undefined, label: "Todos" },
          { value: "pending", label: "Pendientes" },
          { value: "approved", label: "Aprobados" },
          { value: "rejected", label: "Rechazados" },
        ].map((tab) => (
          <button
            key={tab.label}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
              filter === tab.value
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !submissions || (submissions as any[]).length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay solicitudes de verificación</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(submissions as any[]).map((sub: any) => (
            <KycCard key={sub.id} submission={sub} onAction={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
