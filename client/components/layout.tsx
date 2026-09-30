import { ReactNode, useState, useCallback, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import ServiceAlertModal from "@/components/service-alert-modal";
import { LogOut, Home, Briefcase, Users, Bell, User as UserIcon, Settings2, Menu, X, Globe, TrendingUp, ShieldAlert, Search, ShieldCheck, Hammer, TicketCheck, MoreHorizontal, BarChart3, Tag, WifiOff, Crown, Package, ChevronRight, LayoutGrid, ClipboardList, BookOpen, Terminal, Ban, Camera, Lock, Trash2 } from "lucide-react";
import { useLogout, useListNotifications, getListServicesQueryKey, getListNotificationsQueryKey, getListMessagesQueryKey, getGetMeQueryKey, getGetKycStatusQueryKey } from "@/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useGlobalSocket } from "@/hooks/use-global-socket";
import { useNativeApp } from "@/hooks/use-native-app";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { haptic } from "@/lib/haptics";
import { BlockedAccountBanner, BlockedAccountHome } from "@/components/blocked-account-access";
import { applyAccountSuspension } from "@/lib/account-suspension";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, isClient, isWorker, isAdmin, logout: clearAuth, isRoleSwitched, originalRole, switchRole, isFletes } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminMoreOpen, setAdminMoreOpen] = useState(false);
  const isOnline = useNetworkStatus();
  const temporarySuspensionUntil = (user as any)?.suspendedUntil as string | Date | null | undefined;
  const isTemporarilySuspended = !!temporarySuspensionUntil
    && new Date(temporarySuspensionUntil).getTime() > Date.now();
  const isRestrictedAccount = !!user && (user.status === "blocked" || isTemporarilySuspended);
  const restrictedUntil = user?.status === "blocked"
    ? (user as any).blockedUntil
    : temporarySuspensionUntil;
  useNativeApp();
  const [newJobAlert, setNewJobAlert] = useState<{ serviceId: number; title: string; description: string; address?: string } | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();

  // Al cambiar de rol, navegar al inicio para limpiar contexto de conversación anterior
  useEffect(() => {
    const handler = () => setLocation("/");
    window.addEventListener("fixgo:role-switched", handler);
    return () => window.removeEventListener("fixgo:role-switched", handler);
  }, [setLocation]);

  const { data: notificationsData } = useListNotifications({ unreadOnly: true }, {
    query: {
      enabled: !!user && !isAdmin && !isRestrictedAccount,
      staleTime: 30_000,
      refetchInterval: !!user && !isAdmin && !isRestrictedAccount ? 30_000 : false,
      retry: false,
    } as any
  });
  const unreadCount = Array.isArray(notificationsData) ? notificationsData.length : 0;

  const handleNewServiceRequest = useCallback((data: any) => {
    if (!isWorker || isRestrictedAccount) return;
    setNewJobAlert(data);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setNewJobAlert(null), 15000);
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  }, [isWorker, isRestrictedAccount, queryClient]);

  const handleNewNotification = useCallback((data: any) => {
    if (isRestrictedAccount) return;
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ unreadOnly: true }) });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });

    const currentRole = isClient ? "client" : isWorker ? "worker" : null;
    const targetRole = data?.targetRole ?? null;
    if (targetRole && currentRole && targetRole !== currentRole) {
      const roleLabel = targetRole === "worker" ? "Prestador" : "Cliente";
      toast.info(`Tienes una nueva notificación en tu perfil de ${roleLabel}`, {
        duration: 6000,
        action: {
          label: `Cambiar a ${roleLabel}`,
          onClick: () => switchRole(targetRole).catch(() => {}),
        },
      });
    }
  }, [queryClient, isClient, isWorker, isRestrictedAccount, switchRole]);

  // Helper: matchea con frontera (fin de string o "/") para evitar que
  // sid=1 invalide también /services/10, /services/12, etc.
  const serviceKeyMatches = (key: any, sid: number) => {
    if (!Array.isArray(key)) return false;
    return key.some((k: any) => {
      if (typeof k !== "string") return false;
      const idx = k.indexOf(`/services/${sid}`);
      if (idx === -1) return false;
      const next = k.charAt(idx + `/services/${sid}`.length);
      return next === "" || next === "/" || next === "?";
    });
  };

  const handleGlobalServiceUpdated = useCallback((data: any) => {
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    const sid = typeof data?.serviceId === "number" ? data.serviceId : null;
    if (sid) {
      queryClient.invalidateQueries({ predicate: (q) => serviceKeyMatches(q.queryKey, sid) });
    }
  }, [queryClient]);

  const handleGlobalProposalUpdated = useCallback((data: any) => {
    const sid = typeof data?.serviceId === "number" ? data.serviceId : null;
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    if (sid) {
      queryClient.invalidateQueries({ predicate: (q) => serviceKeyMatches(q.queryKey, sid) });
    }
  }, [queryClient]);

  const handleGlobalNewMessage = useCallback((msg: any) => {
    if (!msg || isRestrictedAccount) return;
    const sid = typeof msg.serviceId === "number" ? msg.serviceId : null;
    if (sid) {
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(sid) });
    }
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ unreadOnly: true }) });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    // No mostrar toast si el mensaje es mío (lo envié yo)
    const myId = user?.id;
    if (myId && (msg?.senderId === myId || msg?.sender?.id === myId)) return;
    // Toast solo si no estoy ya viendo ese chat
    try {
      const onThisChat = sid != null && (
        location === `/services/${sid}` ||
        location.startsWith(`/services/${sid}/`)
      );
      if (!onThisChat) {
        const senderName = msg?.sender?.name || "Alguien";
        toast.success(`${senderName} te envió un mensaje`, {
          id: `new-msg-${msg?.id ?? ''}`,
          duration: 5000,
          action: sid ? { label: "Abrir", onClick: () => setLocation(`/services/${sid}`) } : undefined,
        });
        haptic?.("light");
      }
    } catch {}
  }, [queryClient, location, setLocation, user?.id, isRestrictedAccount]);

  // Sincroniza el badge de "no leídas" cuando otro dispositivo del mismo usuario
  // marca notificaciones como leídas (o el servidor emite por cualquier razón).
  const handleNotificationsUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ unreadOnly: true }) });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  }, [queryClient]);

  // Cambios de suscripción (pago confirmado, expirada por cron): refresca el
  // perfil ("yo soy") y las queries de useSubscription (claves ["subscription","me"]
  // y ["subscription","plans"]) para que el plan/badge se actualice sin recargar.
  const handleSubscriptionUpdated = useCallback((data: any) => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["subscription", "me"] });
    queryClient.invalidateQueries({ queryKey: ["subscription", "plans"] });
    if (data?.status === "active") toast.success("¡Tu suscripción está activa!");
    if (data?.status === "expired") toast.message("Tu suscripción expiró. Renuévala para seguir recibiendo solicitudes.");
  }, [queryClient]);

  // KYC: cuando admin aprueba/rechaza, refresca el perfil y el estado KYC.
  const handleKycUpdated = useCallback((data: any) => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetKycStatusQueryKey() });
    if (data?.status === "approved") toast.success("¡Tu identidad fue verificada!");
    if (data?.status === "rejected") toast.error(`KYC rechazado${data?.reason ? `: ${data.reason}` : ""}`);
  }, [queryClient]);

  // Nueva reseña recibida: refresca rating del perfil y listas de reseñas
  // (las keys de reviews-by-worker usan el path /api/reviews/worker/:id, así que
  // invalido por prefijo "/api/reviews" + el perfil del usuario actual).
  const handleReviewReceived = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey as any[]).some((k) => typeof k === "string" && k.startsWith("/api/reviews/")) });
  }, [queryClient]);

  const handleCancellationCharge = useCallback((data: { serviceId: number; action: string }) => {
    queryClient.invalidateQueries({ queryKey: ["cancellation-charges", "my"] });
    if (isClient && data?.action === "settled") {
      toast.success("El experto confirmó que recibió la transferencia.");
      setLocation("/");
    }
  }, [isClient, queryClient, setLocation]);

  const handleAccountStatusUpdated = useCallback((data: {
    status: "active" | "blocked";
    blockedUntil?: string | null;
    reason?: string;
  }) => {
    if (data?.status !== "active" && data?.status !== "blocked") return;

    // Patch first so the restricted shell changes in the same render as the
    // socket event, then confirm the complete user payload from /auth/me.
    queryClient.setQueryData(getGetMeQueryKey(), (current: any) => current
      ? {
          ...current,
          status: data.status,
          blockedUntil: data.status === "blocked" ? (data.blockedUntil ?? null) : null,
        }
      : current);
    void queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });

    if (data.status === "blocked") {
      toast.error("Tu cuenta fue bloqueada y quedó en modo restringido.");
    } else {
      toast.success("Tu cuenta fue desbloqueada. Ya puedes usar la aplicación.");
    }
  }, [queryClient]);

  const handleAccountSuspension = useCallback((data: {
    suspendedUntil?: string | null;
    level?: number;
  }) => {
    if (!data?.suspendedUntil) return;

    queryClient.setQueryData(getGetMeQueryKey(), (current: any) =>
      applyAccountSuspension(current, data));
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    toast.error("Tu cuenta quedó bloqueada temporalmente por una cancelación tardía.");
  }, [queryClient]);

  const handleAccountWarning = useCallback((data: {
    count?: number;
    remaining?: number;
  }) => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ unreadOnly: true }) });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    if (data?.count === 1) {
      toast.warning("Recibiste tu primera advertencia por cancelación tardía.");
    } else if (data?.count === 2) {
      toast.warning("Segunda advertencia: una nueva cancelación tardía bloqueará tu cuenta por 24 horas.");
    }
  }, [queryClient]);

  const { isConnected: isSocketConnected } = useGlobalSocket(user?.id ?? null, {
    onNewServiceRequest: handleNewServiceRequest,
    onNewNotification: handleNewNotification,
    onServiceUpdated: handleGlobalServiceUpdated,
    onProposalUpdated: handleGlobalProposalUpdated,
    onNewMessage: handleGlobalNewMessage,
    onNotificationsUpdated: handleNotificationsUpdated,
    onSubscriptionUpdated: handleSubscriptionUpdated,
    onKycUpdated: handleKycUpdated,
    onReviewReceived: handleReviewReceived,
    onCancellationCharge: handleCancellationCharge,
    onAccountStatusUpdated: handleAccountStatusUpdated,
    onAccountSuspension: handleAccountSuspension,
    onAccountWarning: handleAccountWarning,
  });

  // The socket is the primary path. If it is down, keep /auth/me fresh so an
  // admin action or an automatic expiry is still reflected without re-login.
  useEffect(() => {
    if (!user) return;
    if (isSocketConnected) {
      // A status change may have happened while the socket was reconnecting.
      void queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
      return;
    }
    const timer = window.setInterval(() => {
      void queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [user?.id, isSocketConnected, queryClient]);

  const handleLogout = async () => {
    try {
      await (logoutMutation.mutateAsync as any)();
    } finally {
      clearAuth();
      setLocation("/login");
    }
  };

  const handleBlockedAccountExpired = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient]);

  const navLinkClass = (path: string) =>
    `text-sm font-medium transition-colors hover:text-primary ${location === path ? 'text-primary' : 'text-muted-foreground'}`;

  const isActive = (path: string) => location === path || (path !== '/' && location.startsWith(path + '/'));

  const NavLinks = () => {
    if (!user) return null;

    if (isRestrictedAccount) {
      return (
        <nav className="flex items-center gap-1">
          <Link href="/profile" className={navLinkClass("/profile")}>
            <span className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-secondary/50"><UserIcon className="h-4 w-4" /> Perfil</span>
          </Link>
          <Link href="/support" className={navLinkClass("/support")}>
            <span className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-secondary/50"><TicketCheck className="h-4 w-4" /> Soporte</span>
          </Link>
        </nav>
      );
    }

    return (
      <nav className="flex items-center gap-1">
        <Link href="/" className={navLinkClass('/')}>
          <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Home className="w-4 h-4" /> Inicio</span>
        </Link>
        
        {isAdmin && !isRestrictedAccount && (
          <>
            <Link href="/admin" className={navLinkClass('/admin')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Settings2 className="w-4 h-4" /> Panel</span>
            </Link>
            <Link href="/admin/users" className={navLinkClass('/admin/users')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Users className="w-4 h-4" /> Usuarios</span>
            </Link>
            <Link href="/admin/kyc" className={navLinkClass('/admin/kyc')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><ShieldCheck className="w-4 h-4" /> KYC</span>
            </Link>
            <Link href="/admin/security-selfies" className={navLinkClass('/admin/security-selfies')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Camera className="w-4 h-4" /> Selfies</span>
            </Link>
            <Link href="/admin/categories" className={navLinkClass('/admin/categories')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Briefcase className="w-4 h-4" /> Categorías</span>
            </Link>
            <Link href="/admin/tickets" className={navLinkClass('/admin/tickets')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><TicketCheck className="w-4 h-4" /> Soporte</span>
            </Link>
          </>
        )}

        {(isClient || isWorker) && (
          <>
            <Link href="/services" className={navLinkClass('/services')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Briefcase className="w-4 h-4" /> Contactos</span>
            </Link>
            {isClient && (
              <Link href="/categories" className={navLinkClass('/categories')}>
                <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><LayoutGrid className="w-4 h-4" /> Categorías</span>
              </Link>
            )}
            <Link href="/mi-plan" className={navLinkClass('/mi-plan')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><Crown className="w-4 h-4" /> Mi Plan</span>
            </Link>
            <Link href="/mis-trabajos" className={navLinkClass('/mis-trabajos')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><ClipboardList className="w-4 h-4" /> Mis Trabajos</span>
            </Link>
          </>
        )}

        {(!isAdmin || isRestrictedAccount) && (
          <>
            <Link href="/notifications" className={navLinkClass('/notifications')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors relative">
                <Bell className="w-4 h-4" /> Alertas
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
            </Link>
            <Link href="/profile" className={navLinkClass('/profile')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><UserIcon className="w-4 h-4" /> Perfil</span>
            </Link>
            <Link href="/support" className={navLinkClass('/support')}>
              <span className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"><TicketCheck className="w-4 h-4" /> Soporte</span>
            </Link>
          </>
        )}
      </nav>
    );
  };

  const adminMoreItems = [
    { href: "/admin/categories", icon: Tag, label: "Categorías" },
    { href: "/admin/cancellations", icon: Ban, label: "Cancelaciones" },
    { href: "/admin/site-settings", icon: Globe, label: "Sitio Web" },
    { href: "/admin/coupons", icon: Crown, label: "Cupones" },
    { href: "/admin/subscriptions", icon: Crown, label: "Suscripciones" },
    { href: "/admin/subscription-stats", icon: TrendingUp, label: "Métricas SaaS" },
    { href: "/admin/logs", icon: Terminal, label: "Logs del servidor" },
    { href: "/admin/security-selfies", icon: Camera, label: "Selfies de seguridad" },
    { href: "/admin/blocked-users", icon: Lock, label: "Cuentas Bloqueadas" },
    { href: "/admin/account-deletion-requests", icon: Trash2, label: "Eliminación de cuentas" },
  ];

  const adminSidebarGroups = [
    {
      label: "General",
      items: [
        { href: "/admin", icon: Settings2, label: "Panel", exact: true },
        { href: "/admin/users", icon: Users, label: "Usuarios" },
      ],
    },
    {
      label: "Verificación",
      items: [
        { href: "/admin/kyc", icon: ShieldCheck, label: "KYC" },
        { href: "/admin/security-selfies", icon: Camera, label: "Selfies de seguridad" },
      ],
    },
    {
      label: "Contenido",
      items: [
        { href: "/admin/categories", icon: Tag, label: "Categorías" },
        { href: "/admin/site-settings", icon: Globe, label: "Sitio Web" },
      ],
    },
    {
      label: "Soporte",
      items: [
        { href: "/admin/tickets", icon: TicketCheck, label: "Tickets" },
        { href: "/admin/cancellations", icon: Ban, label: "Cancelaciones" },
        { href: "/admin/account-deletion-requests", icon: Trash2, label: "Eliminación de cuentas" },
      ],
    },
    {
      label: "Sistema",
      items: [
        { href: "/admin/logs", icon: Terminal, label: "Logs del servidor" },
      ],
    },
    {
      label: "Monetización",
      items: [
        { href: "/admin/plans", icon: Package, label: "Planes" },
        { href: "/admin/subscriptions", icon: Crown, label: "Suscripciones" },
        { href: "/admin/subscription-stats", icon: TrendingUp, label: "Métricas SaaS" },
        { href: "/admin/coupons", icon: Tag, label: "Cupones" },
      ],
    },
  ];

  const bottomNavItems = () => {
    if (!user) return [];

    if (isAdmin) {
      return [
        { href: "/admin", icon: Settings2, label: "Panel" },
        { href: "/admin/users", icon: Users, label: "Usuarios" },
        { href: "/admin/kyc", icon: ShieldCheck, label: "KYC" },
        { href: "/admin/security-selfies", icon: Camera, label: "Selfies" },
        { href: "/admin/tickets", icon: TicketCheck, label: "Soporte" },
      ];
    }

    if (isRestrictedAccount) {
      return [
        { href: "/profile", icon: UserIcon, label: "Perfil" },
        { href: "/support", icon: TicketCheck, label: "Soporte" },
      ];
    }

    if (isWorker) {
      return [
        { href: "/", icon: Home, label: "Inicio" },
        { href: "/services", icon: Briefcase, label: "Contactos" },
        { href: "/mi-plan", icon: Crown, label: "Mi Plan" },
        { href: "/mis-trabajos", icon: ClipboardList, label: "Mis Trabajos" },
        { href: "/profile", icon: UserIcon, label: "Perfil" },
      ];
    }

    return [
      { href: "/", icon: Home, label: "Inicio" },
      { href: "/services", icon: Briefcase, label: "Contactos" },
      { href: "/categories", icon: LayoutGrid, label: "Categorías" },
      { href: "/mis-trabajos", icon: ClipboardList, label: "Mis Trabajos" },
      { href: "/profile", icon: UserIcon, label: "Perfil" },
    ];
  };

  const navItems = bottomNavItems();

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-area-top">
        <div className="container flex h-[72px] items-center justify-between px-4 md:px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <Link href={isAdmin && !isRestrictedAccount ? "/admin" : "/"} className="flex items-center h-[72px]">
              <img
                src="/fixgo-logo.png?v=6"
                alt="Fixgo"
                className="fixgo-header-logo"
                style={{ height: 58, width: "auto", display: "block" }}
              />
            </Link>
            {(!isAdmin || isRestrictedAccount) && (
              <div className="hidden lg:flex">
                <NavLinks />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {isAdmin && !isRestrictedAccount && (
                  <span className="hidden lg:inline-flex text-xs font-bold text-primary border border-primary/30 bg-primary/10 px-3 py-1 rounded-full">
                    Administrador
                  </span>
                )}
                {isWorker && !isRestrictedAccount && (
                  <div className={`hidden sm:flex px-3 py-1 rounded-full text-xs font-bold ${user.isAvailable ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-muted text-muted-foreground border border-border'}`}>
                    {user.isAvailable ? 'En línea' : 'Desconectado'}
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={handleLogout} title="Cerrar sesión" className="hidden lg:flex text-muted-foreground hover:text-primary">
                  <LogOut className="w-5 h-5" />
                </Button>
                <div className="lg:hidden flex items-center gap-2">
                  {!isAdmin && !isRestrictedAccount && (
                    <button
                      onClick={() => setLocation("/notifications")}
                      className="relative p-1.5 text-muted-foreground hover:text-primary transition-colors"
                      aria-label="Notificaciones"
                    >
                      <Bell className="w-5 h-5" />
                      {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </button>
                  )}
                  {location === "/profile" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive px-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar sesión</span>
                    </Button>
                  ) : isAdmin && !isRestrictedAccount ? (
                    <span className="text-xs font-bold text-primary border border-primary/30 bg-primary/10 px-2.5 py-1 rounded-full">
                      Admin
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-primary border border-primary/30 bg-primary/10 px-2.5 py-1 rounded-full">
                      {isWorker ? "Soy Experto" : "Soy Usuario"}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors px-4 py-2 text-muted-foreground">
                  Iniciar sesión
                </Link>
                <Button asChild className="fixgo-gradient font-bold">
                  <Link href="/register">Registrarse</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>
      {isRestrictedAccount && (
        <BlockedAccountBanner
          blockedUntil={restrictedUntil}
          onExpired={handleBlockedAccountExpired}
        />
      )}
      {!isOnline && (
        <div className="w-full bg-destructive/90 text-destructive-foreground text-xs font-medium py-2 px-4 flex items-center justify-center gap-2 z-40">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          Sin conexión a internet
        </div>
      )}

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {isAdmin && !isRestrictedAccount && (
          <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border/50 bg-card/40 overflow-y-auto">
            <nav className="flex-1 px-3 py-4 space-y-5">
              {adminSidebarGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map(({ href, icon: Icon, label, exact }) => {
                      const active = exact ? location === href : (location === href || location.startsWith(href + '/'));
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                            active
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                          <span className="truncate">{label}</span>
                          {active && <ChevronRight className="w-3 h-3 ml-auto text-primary" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="px-3 pb-4 border-t border-border/50 pt-4 space-y-1">
              <Link
                href="/profile"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${location === '/profile' ? 'bg-primary/15 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
              >
                <UserIcon className="w-4 h-4 shrink-0" />
                <span>Mi Perfil</span>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </aside>
        )}

        {/* pb: alto del bottom nav (4rem) + safe-area del gesto de Android/iOS +
            alto del teclado nativo (--keyboard-height, seteado por use-native-app).
            El pb-[5rem] fijo anterior quedaba corto en teléfonos con barra de
            gestos y con el teclado abierto: el final de la página (p.ej. el botón
            Guardar de Mis Trabajos) quedaba tapado e inalcanzable con scroll. */}
        <main
          className="min-w-0 w-full max-w-full flex-1 flex flex-col overflow-y-auto overflow-x-clip pb-[calc(4.5rem_+_env(safe-area-inset-bottom,0px)_+_var(--keyboard-height,0px))] lg:pb-0"
        >
          {isRestrictedAccount && location !== "/profile" && location !== "/support" ? (
            <BlockedAccountHome
              blockedUntil={restrictedUntil}
            />
          ) : children}
        </main>

        {/* Alerta inmersiva Motor de Solicitudes — solo para expertos */}
        {isWorker && !isRestrictedAccount && <ServiceAlertModal />}
      </div>

      {newJobAlert && !isRestrictedAccount && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[9999] w-[92vw] max-w-sm" style={{ top: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="bg-card border-2 border-primary rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
            <div className="fixgo-gradient px-4 py-2 flex items-center gap-2">
              <Hammer className="w-4 h-4 text-black shrink-0" />
              <span className="text-xs font-bold text-black uppercase tracking-wide">¡Nuevo contacto cerca!</span>
              <button onClick={() => setNewJobAlert(null)} className="ml-auto text-black/70 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <p className="font-semibold text-foreground text-sm leading-snug">{newJobAlert.title}</p>
              {newJobAlert.description && (
                <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{newJobAlert.description}</p>
              )}
              {newJobAlert.address && (
                <p className="text-xs text-muted-foreground mt-1">📍 {newJobAlert.address}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="flex-1 fixgo-gradient font-bold text-white text-xs"
                  onClick={() => { setLocation(`/services/${newJobAlert.serviceId}`); setNewJobAlert(null); }}
                >
                  Ver publicación
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setNewJobAlert(null)}>
                  Ignorar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {user && (
        <>
          {adminMoreOpen && (
            <div
              className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
              onClick={() => setAdminMoreOpen(false)}
            >
              <div
                className="absolute bottom-16 left-0 right-0 bg-card border-t border-border/50 rounded-t-2xl p-4 pb-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-foreground">Más opciones</span>
                  <button onClick={() => setAdminMoreOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {adminMoreItems.map(({ href, icon: Icon, label }) => {
                    const active = isActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setAdminMoreOpen(false)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-[11px] font-medium text-center leading-tight">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t border-border/50 lg:hidden safe-area-bottom">
            <div className="flex items-center justify-around max-w-lg mx-auto h-16 px-1">
              {navItems.map(({ href, icon: Icon, label }) => {
                const active = href === '/' ? location === '/' : isActive(href);
                return (
                  <Link key={href} href={href} className="flex-1" onClick={() => haptic("light")}>
                    <div className={`flex flex-col items-center justify-center gap-0.5 py-1 transition-all active:scale-90 relative ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                      <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                      <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
                      {active && <div className="w-4 h-0.5 bg-primary rounded-full mt-0.5" />}
                    </div>
                  </Link>
                );
              })}
              {isAdmin && !isRestrictedAccount && (
                <button
                  className="flex-1"
                  onClick={() => { haptic("light"); setAdminMoreOpen((v) => !v); }}
                >
                  <div className={`flex flex-col items-center justify-center gap-0.5 py-1 transition-all active:scale-90 ${adminMoreOpen ? 'text-primary' : 'text-muted-foreground'}`}>
                    <MoreHorizontal className={`w-5 h-5 ${adminMoreOpen ? 'stroke-[2.5]' : ''}`} />
                    <span className={`text-[10px] ${adminMoreOpen ? 'font-bold' : 'font-medium'}`}>Más</span>
                    {adminMoreOpen && <div className="w-4 h-0.5 bg-primary rounded-full mt-0.5" />}
                  </div>
                </button>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
