import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketCheck, ArrowRight, Send, ChevronDown, ChevronUp, MessageSquare, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const TOKEN = () => localStorage.getItem("fixgo_token");

const categoryLabels: Record<string, string> = {
  general:   "General",
  pago:      "Pago",
  cuenta:    "Cuenta",
  seguridad: "Seguridad",
  otro:      "Otro",
};

export default function AdminTicketWidget() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [responseText, setResponseText] = useState<Record<number, string>>({});
  const [newStatus, setNewStatus] = useState<Record<number, string>>({});

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ["admin-tickets", "open"],
    queryFn: async () => {
      const r = await fetch("/api/admin/tickets?status=open", {
        headers: { Authorization: `Bearer ${TOKEN()}` },
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    enabled: isAdmin,
    staleTime: 15_000,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, message, status }: { id: number; message: string; status: string }) => {
      const r = await fetch(`/api/admin/tickets/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ message, status }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: (_, { id }) => {
      toast.success("Respuesta enviada");
      setResponseText(prev => ({ ...prev, [id]: "" }));
      setExpanded(null);
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: () => toast.error("Error al enviar respuesta"),
  });

  const handleRespond = (id: number) => {
    const msg = responseText[id]?.trim();
    if (!msg) { toast.error("Escribe una respuesta"); return; }
    respondMutation.mutate({ id, message: msg, status: newStatus[id] || "answered" });
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TicketCheck className="w-5 h-5 text-primary" /> Tickets Pendientes
            {tickets.length > 0 && (
              <span className="ml-1 text-xs font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                {tickets.length}
              </span>
            )}
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="text-primary h-8 text-xs gap-1">
            <Link href="/admin/tickets">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TicketCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">Sin tickets pendientes</p>
            <p className="text-xs mt-1 text-muted-foreground/70">¡Todo al día!</p>
          </div>
        ) : (
          <>
            {tickets.slice(0, 5).map((ticket: any) => {
              const isOpen = expanded === ticket.id;
              return (
                <div key={ticket.id} className="border border-border/50 rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : ticket.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] shrink-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
                            <Clock className="w-2.5 h-2.5 mr-1" /> Abierto
                          </Badge>
                          <span className="text-[10px] text-muted-foreground/70 shrink-0">
                            {categoryLabels[ticket.category] || ticket.category}
                          </span>
                        </div>
                        <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.user?.name} · {format(new Date(ticket.createdAt), "d MMM, HH:mm", { locale: es })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ticket.responses?.length > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
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
                        <p className="text-xs text-muted-foreground mb-1 font-medium">Mensaje</p>
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">{ticket.message}</p>
                      </div>

                      <div className="space-y-2">
                        <Textarea
                          placeholder="Escribe tu respuesta..."
                          rows={3}
                          value={responseText[ticket.id] || ""}
                          onChange={e => setResponseText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                          className="text-sm"
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
                            className="h-8 text-xs"
                            onClick={() => handleRespond(ticket.id)}
                            disabled={respondMutation.isPending || !responseText[ticket.id]?.trim()}
                          >
                            <Send className="w-3.5 h-3.5 mr-1.5" />
                            Enviar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {tickets.length > 5 && (
              <Button asChild variant="outline" size="sm" className="w-full text-xs mt-2">
                <Link href="/admin/tickets">
                  Ver {tickets.length - 5} tickets más <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
