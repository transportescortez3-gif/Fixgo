import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCheck, Plus, ChevronDown, ChevronUp, MessageSquare, Send, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const TOKEN = () => localStorage.getItem("fixgo_token");

const statusMap: Record<string, { label: string; className: string }> = {
  open:     { label: "Abierto",    className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  answered: { label: "Respondido", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  closed:   { label: "Cerrado",    className: "bg-muted text-muted-foreground border-border" },
};

const categoryLabels: Record<string, string> = {
  general:   "Consulta General",
  pago:      "Problema con Pago",
  cuenta:    "Mi Cuenta",
  seguridad: "Seguridad",
  otro:      "Otro",
};

export default function SupportCenter() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const r = await fetch("/api/tickets", { headers: { Authorization: `Bearer ${TOKEN()}` } });
      if (!r.ok) throw new Error();
      return r.json();
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ subject, message, category }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      toast.success("Reporte enviado. Te responderemos pronto.");
      setSubject(""); setMessage(""); setCategory("general"); setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: () => toast.error("Error al enviar el reporte"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) { toast.error("Completa todos los campos"); return; }
    createMutation.mutate();
  };

  const openCount   = tickets.filter(t => t.status === "open").length;
  const answeredCount = tickets.filter(t => t.status === "answered").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TicketCheck className="w-5 h-5 text-primary" /> Centro de Soporte
            </CardTitle>
            <CardDescription>
              Contacta al equipo de Fixgo para cualquier consulta o problema
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className={showForm ? "variant-outline" : "fixgo-gradient font-bold text-white"}
            variant={showForm ? "outline" : "default"}
          >
            {showForm ? <X className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
            {showForm ? "Cancelar" : "Nuevo Reporte"}
          </Button>
        </div>

        {tickets.length > 0 && (
          <div className="flex gap-3 mt-2">
            {openCount > 0 && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-500/15 text-blue-400">
                {openCount} abierto{openCount !== 1 ? "s" : ""}
              </span>
            )}
            {answeredCount > 0 && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500/15 text-green-400">
                {answeredCount} respondido{answeredCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="border border-primary/20 rounded-xl p-4 space-y-3 bg-primary/5">
            <p className="text-sm font-semibold text-primary">Nuevo Reporte</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoría</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Asunto</Label>
                <Input
                  placeholder="Resume el problema..."
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  maxLength={120}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                placeholder="Describe en detalle qué ocurrió, cuándo y qué necesitas..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending || !subject.trim() || !message.trim()}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {createMutation.isPending ? "Enviando..." : "Enviar Reporte"}
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <TicketCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Sin reportes aún</p>
            <p className="text-xs mt-1">Si tienes un problema, crea un reporte y te ayudamos.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket: any) => {
              const st = statusMap[ticket.status] || statusMap.open;
              const isOpen = expanded === ticket.id;
              return (
                <div key={ticket.id} className="border border-border/50 rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : ticket.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${st.className}`}>{st.label}</Badge>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {format(new Date(ticket.createdAt), "d MMM, yyyy", { locale: es })}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">
                            {categoryLabels[ticket.category] || ticket.category}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate">{ticket.subject}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ticket.responses?.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-primary font-medium">
                            <MessageSquare className="w-3 h-3" /> {ticket.responses.length}
                          </span>
                        )}
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/30 px-4 py-3 space-y-3 bg-muted/20">
                      <div className="bg-background rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">Tu reporte</p>
                        <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
                      </div>

                      {ticket.responses?.map((r: any) => (
                        <div key={r.id} className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <p className="text-xs font-medium text-primary mb-1">
                            Equipo Fixgo · {format(new Date(r.createdAt), "d MMM, HH:mm", { locale: es })}
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                        </div>
                      ))}

                      {ticket.responses?.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          Estamos revisando tu reporte. Te responderemos pronto.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
