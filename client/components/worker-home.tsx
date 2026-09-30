import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useListServices, useUpdateWorkerAvailability, useListCategories, useArriveService, useStartService, getListServicesQueryKey, getListNotificationsQueryKey } from "@/api";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@/api";
import WorkerOnboarding from "@/components/worker-onboarding";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Clock, ChevronRight, ChevronUp, ChevronDown, Zap, Navigation, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { NativeMap, type NativeMapHandle, type NativeMarkerSpec, type NativeCircleSpec } from "./native-map";
import { getLastKnownPosition, getGeolocationStatus, onGeolocationStatusChange, watchPosition, type GeoStatus } from "@/lib/geolocation";
import { GeoPermissionBanner } from "./geo-permission-banner";
import { useSmoothPosition } from "@/lib/use-smooth-position";
import { getSocket } from "@/hooks/use-socket";
import HomeAlerts from "@/components/home-alerts";
import ActiveServiceQuickCard from "@/components/active-service-quick-card";
import { ProposalChatSheet } from "@/components/proposal-chat-sheet";
import { ClientIdentity } from "@/components/client-identity";

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9a9a9a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d0d0d0" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#808080" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#333333" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111111" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#aaaaaa" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#3d3d3d" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#c0c0c0" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#505050" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#222222" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#888888" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a3a3a" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#1f1f1f" }] },
  { featureType: "landscape.natural", elementType: "geometry.fill", stylers: [{ color: "#141414" }] },
];

function createWorkerUserSvg(color: string, emoji?: string): string {
  const e = emoji || "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="16" fill="${color}" stroke="#ffffff" stroke-width="4"/>
    <text x="20" y="26" text-anchor="middle" font-size="18">${e}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createServiceMarkerSvg(urgent: boolean): string {
  const fill = urgent ? "#ef4444" : "#22c55e";
  const stroke = urgent ? "#fca5a5" : "#86efac";
  const txt = urgent ? "⚡" : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="11" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="14" y="18" text-anchor="middle" font-size="12">${txt}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function WorkerMap({ userLat, userLng, accuracy, services, isAvailable, onServiceSelect, professionIcon, ready, hasRealFix, visible }: {
  userLat: number; userLng: number; accuracy?: number; services: any[]; isAvailable: boolean;
  onServiceSelect: (service: any) => void; professionIcon?: string; ready: boolean; hasRealFix: boolean; visible?: boolean;
}) {
  const mapRef = useRef<NativeMapHandle | null>(null);
  const [center, setCenter] = useState({ lat: userLat, lng: userLng });
  const [zoom, setZoom] = useState(16);

  const followModeRef = useRef(true);
  const programmaticMoveRef = useRef(false);
  const userLatRef = useRef(userLat);
  const userLngRef = useRef(userLng);
  useEffect(() => { userLatRef.current = userLat; userLngRef.current = userLng; }, [userLat, userLng]);

  useEffect(() => {
    if (!hasRealFix) return;
    if (!followModeRef.current) return;
    programmaticMoveRef.current = true;
    setCenter({ lat: userLat, lng: userLng });
    setZoom(16);
  }, [hasRealFix, userLat, userLng]);

  const handleCameraIdle = useCallback(({ lat, lng, zoom: mapZoom }: { lat: number; lng: number; zoom?: number }) => {
    if (programmaticMoveRef.current) {
      programmaticMoveRef.current = false;
      return;
    }
    const dLat = lat - userLatRef.current;
    const dLng = lng - userLngRef.current;
    const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
    if (approxMeters > 40) {
      followModeRef.current = false;
    }
    if (typeof mapZoom === "number") {
      setZoom(mapZoom);
    }
  }, []);

  const handleRecenter = useCallback(() => {
    // Solo centrar si hay un fix GPS real. Si no hay fix, el botón no hace nada
    // (evita mandar el mapa a coordenadas incorrectas del caché o DB).
    if (!hasRealFix) return;
    followModeRef.current = true;
    programmaticMoveRef.current = true;
    setCenter({ lat: userLat, lng: userLng });
    setZoom(16);
  }, [hasRealFix, userLat, userLng]);

  // El dot del worker se renderiza como Marker en píxeles (NO como Circle en
  // metros) para que mantenga su tamaño visible al alejar el zoom.
  // Usamos un PNG estático en /public/user-location-dot.png — el plugin
  // nativo descarta data: URIs (los trata como path relativo).
  const markers = useMemo<NativeMarkerSpec[]>(() => {
    const list: NativeMarkerSpec[] = [];
    // Solo mostrar el dot del usuario cuando hay un fix GPS real.
    // Si hasRealFix es false la posición es caché/fallback (ubicación incorrecta).
    if (hasRealFix) {
      list.push({
        id: "__user__",
        lat: userLat,
        lng: userLng,
        iconUrl: (() => {
          try { if ((window as any).Capacitor?.isNativePlatform?.()) return "/user-location-dot.png"; } catch {}
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#1a8cf8" stroke="#ffffff" stroke-width="5"/><circle cx="24" cy="24" r="9" fill="rgba(255,255,255,0.45)"/></svg>`;
          return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        })(),
        iconSize: { width: 28, height: 28 },
        iconAnchor: { x: 14, y: 14 },
        title: "Mi posición",
        zIndex: 1000,
      });
    }
    if (isAvailable) {
      for (const s of services) {
        if (!s.lat || !s.lng) continue;
        list.push({
          id: `s-${s.id}`,
          lat: s.lat,
          lng: s.lng,
          iconUrl: createServiceMarkerSvg(!!s.isUrgent),
          iconSize: { width: 28, height: 28 },
          iconAnchor: { x: 14, y: 14 },
        });
      }
    }
    return list;
  }, [isAvailable, services, userLat, userLng]);

  // Halo de precisión del GPS (Circle en metros — escala con el zoom porque
  // representa una distancia geográfica real). Se oculta si la accuracy es
  // mala (>=500m) para no tapar la pantalla de amarillo translúcido.
  const circles = useMemo<NativeCircleSpec[]>(() => {
    if (!hasRealFix || !accuracy || accuracy >= 500) return [];
    const haloColor = isAvailable ? "#1a8cf8" : "#666666";
    return [{
      id: "__user_halo__",
      lat: userLat, lng: userLng, radius: accuracy,
      fillColor: haloColor, fillOpacity: 0.15,
      strokeColor: haloColor, strokeOpacity: 0.4, strokeWidth: 1,
      zIndex: 1,
    }];
  }, [hasRealFix, accuracy, userLat, userLng, isAvailable]);

  const handleMarkerClick = useCallback((id: string) => {
    if (id === "__user__") return;
    if (!id.startsWith("s-")) return;
    const sid = Number(id.slice(2));
    const s = services.find((x: any) => x.id === sid);
    if (s) onServiceSelect(s);
  }, [services, onServiceSelect]);

  return (
    <>
      <NativeMap
        ref={mapRef}
        center={center}
        zoom={zoom}
        markers={markers}
        circles={circles}
        styles={darkMapStyles}
        mapTypeId="Normal"
        onMarkerClick={handleMarkerClick}
        onCameraIdle={handleCameraIdle}
        className="absolute inset-0"
        visible={visible}
        pendingPosition={!hasRealFix}
      />
      <button
        onClick={handleRecenter}
        style={{
          position: "absolute", bottom: 80, right: 12, zIndex: 20,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(26,26,26,0.85)", border: "1.5px solid rgba(26,140,248,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)", cursor: "pointer", backdropFilter: "blur(6px)",
        }}
        title="Volver a mi posición"
      >
        <Navigation style={{ width: 16, height: 16, color: "#2563EB" }} />
      </button>
    </>
  );
}

export default function WorkerHome({ visible }: { visible?: boolean } = {}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const arriveServiceMutation = useArriveService();
  const startServiceMutation = useStartService();
  const [isAvailable, setIsAvailable] = useState(user?.isAvailable ?? false);
  const suspendedUntil = (user as any)?.suspendedUntil ? new Date((user as any).suspendedUntil) : null;
  const isSuspended = !!suspendedUntil && suspendedUntil.getTime() > Date.now();
  const effectiveAvailable = isAvailable && !isSuspended;
  const [showRequests, setShowRequests] = useState<boolean>(() => {
    try { return sessionStorage.getItem("fixgo_show_requests") !== "false"; } catch { return true; }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("fixgo_dismissed_requests");
      if (!stored) return new Set();
      const arr = JSON.parse(stored);
      return new Set(Array.isArray(arr) ? arr.filter((n: any) => typeof n === "number") : []);
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem("fixgo_dismissed_requests", JSON.stringify(Array.from(dismissedIds)));
    } catch {}
  }, [dismissedIds]);
  useEffect(() => {
    try { sessionStorage.setItem("fixgo_show_requests", String(showRequests)); } catch {}
  }, [showRequests]);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [activeChatService, setActiveChatService] = useState<any>(null);
  // 29-may-2026: NO pasar user.lat/lng del DB como inicial.
  // Las coords del DB pueden ser incorrectas (grabadas por un bug GPS antiguo).
  // useSmoothPosition usará localStorage (<1h) o fallback Santiago.
  const userLocation = useSmoothPosition();
  const [geoStatus, setGeoStatus] = useState<GeoStatus>(getGeolocationStatus());

  useEffect(() => onGeolocationStatusChange(setGeoStatus), []);

  const toggleAvailability = useUpdateWorkerAvailability();

  useEffect(() => {
    setIsAvailable(user?.isAvailable ?? false);
  }, [user?.isAvailable]);

  // Cuando el GPS llega por primera vez mientras ya está disponible,
  // persistir coords en BD de inmediato para que el motor de alertas los encuentre.
  const didPushInitialLocation = useRef(false);
  useEffect(() => {
    if (!effectiveAvailable || !user?.id || !userLocation.hasRealFix) return;
    if (didPushInitialLocation.current) return;
    didPushInitialLocation.current = true;
    toggleAvailability.mutate({
      id: user.id,
      data: { isAvailable: true, lat: userLocation.lat, lng: userLocation.lng },
    });
  }, [effectiveAvailable, user?.id, userLocation.hasRealFix]);

  // Reset el flag cuando el worker se desconecta
  useEffect(() => {
    if (!isAvailable) didPushInitialLocation.current = false;
  }, [isAvailable]);

  // ── Broadcast de ubicación en vivo mientras está "En línea" ─────────────
  // El servidor reparte el evento a todos los clientes para que el mapa
  // muestre al worker moviéndose en tiempo real (sin esperar al polling).
  useEffect(() => {
    if (!effectiveAvailable || !user?.id) return;
    const socket = getSocket();
    let lastSent = 0;
    let lastLat: number | null = null;
    let lastLng: number | null = null;
    const send = (lat: number, lng: number) => {
      socket.emit("worker:live_location", { lat, lng });
      lastSent = Date.now();
      lastLat = lat;
      lastLng = lng;
    };
    // Envía la posición conocida solo si ya hay un fix GPS real
    if (userLocation.hasRealFix) send(userLocation.lat, userLocation.lng);

    const stop = watchPosition((pos) => {
      const now = Date.now();
      let movedEnough = true;
      if (lastLat != null && lastLng != null) {
        const dLat = ((pos.lat - lastLat) * Math.PI) / 180;
        const dLng = ((pos.lng - lastLng) * Math.PI) / 180;
        const d = Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
        movedEnough = d > 15;
      }
      if (movedEnough || now - lastSent > 20_000) {
        send(pos.lat, pos.lng);
      }
    });
    // Heartbeat: reenvía cada 30s aunque no se mueva (para clientes nuevos)
    const heartbeat = setInterval(() => {
      if (lastLat != null && lastLng != null && Date.now() - lastSent > 25_000) {
        send(lastLat, lastLng);
      }
    }, 30_000);
    return () => {
      stop();
      clearInterval(heartbeat);
    };
  }, [effectiveAvailable, user?.id, userLocation.hasRealFix]);

  // La barra inferior solo muestra servicios "open" — aquellos que ya pasaron
  // por la Fase 1 (Pro+, 15 s) Y la Fase 2 (cercanos 10 km, 30 s) sin ser tomados.
  // Los servicios "pending" y "alerting" se muestran ÚNICAMENTE via el modal
  // ServiceAlertModal (pantalla completa) para mantener la exclusividad de fases.
  const { data: openServicesData, isLoading } = useListServices({ status: "open" as any, limit: 100, noCount: "true" } as any, { query: { staleTime: 15_000, refetchInterval: 20_000 } } as any);
  const { data: workerServicesData } = useListServices(
    { workerId: user?.id, limit: 50 } as any,
    { query: { enabled: !!user?.id, staleTime: 15_000, refetchInterval: 20_000 } } as any,
  );

  // ── Tracking de viewers en tiempo real ──────────────────────────────────
  // Ref que mantiene el set de serviceIds que estamos reportando como "viendo"
  const viewedServiceIdsRef = useRef<Set<number>>(new Set());

  // ── Push en tiempo real de nuevas solicitudes ─────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const refreshServices = () => {
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    };

    const onNewServiceRequest = (payload: { serviceId: number; title?: string }) => {
      refreshServices();
    };

    // Motor: servicio disponible en barra (phase 3), tomado o expirado
    // service:active_alert → alerta inmediata para workers Pro Max (fase 1a)
    const socket = getSocket();
    socket.on("new_service_request", onNewServiceRequest);
    socket.on("service:available", refreshServices);
    socket.on("service:taken", refreshServices);
    socket.on("service:alert_expired", refreshServices);
    socket.on("service:active_alert", refreshServices);

    return () => {
      socket.off("new_service_request", onNewServiceRequest);
      socket.off("service:available", refreshServices);
      socket.off("service:taken", refreshServices);
      socket.off("service:alert_expired", refreshServices);
      socket.off("service:active_alert", refreshServices);
    };
  }, [user?.id, queryClient]);
  const { data: categoriesData } = useListCategories({ query: { staleTime: 30 * 60_000 } } as any);

  // Solo servicios "open" en la barra inferior.
  const allPendingServices = (openServicesData?.services) || [];
  const workerActiveServices: any[] = ((workerServicesData as any)?.services || [])
    .filter((service: any) => ["accepted", "in_progress"].includes(service.status));
  const activeWorkerService = workerActiveServices[0] ?? null;
  const workerCategoryId = (user as any).categoryId;
  const workerCategory = (categoriesData as any[])?.find((c: any) => c.id === workerCategoryId);
  const professionIcon = workerCategory?.icon || undefined;

  // Fase 2 — Bandeja (segundo plano): el servidor ya filtró por categoría y
  // emitió solo a este worker. Aquí NO filtramos por distancia (el motor
  // envía la orden a TODOS los workers activos de la categoría sin límite
  // de km). Solo calculamos _distKm para ordenar de cercano a lejano y
  // mostrarla en la tarjeta como referencia.
  const pendingServices = (effectiveAvailable ? allPendingServices : [])
    .map((s: any) => {
      if (!s.lat || !s.lng) return { ...s, _distKm: null };
      const R = 6371;
      const dLat = ((s.lat - userLocation.lat) * Math.PI) / 180;
      const dLng = ((s.lng - userLocation.lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((userLocation.lat * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return { ...s, _distKm: R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
    })
    .sort((a: any, b: any) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      if (a._distKm === null) return 1;
      if (b._distKm === null) return -1;
      return a._distKm - b._distKm;
    });

  // ── Emitir view_start/end cuando cambia la lista visible ─────────────────
  // Los IDs de servicios que el worker ve ahora mismo en la barra
  const visibleServiceIds = useMemo(() => {
    if (!effectiveAvailable || !showRequests) return [] as number[];
    return pendingServices
      .filter((s: any) => !dismissedIds.has(s.id))
      .map((s: any) => s.id as number);
  }, [effectiveAvailable, showRequests, pendingServices, dismissedIds]);

  useEffect(() => {
    if (!user?.id) return;
    const socket = getSocket();
    const newSet = new Set(visibleServiceIds);
    const prevSet = viewedServiceIdsRef.current;

    for (const sid of prevSet) {
      if (!newSet.has(sid)) socket.emit("service:view_end", sid);
    }
    for (const sid of newSet) {
      if (!prevSet.has(sid)) socket.emit("service:view_start", sid);
    }
    viewedServiceIdsRef.current = newSet;

    return () => {
      for (const sid of viewedServiceIdsRef.current) {
        socket.emit("service:view_end", sid);
      }
      viewedServiceIdsRef.current = new Set();
    };
  }, [visibleServiceIds, user?.id]);

  const handleToggle = async () => {
    if (!user) return;
    if (isSuspended) {
      toast.error("Tu cuenta está suspendida temporalmente y no puede recibir trabajos.");
      return;
    }
    // Evita clicks múltiples mientras la mutación está en curso (race condition).
    if (toggleAvailability.isPending) return;
    const newState = !isAvailable;
    if (newState && (user as any).kycStatus !== "approved") {
      setLocation("/kyc");
      return;
    }
    setIsAvailable(newState);
    try {
      // Al activarse, incluir coordenadas actuales para que el motor de alertas
      // pueda ubicar al worker desde el primer momento (sin esperar al socket GPS).
      const locationData =
        newState && userLocation.hasRealFix
          ? { isAvailable: newState, lat: userLocation.lat, lng: userLocation.lng }
          : { isAvailable: newState };
      await toggleAvailability.mutateAsync({
        id: user.id,
        data: locationData,
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: any) {
      setIsAvailable(!newState);
      const msg = e?.data?.error ?? e?.data?.message ?? e?.message ?? "Error al actualizar la disponibilidad";
      const clean = typeof msg === "string" ? msg.replace(/^HTTP \d+[^:]*:\s*/i, "") : "Error al actualizar la disponibilidad";
      toast.error(clean);
    }
  };

  const getDistanceText = (service: any) => {
    if (!service.lat || !service.lng) return null;
    const R = 6371;
    const dLat = ((service.lat - userLocation.lat) * Math.PI) / 180;
    const dLng = ((service.lng - userLocation.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((userLocation.lat * Math.PI) / 180) * Math.cos((service.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < 1) return `~${Math.round(dist * 1000)} metro`;
    return `~${dist.toFixed(1)} km`;
  };

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Justo ahora";
    if (mins < 60) return `${mins} min.`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h`;
  };

  if (!user) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute inset-0 z-0">
        <WorkerMap
          userLat={userLocation.lat}
          userLng={userLocation.lng}
          accuracy={userLocation.accuracy}
          services={pendingServices}
           isAvailable={effectiveAvailable}
          onServiceSelect={(s) => { setSelectedService(s); setShowRequests(false); }}
          professionIcon={professionIcon}
          ready={userLocation.ready}
          hasRealFix={userLocation.hasRealFix}
          visible={visible}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 z-10 p-3">
        <GeoPermissionBanner status={geoStatus} />
      </div>

      <div className="relative z-10 p-4 space-y-3">
        <WorkerOnboarding user={user as any} />

        {isSuspended && suspendedUntil && (
          <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 flex gap-2.5">
            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cuenta suspendida temporalmente</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No recibirás solicitudes ni podrás enviar propuestas hasta el{" "}
                <strong>{suspendedUntil.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleToggle}
            className={`rounded-full py-1.5 px-5 flex items-center justify-center gap-2 text-xs font-semibold shadow-md transition-all active:scale-[0.97] ${
              effectiveAvailable
                ? 'bg-primary text-white border border-primary/80'
                : 'bg-card text-foreground border border-primary/50'
            }`}
          >
            {effectiveAvailable ? (
              <>
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse flex-shrink-0" />
                <span>EN LÍNEA — Recibiendo solicitudes</span>
              </>
            ) : (
              <>
                <div className="w-3 h-0.5 bg-primary rounded-full" />
                <span>Conectarse</span>
                <div className="w-3 h-0.5 bg-primary rounded-full" />
              </>
            )}
          </button>
        </div>

        {activeWorkerService &&
          !activeWorkerService.workerCompletedAt &&
          !activeWorkerService.clientCompletedAt && (
          <ActiveServiceQuickCard
            service={activeWorkerService}
            counterpartName={activeWorkerService.client?.name}
            onChat={() => setActiveChatService(activeWorkerService)}
            onArrive={() => arriveServiceMutation.mutate(
              { id: activeWorkerService.id },
              {
                onSuccess: () => {
                  toast.success("Llegada registrada. El trabajo comenzará automáticamente en 10 minutos.");
                  queryClient.invalidateQueries({
                    queryKey: getListServicesQueryKey({ workerId: user?.id, limit: 50 }),
                  });
                },
                onError: (error) => toast.error(error.message || "No se pudo registrar la llegada"),
              },
            )}
            arriving={arriveServiceMutation.isPending}
            onStart={() => startServiceMutation.mutate(
              { id: activeWorkerService.id },
              {
                onSuccess: () => {
                  toast.success("Trabajo iniciado");
                  queryClient.invalidateQueries({
                    queryKey: getListServicesQueryKey({ workerId: user?.id, limit: 50 }),
                  });
                },
                onError: (error) => toast.error(error.message || "No se pudo iniciar el trabajo"),
              },
            )}
            starting={startServiceMutation.isPending}
            onGoToJobs={() => setLocation("/mis-trabajos")}
          />
        )}

        {/* Avisos persistentes: eligieron a otro / cancelaciones (X para cerrar) */}
        <HomeAlerts />

        {(user as any).kycStatus !== "approved" && (
          <Link href="/kyc">
            <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg border cursor-pointer active:scale-[0.98] transition-all ${
              (user as any).kycStatus === "pending"
                ? "bg-card border-amber-500/30"
                : (user as any).kycStatus === "rejected"
                ? "bg-card border-red-500/30"
                : "bg-card border-primary/30"
            }`}>
              {(user as any).kycStatus === "pending" ? (
                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
              ) : (user as any).kycStatus === "rejected" ? (
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-xs font-bold text-foreground">
                  {(user as any).kycStatus === "pending"
                    ? "Verificación en proceso"
                    : (user as any).kycStatus === "rejected"
                    ? "Verificación rechazada"
                    : "Verifica tu identidad"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {(user as any).kycStatus === "pending"
                    ? "Tus documentos están siendo revisados"
                    : (user as any).kycStatus === "rejected"
                    ? "Toca aquí para intentar nuevamente"
                    : "Necesitas verificar tu cédula para aceptar trabajos"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        )}
      </div>

      {selectedService && (
        <div className="absolute inset-0 z-20 flex items-end pointer-events-none">
          <div className="w-full pointer-events-auto">
            <div className={`mx-3 mb-3 rounded-3xl border shadow-2xl overflow-hidden ${selectedService.isUrgent ? "bg-[#1a0a0a] border-red-500/40" : "bg-card border-border/40"}`}>
              <div className={`h-1 w-full ${selectedService.isUrgent ? "bg-red-500" : "bg-green-500"}`} />
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedService.isUrgent && (
                      <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0">⚡ Urgente</span>
                    )}
                    <Badge variant="outline" className={`text-[10px] h-5 flex-shrink-0 ${selectedService.isUrgent ? "border-red-500/40 text-red-400" : "border-primary/30 text-primary"}`}>
                      {(selectedService as any).subcategory?.name || selectedService.category?.name || "General"}
                    </Badge>
                  </div>
                  <button onClick={() => setSelectedService(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none flex-shrink-0">✕</button>
                </div>

                <div>
                  <p className="text-lg font-black text-foreground leading-tight">{selectedService.title}</p>
                  {selectedService.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{selectedService.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl p-2.5 bg-muted">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distancia</p>
                    <p className="text-lg font-black text-foreground">{getDistanceText(selectedService) || "—"}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${selectedService.isUrgent ? "bg-red-950" : "bg-muted"}`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Estado</p>
                    <p className={`text-sm font-black ${selectedService.isUrgent ? "text-red-400" : "text-green-400"}`}>
                      {selectedService.isUrgent ? "⚡ Urgente" : "✓ Disponible"}
                    </p>
                  </div>
                </div>

                {selectedService.address && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{selectedService.address}</span>
                  </div>
                )}

                {selectedService.client && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                    <ClientIdentity
                      name={selectedService.client.name}
                      score={selectedService.client.clientRating}
                      variant="request"
                    />
                    <div className="ml-auto text-[10px] text-muted-foreground">{getTimeAgo(selectedService.createdAt)}</div>
                  </div>
                )}

                <button
                  onClick={() => setLocation(`/services/${selectedService.id}`)}
                  className={`w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
                    selectedService.isUrgent
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-primary text-black hover:bg-primary/90"
                  }`}
                >
                  Ver trabajo completo y enviar propuesta →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeChatService && user && (
        <ProposalChatSheet
          open={!!activeChatService}
          onOpenChange={(open) => { if (!open) setActiveChatService(null); }}
          serviceId={activeChatService.id}
          workerId={user.id}
          workerName={user.name}
          workerAvatar={user.avatarUrl}
          otherUserId={activeChatService.clientId || activeChatService.client?.id}
          iAmClient={false}
          proposalStatus="accepted"
          readOnly={false}
          serviceStatus={activeChatService.status}
          freeCancelUntil={activeChatService.freeCancelUntil}
          workerSelfieCompleted={!!activeChatService.workerSelfieUrl}
        />
      )}

      <div className="relative z-10 mt-auto">
        {/* Barra de solicitudes: solo sube (visible) cuando hay solicitudes pendientes */}
        {effectiveAvailable && pendingServices.filter((s: any) => !dismissedIds.has(s.id)).length > 0 ? (
        <div className="bg-card border-t border-border/50 rounded-t-3xl shadow-2xl max-h-[55vh] flex flex-col">
          <button
            onClick={() => setShowRequests(!showRequests)}
            className="flex items-center justify-center py-2 w-full"
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </button>

          <div className="flex items-center justify-between px-4 pb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">Solicitudes disponibles</span>
              {pendingServices.length > 0 && (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] h-5">
                  {pendingServices.length}
                </Badge>
              )}
            </div>
            <button onClick={() => setShowRequests(!showRequests)} className="p-1">
              {showRequests ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>

          {showRequests && (
            <div className="overflow-y-auto flex-1 px-3 pb-4 space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
                </div>
              ) : pendingServices.filter((s: any) => !dismissedIds.has(s.id)).length > 0 ? (
                <AnimatePresence initial={false}>
                  {pendingServices.filter((s: any) => !dismissedIds.has(s.id)).map((service: any) => {
                    const dist = getDistanceText(service);
                    const timeAgo = getTimeAgo(service.createdAt);
                    const urgent = service.isUrgent;
                    let draggedRef = { current: false };
                    return (
                      <motion.div
                        key={service.id}
                        layout
                        initial={{ opacity: 1, x: 0, height: "auto" }}
                        exit={{ opacity: 0, x: "110%", height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 400 }}
                        dragElastic={{ left: 0, right: 0.3 }}
                        onDragStart={() => { draggedRef.current = true; }}
                        onDragEnd={(_e, info) => {
                          if (info.offset.x > 90) {
                            setDismissedIds(prev => new Set(prev).add(service.id));
                          } else {
                            setTimeout(() => { draggedRef.current = false; }, 50);
                          }
                        }}
                        className={`rounded-2xl border overflow-hidden ${
                          urgent ? "border-red-500/25 shadow-sm" : "border-2 border-primary shadow-[0_0_0_2px_rgba(26,140,248,0.35),0_0_20px_rgba(26,140,248,0.6)]"
                        }`}
                        style={{ touchAction: "pan-y" }}
                      >
                        <div
                          onPointerDown={() => { draggedRef.current = false; }}
                          onClick={() => {
                            // Usamos onClick (no onPointerUp) para evitar el "click fantasma"
                            // que se filtra a la siguiente pantalla y abre la imagen del detalle.
                            if (!draggedRef.current) setLocation(`/services/${service.id}`);
                          }}
                          className={`p-3 cursor-pointer active:scale-[0.98] transition-transform select-none ${
                            urgent ? "bg-red-950" : "bg-muted"
                          }`}
                        >
                          <div className="flex gap-3 items-center">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${urgent ? "bg-red-500/15" : "bg-green-500/15"}`}>
                              <span className="text-xl">{urgent ? "🔴" : "🟢"}</span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                {urgent && (
                                  <span className="text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">Urgente</span>
                                )}
                                <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                                {dist && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Navigation className="w-2.5 h-2.5" />{dist}
                                  </span>
                                )}
                              </div>
                              <p className="text-base font-black text-foreground leading-tight truncate">{service.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${urgent ? "border-red-500/40 text-red-400" : "border-primary/30 text-primary"}`}>
                                  {(service as any).subcategory?.name || service.category?.name || 'General'}
                                </Badge>
                              </div>
                              <ClientIdentity
                                name={service.client?.name}
                                score={service.client?.clientRating}
                                variant="request"
                                className="mt-1.5"
                              />
                              {service.address && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{service.address}
                                </p>
                              )}
                            </div>

                            <ChevronRight className={`w-5 h-5 flex-shrink-0 ${urgent ? "text-red-400" : "text-muted-foreground"}`} />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Sin solicitudes para tu categoría</p>
                  <p className="text-xs mt-1">Las nuevas solicitudes aparecerán aquí</p>
                </div>
              )}
            </div>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}
