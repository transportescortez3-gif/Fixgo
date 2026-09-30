import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCheck, Plus, ChevronDown, ChevronUp, MessageSquare, Send, Wrench, ShieldCheck, FileWarning } from "lucide-react";
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
  general:   "Soporte Técnico de la Aplicación",
  seguridad: "Seguridad o Convivencia",
  otro:      "Otro",
};

const contactReportOptions = [
  {
    value: "soporte_tecnico",
    label: "Soporte Técnico de la Aplicación",
    description: "Problemas relacionados con el funcionamiento del software.",
    examples: "La app se queda pegada, no me permite contactar al usuario, error en el mapa/GPS, o el chat encriptado no carga.",
    backendCategory: "general",
    adminAlert: false,
    Icon: Wrench,
  },
  {
    value: "seguridad_convivencia",
    label: "Reporte de Seguridad o Convivencia Comunitaria",
    description: "Infracciones graves al trato mutuo y las reglas éticas de la comunidad dentro de la app.",
    examples: "El usuario/prestador faltó el respeto, se mostró de forma altanera/malcriada, o rompió las normas de convivencia digital.",
    backendCategory: "seguridad",
    adminAlert: true,
    Icon: ShieldCheck,
  },
  {
    value: "terminos_condiciones",
    label: "Incumplimiento de Términos y Condiciones",
    description: "Alertas sobre irregularidades con la cuenta que violan el contrato de uso de la plataforma.",
    examples: "Sospecha de perfil falso, suplantación de identidad, o sospecha de fraude/estafa.",
    backendCategory: "seguridad",
    adminAlert: true,
    Icon: FileWarning,
  },
];

export default function Support() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const contactId   = params.get("contactId");
  const contactName = params.get("contactName");
  const specialty   = params.get("specialty");

  const isFromContact = !!contactId;

  const [showForm, setShowForm] = useState(isFromContact);
  const [selectedOption, setSelectedOption] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (isFromContact) setShowForm(true);
  }, [isFromContact]);

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const r = await fetch("/api/tickets", { headers: { Authorization: `Bearer ${TOKEN()}` } });
      if (!r.ok) throw new Error("Error al cargar tickets");
      return r.json();
    },
    staleTime: 30_000,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const opt = contactReportOptions.find(o => o.value === selectedOption);
      const subject = isFromContact && opt
        ? `[${opt.adminAlert ? "ALERTA ADMIN" : "Soporte"}] ${opt.label}`
        : selectedOption;
      const fullMessage = isFromContact && opt
        ? `Reporte desde Mis Contactos.\nID Interacción: ${contactId}.\nContraparte: ${contactName ?? "Desconocido"} (${specialty ?? ""}).\nFecha: ${new Date().toISOString()}.\nMotivo: ${opt.value}.\n\n${message}`.trim()
        : message;
      const category = isFromContact && opt ? opt.backendCategory : "general";

      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ subject, message: fullMessage, category }),
      });
      if (!r.ok) throw new Error("Error al crear ticket");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Informe enviado con éxito para la revisión de seguridad del sistema. Gracias por ayudarnos a cuidar la comunidad.");
      setSelectedOption("");
      setMessage("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: () => toast.error("Error al enviar el reporte"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFromContact && !selectedOption) { toast.error("Selecciona un tipo de reporte"); return; }
    createMutation.mutate();
  };

  return (
    <div className="container px-4 py-6 md:py-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TicketCheck className="w-6 h-6 text-primary" /> Centro de Soporte
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isFromContact && contactName
              ? `Reporte de interacción con ${contactName}`
              : "Contacta al equipo de Fixgo para cualquier consulta o problema"}
          </p>
        </div>
        {!isFromContact && (
          <Button onClick={() => setShowForm(!showForm)} className="fixgo-gradient font-bold text-white">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Reporte
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              {isFromContact ? "Selecciona el tipo de reporte" : "Nuevo Reporte"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isFromContact ? (
                <div className="space-y-2">
                  {contactName && (
                    <div className="rounded-xl bg-primary/8 border border-primary/20 px-3 py-2 mb-3">
                      <p className="text-xs text-primary font-medium">Interacción con: <span className="font-bold">{contactName}</span>{specialty ? ` · ${specialty}` : ""}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {contactReportOptions.map((opt) => {
                      const sel = selectedOption === opt.value;
                      const { Icon } = opt;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelectedOption(opt.value)}
                          className={`w-full text-left rounded-xl border p-3 transition-all ${
                            sel
                              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                              : "border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sel ? "bg-primary/20" : "bg-muted"}`}>
                              <Icon className={`w-4 h-4 ${sel ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-snug ${sel ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>
                              <p className="text-[11px] text-muted-foreground/70 mt-1 italic leading-relaxed">Ej: {opt.examples}</p>
                            </div>
                            <div className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel ? "border-primary bg-primary" : "border-border"}`}>
                              {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs text-muted-foreground">Comentario adicional (opcional)</Label>
                    <Textarea
                      placeholder="Déjanos un comentario sobre el respeto y la comunicación durante el contacto..."
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Asunto</Label>
                    <input
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder="Resume brevemente tu problema..."
                      value={selectedOption}
                      onChange={e => setSelectedOption(e.target.value)}
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Textarea
                      placeholder="Explica en detalle qué pasó, cuándo ocurrió y qué necesitas..."
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={5}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  className="fixgo-gradient font-bold text-white"
                  disabled={createMutation.isPending || (isFromContact ? !selectedOption : (!selectedOption.trim() || !message.trim()))}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {createMutation.isPending ? "Enviando..." : "Enviar Reporte"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : tickets.length === 0 && !showForm ? (
        <div className="text-center py-20 text-muted-foreground">
          <TicketCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Sin reportes aún</p>
          <p className="text-sm mt-1">Si tienes un problema, crea un reporte y te ayudamos.</p>
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
                            {format(new Date(ticket.createdAt), "d 'de' MMM, yyyy", { locale: es })}
                          </span>
                          <span className="text-xs text-muted-foreground/60 shrink-0">
                            {categoryLabels[ticket.category] || ticket.category}
                          </span>
                        </div>
                        <p className="font-semibold text-sm truncate">{ticket.subject}</p>
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
                  <div className="border-t border-border/50">
                    <div className="p-4 space-y-4">
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">Tu reporte</p>
                        <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
                      </div>
                      {ticket.responses?.map((r: any) => (
                        <div key={r.id} className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                          <p className="text-xs font-medium text-primary mb-1">
                            Respuesta del equipo Fixgo · {format(new Date(r.createdAt), "d MMM, HH:mm", { locale: es })}
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                        </div>
                      ))}
                      {ticket.responses?.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Estamos revisando tu reporte. Te responderemos pronto.
                        </p>
                      )}
                    </div>
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
