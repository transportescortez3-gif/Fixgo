import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCheck, MessageSquare, Send, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const TOKEN = () => localStorage.getItem("fixgo_token");

const statusMap: Record<string, { label: string; icon: any; className: string }> = {
  open:     { label: "Abierto",    icon: Clock,         className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  answered: { label: "Respondido", icon: CheckCircle2,  className: "bg-green-500/20 text-green-400 border-green-500/30" },
  closed:   { label: "Cerrado",    icon: XCircle,       className: "bg-muted text-muted-foreground border-border" },
};

const categoryLabels: Record<string, string> = {
  general:   "Consulta General",
  pago:      "Problema con Pago",
  cuenta:    "Mi Cuenta",
  seguridad: "Seguridad",
  otro:      "Otro",
};

export default function AdminTickets() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [responseText, setResponseText] = useState<Record<number, string>>({});
  const [newStatus, setNewStatus] = useState<Record<number, string>>({});

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ["admin-tickets", filter],
    queryFn: async () => {
      const url = filter === "all" ? "/api/admin/tickets" : `/api/admin/tickets?status=${filter}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` } });
      if (!r.ok) throw new Error("Error al cargar tickets");
      return r.json();
    },
    staleTime: 15_000,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, message, status }: { id: number; message: string; status: string }) => {
      const r = await fetch(`/api/admin/tickets/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ message, status }),
      });
      if (!r.ok) throw new Error("Error al responder");
      return r.json();
    },
    onSuccess: (_, { id }) => {
      toast.success("Respuesta enviada");
      setResponseText(prev => ({ ...prev, [id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: () => toast.error("Error al enviar respuesta"),
  });

  const openCount   = tickets.filter(t => t.status === "open").length;
  const answeredCount = tickets.filter(t => t.status === "answered").length;

  const handleRespond = (id: number) => {
    const msg = responseText[id]?.trim();
    if (!msg) { toast.error("Escribe una respuesta"); return; }
    respondMutation.mutate({ id, message: msg, status: newStatus[id] || "answered" });
  };

  return (
    <div className="container px-4 py-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TicketCheck className="w-6 h-6 text-primary" /> Tickets de Soporte
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Reportes y consultas de usuarios</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-5 flex items-center gap-4">
            <Clock className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-blue-500">{openCount}</p>
              <p className="text-xs text-muted-foreground">Abiertos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-5 flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-green-500">{answeredCount}</p>
              <p className="text-xs text-muted-foreground">Respondidos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-muted/10">
          <CardContent className="pt-5 flex items-center gap-4">
            <TicketCheck className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{tickets.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abiertos</SelectItem>
            <SelectItem value="answered">Respondidos</SelectItem>
            <SelectItem value="closed">Cerrados</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{tickets.length} tickets</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <TicketCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No hay tickets con ese filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket: any) => {
            const st = statusMap[ticket.status] || statusMap.open;
            const isOpen = expanded === ticket.id;
            return (
              <Card key={ticket.id} className="overflow-hidden">
                <button className="w-full text-left" onClick={() => setExpanded(isOpen ? null : ticket.id)}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs shrink-0 ${st.className}`}>{st.label}</Badge>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(ticket.createdAt), "d 'de' MMM, HH:mm", { locale: es })}
                          </span>
                          <span className="text-xs text-muted-foreground/60 shrink-0">
                            {categoryLabels[ticket.category] || ticket.category}
                          </span>
                        </div>
                        <p className="font-semibold text-sm">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.user?.name} · <span className="text-muted-foreground/70">{ticket.user?.email}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ticket.responses?.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-primary font-medium">
                            <MessageSquare className="w-3.5 h-3.5" /> {ticket.responses.length}
                          </span>
                        )}
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardContent>
                </button>

                {isOpen && (
                  <div className="border-t border-border/50 p-4 space-y-4">
                    <div className="bg-muted/30 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Mensaje del usuario</p>
                      <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
                    </div>

                    {ticket.responses?.map((r: any) => (
                      <div key={r.id} className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                        <p className="text-xs font-medium text-primary mb-1">
                          Respuesta del admin · {format(new Date(r.createdAt), "d MMM, HH:mm", { locale: es })}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                      </div>
                    ))}

                    {ticket.status !== "closed" && (
                      <div className="space-y-3 pt-2 border-t border-border/30">
                        <p className="text-xs font-medium text-muted-foreground">Responder al usuario</p>
                        <Textarea
                          placeholder="Escribe tu respuesta..."
                          rows={3}
                          value={responseText[ticket.id] || ""}
                          onChange={e => setResponseText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select
                            value={newStatus[ticket.id] || "answered"}
                            onValueChange={val => setNewStatus(prev => ({ ...prev, [ticket.id]: val }))}
                          >
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="answered">Marcar respondido</SelectItem>
                              <SelectItem value="closed">Cerrar ticket</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleRespond(ticket.id)}
                            disabled={respondMutation.isPending || !responseText[ticket.id]?.trim()}
                          >
                            <Send className="w-4 h-4 mr-1.5" />
                            Enviar Respuesta
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
