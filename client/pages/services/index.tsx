import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useListServices, getListServicesQueryKey } from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UserCircle2, Star, Send, MessageCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DirectChatSheet from "@/components/direct-chat-sheet";
import { ProposalChatSheet } from "@/components/proposal-chat-sheet";
import { useGlobalSocket } from "@/hooks/use-global-socket";

const ACTIVE_STATUSES = ["accepted", "in_progress"];

function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch("/api/favorites", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error cargando");
      return res.json() as Promise<Array<{
        id: number;
        vinculadoId: number;
        tipoRelacion: string;
        createdAt: string;
        user: { id: number; name: string; avatarUrl: string | null; rating: number | null; totalReviews: number | null; bio: string | null };
      }>>;
    },
    staleTime: 30_000,
    enabled,
  });
}

// ── Agrupar servicios por trabajador: 1 entrada por persona ──────────────────
interface ContactEntry {
  serviceId: number;
  personId: number;
  person: any;
  specialty: string;
  service: any;
  status: "active" | "closed" | "cancelled";
  displayDate: string;
}

function getContactEntries(services: any[], isClient: boolean): ContactEntry[] {
  return services.flatMap((svc): ContactEntry[] => {
    const counterpart = isClient ? svc.worker : svc.client;
    if (!counterpart?.id) return [];

    const status = ACTIVE_STATUSES.includes(svc.status)
      ? "active"
      : svc.status === "completed"
        ? "closed"
        : svc.status === "cancelled"
          ? "cancelled"
          : null;
    if (!status) return [];

    const displayDate = status === "active"
      ? (svc.scheduledAt ?? svc.createdAt)
      : status === "closed"
        ? (svc.completedAt ?? svc.updatedAt ?? svc.createdAt)
        : (svc.cancelledAt ?? svc.updatedAt ?? svc.createdAt);

    return [{
      serviceId: svc.id,
      personId: counterpart.id,
      person: counterpart,
      specialty: svc.category?.name ?? "",
      service: svc,
      status,
      displayDate,
    }];
  }).sort((a, b) => new Date(b.displayDate).getTime() - new Date(a.displayDate).getTime());
}

export default function ServicesList() {
  const { user, isClient, isWorker } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"active" | "closed" | "cancelled">("active");
  const [mainTab, setMainTab] = useState<"contacts" | "trusted">("contacts");
  const [directChat, setDirectChat] = useState<{ userId: number; name: string; avatar?: string | null } | null>(null);
  const [serviceChat, setServiceChat] = useState<{
    serviceId: number; workerId: number; workerName: string; workerAvatar?: string | null;
    otherUserId: number; budgetNote?: string | null; requestQuote?: boolean;
    serviceStatus?: string | null; paymentMethod?: string | null; freeCancelUntil?: string | null;
  } | null>(null);

  // Traer todos los servicios (sin paginación) para poder deduplicar correctamente
  const queryParams = {
    ...(isClient ? { clientId: user?.id } : {}),
    ...(isWorker ? { workerId: user?.id } : {}),
    limit: 200,
    page: 1,
  };

  const { data, isLoading } = useListServices(queryParams, { query: { staleTime: 15_000, refetchOnMount: 'always' } } as any);

  // Refrescar la lista cuando el cliente elige otro trabajador o cuando cambia el estado del servicio
  useGlobalSocket(user?.id ?? null, {
    onProposalUpdated: () => {
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    },
    onServiceUpdated: () => {
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    },
  });
  const { data: favorites, isLoading: favsLoading } = useFavorites(!!user);

  const allServices: any[] = data?.services ?? [];

  // Una tarjeta por trabajo, separada por estado.
  const allContacts = getContactEntries(allServices, !!isClient);
  const filteredContacts = allContacts.filter(c => c.status === statusFilter);

  const filters = [
    { value: "active" as const, label: "Activos" },
    { value: "closed" as const, label: "Cerrados" },
    { value: "cancelled" as const, label: "Cancelados" },
  ];

  const trustedLabel = isClient ? "Técnicos de Confianza" : "Clientes de Confianza";

  const handleContactClick = (entry: ContactEntry) => {
    if (entry.status === "active") {
      const svc = entry.service;
      // El workerId siempre es el del trabajador; otherUserId es la contraparte del usuario actual
      const workerObj = svc.worker;
      const clientObj = svc.client;
      const workerId: number = workerObj?.id ?? (isWorker ? user!.id : entry.personId);
      const otherUserId: number = isClient ? (workerObj?.id ?? entry.personId) : (clientObj?.id ?? entry.personId);
      const workerName: string = isClient
        ? (workerObj?.name ?? entry.person?.name ?? "Especialista")
        : (user?.name ?? "Especialista");
      const workerAvatar: string | null = isClient
        ? (workerObj?.avatarUrl ?? entry.person?.avatarUrl ?? null)
        : (user?.avatarUrl ?? null);
      setServiceChat({
        serviceId: svc.id,
        workerId,
        workerName,
        workerAvatar,
        otherUserId,
        budgetNote: svc.budgetNote ?? null,
        requestQuote: !!svc.requestQuote,
        serviceStatus: svc.status ?? null,
        paymentMethod: svc.paymentMethod ?? null,
        freeCancelUntil: svc.freeCancelUntil ?? null,
      });
    } else {
      // Sin trabajo activo → ir al centro de soporte para reportar
      const params = new URLSearchParams({
        contactId: String(entry.personId),
        contactName: entry.person?.name ?? "Contacto",
        specialty: entry.specialty ?? "",
      });
      navigate(`/support?${params.toString()}`);
    }
  };

  return (
    <div className="container px-4 py-6 md:py-8 max-w-2xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Mis Contactos de Confianza</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Registro de tus interacciones en la plataforma.</p>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex gap-1 p-1 bg-card rounded-xl border border-border/50">
        <button
          onClick={() => setMainTab("contacts")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mainTab === "contacts" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Mis Contactos
        </button>
        <button
          onClick={() => setMainTab("trusted")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mainTab === "trusted" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Star className="w-3.5 h-3.5" />
          {trustedLabel}
        </button>
      </div>

      {/* ─── Tab: Mis Contactos ─── */}
      {mainTab === "contacts" && (
        <>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === f.value ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50 text-muted-foreground'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : filteredContacts.length > 0 ? (
              <div className="divide-y divide-border/30 rounded-xl border border-border/40 overflow-hidden bg-card">
                {filteredContacts.map((entry) => (
                  <div
                    key={entry.serviceId}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                      entry.status === "active" ? "cursor-pointer hover:bg-muted/30 active:bg-muted/40" : ""
                    }`}
                    onClick={entry.status === "active" ? () => handleContactClick(entry) : undefined}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10 border border-primary/20 overflow-hidden">
                      {entry.person?.avatarUrl ? (
                        <img src={entry.person.avatarUrl} alt={entry.person.name} className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle2 className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {entry.person?.name ?? (isClient ? "Esperando experto" : "Cliente")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{entry.specialty}</p>
                      <p className="text-xs text-muted-foreground/70">
                        {format(new Date(entry.displayDate), "dd 'de' MMMM, yyyy 'a las' HH:mm 'hrs'", { locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Estado vacío por pestaña */
              <div className="text-center py-10 px-4 bg-muted/30 rounded-xl border border-dashed space-y-4">
                <UserCircle2 className="w-12 h-12 mx-auto mb-1 text-muted-foreground/30" />
                <div>
                  <h3 className="text-base font-medium mb-1">
                    {statusFilter === "active"
                      ? "Sin trabajos activos"
                      : statusFilter === "closed"
                        ? "Sin trabajos cerrados"
                        : "Sin trabajos cancelados"}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {statusFilter === "active"
                      ? (isClient
                        ? "Los trabajos en curso aparecerán aquí."
                        : "Los trabajos que estés realizando aparecerán aquí.")
                      : "Los trabajos de esta categoría aparecerán aquí cuando corresponda."}
                  </p>
                </div>
                {isClient && statusFilter === "active" && (
                  <Button asChild className="fixgo-gradient font-bold text-white w-full max-w-xs" size="sm">
                    <Link href="/services/new">Publicar una Necesidad</Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Tab: Técnicos / Clientes de Confianza ─── */}
      {mainTab === "trusted" && (
        <div>
          {favsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : favorites && favorites.length > 0 ? (
            <div className="divide-y divide-border/30 rounded-xl border border-border/40 overflow-hidden bg-card">
              {favorites.map((fav) => (
                <div key={fav.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10 border border-primary/20 cursor-pointer overflow-hidden"
                    onClick={() => setDirectChat({ userId: fav.user.id, name: fav.user.name, avatar: fav.user.avatarUrl })}
                  >
                    {fav.user.avatarUrl ? (
                      <img src={fav.user.avatarUrl} alt={fav.user.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle2 className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setDirectChat({ userId: fav.user.id, name: fav.user.name, avatar: fav.user.avatarUrl })}
                  >
                    <p className="font-semibold text-sm text-foreground truncate flex items-center gap-1.5">
                      {fav.user.name}
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    </p>
                    {fav.user.bio && (
                      <p className="text-xs text-muted-foreground truncate">{fav.user.bio}</p>
                    )}
                    {fav.user.rating && (
                      <p className="text-xs text-muted-foreground">{fav.user.rating.toFixed(1)} ★ · {fav.user.totalReviews ?? 0} reseñas</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
                      style={{ background: "hsl(213 100% 55% / 0.15)", color: "hsl(213 100% 65%)" }}
                      onClick={() => setDirectChat({ userId: fav.user.id, name: fav.user.name, avatar: fav.user.avatarUrl })}
                      title="Escribir mensaje"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {isClient && (
                      <Button
                        size="sm"
                        className="shrink-0 gap-1.5 fixgo-gradient font-bold text-white text-xs px-3"
                        onClick={() => navigate(`/services/new?directWorkerId=${fav.user.id}&workerName=${encodeURIComponent(fav.user.name)}`)}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Solicitar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 px-4 bg-muted/30 rounded-xl border border-dashed">
              <Star className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <h3 className="text-base font-medium mb-1">Sin {trustedLabel.toLowerCase()} aún</h3>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                {isClient
                  ? "Después de completar un servicio podrás agregar al técnico como Técnico de Confianza."
                  : "Después de completar un servicio podrás agregar al cliente como Cliente de Confianza."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Chat del servicio activo (ProposalChatSheet) */}
      {serviceChat && (
        <ProposalChatSheet
          open={!!serviceChat}
          onOpenChange={(v) => { if (!v) setServiceChat(null); }}
          serviceId={serviceChat.serviceId}
          workerId={serviceChat.workerId}
          workerName={serviceChat.workerName}
          workerAvatar={serviceChat.workerAvatar}
          otherUserId={serviceChat.otherUserId}
          budgetNote={serviceChat.budgetNote}
          requestQuote={serviceChat.requestQuote}
          iAmClient={!!isClient}
          serviceStatus={serviceChat.serviceStatus ?? null}
          paymentMethod={serviceChat.paymentMethod ?? null}
          freeCancelUntil={serviceChat.freeCancelUntil ?? null}
        />
      )}

      {/* Chat directo (favoritos sin servicio activo) */}
      {directChat && (
        <DirectChatSheet
          open={!!directChat}
          onOpenChange={(v) => { if (!v) setDirectChat(null); }}
          otherUserId={directChat.userId}
          otherUserName={directChat.name}
          otherUserAvatar={directChat.avatar}
        />
      )}
    </div>
  );
}
