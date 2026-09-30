import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, Eye, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const TOKEN = () => localStorage.getItem("fixgo_token");

const statusConfig: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pendiente", className: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  in_review: { label: "En revisión", className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Eye },
  completed: { label: "Gestionada", className: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  rejected: { label: "Rechazada", className: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
};

const categoryLabels: Record<string, string> = {
  profile: "Perfil",
  profile_media: "Fotos y portafolio",
  kyc: "KYC y selfies",
  location: "Ubicación",
  chat_attachments: "Chat y adjuntos",
  notifications: "Notificaciones",
};

export default function AdminAccountDeletionRequestsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["admin-account-deletion-requests", filter],
    queryFn: async () => {
      const suffix = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const response = await fetch(`/api/admin/account-deletion-requests${suffix}`, {
        headers: { Authorization: `Bearer ${TOKEN()}` },
      });
      if (!response.ok) throw new Error("No se pudieron cargar las solicitudes");
      return response.json();
    },
    staleTime: 10_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: number; status: string; adminNotes: string }) => {
      const response = await fetch(`/api/admin/account-deletion-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ status, adminNotes }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo actualizar la solicitud");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Solicitud actualizada");
      queryClient.invalidateQueries({ queryKey: ["admin-account-deletion-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const reviewCount = requests.filter((request) => request.status === "in_review").length;

  return (
    <div className="container px-4 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-destructive/10 p-2.5 text-destructive">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Solicitudes de eliminación</h1>
          <p className="text-sm text-muted-foreground mt-1">Verifica la identidad y gestiona las solicitudes recibidas desde Google Play.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5"><p className="text-2xl font-bold text-amber-400">{pendingCount}</p><p className="text-xs text-muted-foreground">Pendientes</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-2xl font-bold text-blue-400">{reviewCount}</p><p className="text-xs text-muted-foreground">En revisión</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-2xl font-bold">{requests.length}</p><p className="text-xs text-muted-foreground">En el filtro actual</p></CardContent></Card>
      </div>

      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="pending">Pendientes</SelectItem>
          <SelectItem value="in_review">En revisión</SelectItem>
          <SelectItem value="completed">Gestionadas</SelectItem>
          <SelectItem value="rejected">Rechazadas</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Cargando solicitudes…</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">No hay solicitudes con este filtro.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const config = statusConfig[request.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const isExpanded = expanded === request.id;
            const status = statuses[request.id] || request.status;
            return (
              <Card key={request.id}>
                <CardContent className="pt-5">
                  <button className="w-full text-left" onClick={() => setExpanded(isExpanded ? null : request.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={config.className}><StatusIcon className="w-3 h-3 mr-1" />{config.label}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(request.createdAt), "d 'de' MMM, HH:mm", { locale: es })}</span>
                        </div>
                        <p className="font-semibold text-sm mt-2">{request.email}</p>
                        <p className="text-xs text-muted-foreground">{request.name || "Sin nombre"}{request.phone ? ` · ${request.phone}` : ""}</p>
                        <p className="text-xs text-primary mt-1">
                          {request.requestType === "partial"
                            ? `Datos seleccionados: ${(request.dataCategories || []).map((category: string) => categoryLabels[category] || category).join(", ")}`
                            : "Solicitud de eliminación completa"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{isExpanded ? "Ocultar" : "Ver detalles"}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 mt-4 pt-4 space-y-4">
                      <div className="rounded-lg bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        {request.message || "Sin información adicional."}
                      </div>
                      <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
                        <Select value={status} onValueChange={(value) => setStatuses((current) => ({ ...current, [request.id]: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendiente</SelectItem>
                            <SelectItem value="in_review">En revisión</SelectItem>
                            <SelectItem value="completed">Gestionada</SelectItem>
                            <SelectItem value="rejected">Rechazada</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea
                          rows={2}
                          value={notes[request.id] ?? request.adminNotes ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Nota interna de verificación o gestión"
                          maxLength={2000}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: request.id, status, adminNotes: notes[request.id] ?? request.adminNotes ?? "" })}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Guardar estado
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}