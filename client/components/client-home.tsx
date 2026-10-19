import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetNearbyWorkers, useListCategories, useListServices, useGetServiceProposals, useAcceptProposal, useRejectProposal, getGetServiceProposalsQueryKey, getListServicesQueryKey, getServiceProposals } from "@/api";
import { getSocket } from "@/hooks/use-socket";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useGlobalSocket } from "@/hooks/use-global-socket";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Star, Clock, X, Check, XCircle, ChevronLeft, Loader2, Navigation, MessageCircle, LayoutGrid, ChevronRight, Users, Zap, RefreshCw, AlertCircle, Search, User, MapPin, Eye, ShieldCheck, BadgeCheck, ThumbsDown, MessageSquare } from "lucide-react";
import { ProposalChatSheet } from "@/components/proposal-chat-sheet";
import { getCategoryStyle, getCategoryMarkerColor, getCategoryEmoji } from "@/lib/category-icons";
import {
  getCategoryBrowserCategoryId,
  getCategoryBrowserReturnUrl,
  getCategoryBrowserServiceRequestUrl,
  isHomeCategoryBrowserLocation,
} from "@/lib/category-browser-navigation";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { NativeMap, type NativeMapHandle, type NativeMarkerSpec, type NativeCircleSpec } from "./native-map";
import { getLastKnownPosition, getGeolocationStatus, onGeolocationStatusChange, getCurrentPosition, type GeoStatus } from "@/lib/geolocation";
import { GeoPermissionBanner } from "./geo-permission-banner";
import { useSmoothPosition } from "@/lib/use-smooth-position";
import { toast } from "sonner";
import HomeAlerts from "@/components/home-alerts";
import ActiveServiceQuickCard from "@/components/active-service-quick-card";

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

const satelliteLabelsStyles: any[] = [
  { featureType: "all", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: "#ffffff" }, { weight: 0.5 }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ visibility: "on" }, { color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 4 }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: "#f5c518" }, { weight: 1 }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ visibility: "on" }, { color: "#ffffff" }] },
  { featureType: "administrative.locality", elementType: "labels.text.stroke", stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 4 }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ visibility: "on" }, { color: "#eeeeee" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.stroke", stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 3 }] },
];

const mapContainerStyle = { width: "100%", height: "100%" };

function createWorkerMarkerSvg(color: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
    <defs>
      <filter id="s" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
      </filter>
    </defs>
    <path d="M22 49 C22 49 4 32 4 18 A18 18 0 0 1 40 18 C40 32 22 49 22 49Z" fill="${color}" filter="url(#s)" stroke="#fff" stroke-width="2"/>
    <circle cx="22" cy="18" r="12" fill="#fff" opacity="0.95"/>
    <text x="22" y="23" text-anchor="middle" font-size="16">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// En web usamos un SVG data URI azul (nueva identidad de marca).
// En nativo se mantiene el PNG estático porque el plugin @capacitor/google-maps
// descarta data: URIs (los trata como path relativo → FileNotFoundException).
const _BLUE_DOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#1a8cf8" stroke="#ffffff" stroke-width="5"/><circle cx="24" cy="24" r="9" fill="rgba(255,255,255,0.45)"/></svg>`;
const USER_DOT_ICON_URL: string = (() => {
  try { if ((window as any).Capacitor?.isNativePlatform?.()) return "/user-location-dot.png"; } catch {}
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(_BLUE_DOT_SVG)}`;
})();

function ClientMap({ userLat, userLng, accuracy, workers, mapType, ready, hasRealFix, visible, showPulse }: { userLat: number; userLng: number; accuracy?: number; workers: any[]; mapType: "roadmap" | "satellite"; ready: boolean; hasRealFix: boolean; visible?: boolean; showPulse?: boolean }) {
  // `ready` viene del hook `useSmoothPosition` y pasa a true cuando el
  // GPS entrega un fix REAL (no el fallback hardcodeado de Santiago).
  // Mientras es false, mantenemos el placeholder de mapa visible para no
  // mostrar el mapa real centrado en Plaza de Armas a usuarios de otras
  // ciudades durante el cold start.
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const mapRef = useRef<NativeMapHandle | null>(null);
  const [center, setCenter] = useState({ lat: userLat, lng: userLng });
  const [zoom, setZoom] = useState(15);

  // Follow mode: cuando es true la camara sigue al GPS automaticamente
  // (comportamiento por defecto, como Google Maps/Uber). Se desactiva cuando
  // el usuario mueve el mapa manualmente. El boton de recentrar lo reactiva.
  const followModeRef = useRef(true);
  // Flag para distinguir movimientos de camara programaticos (los nuestros)
  // de los del usuario. Lo activamos ANTES de setCenter; lo limpiamos en
  // onCameraIdle. Si idle llega sin el flag → fue el usuario quien murio.
  const programmaticMoveRef = useRef(false);
  // Refs para comparar en onCameraIdle sin capturar variables del closure
  const userLatRef = useRef(userLat);
  const userLngRef = useRef(userLng);
  useEffect(() => { userLatRef.current = userLat; userLngRef.current = userLng; }, [userLat, userLng]);

  // Cuando llega un nuevo fix GPS y el follow mode esta activo, la camara sigue
  useEffect(() => {
    if (!hasRealFix) return;
    if (!followModeRef.current) return;
    programmaticMoveRef.current = true;
    setCenter({ lat: userLat, lng: userLng });
    setZoom(15);
  }, [hasRealFix, userLat, userLng]);

  const handleCameraIdle = useCallback(({ lat, lng }: { lat: number; lng: number; zoom?: number }) => {
    if (programmaticMoveRef.current) {
      programmaticMoveRef.current = false;
      return;
    }
    // Si la camara quedo a mas de ~40m del GPS → fue el usuario quien paneo
    const dLat = lat - userLatRef.current;
    const dLng = lng - userLngRef.current;
    const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
    if (approxMeters > 40) {
      followModeRef.current = false;
    }
  }, []);

  const handleRecenter = useCallback(() => {
    if (!hasRealFix) {
      // 15-jun-2026: antes el botón devolvía silenciosamente sin hacer nada
      // cuando no había fix GPS. Ahora avisa al usuario y solicita activamente
      // una posición fresca para salir del estado "sin fix" más rápido.
      toast.info("Obteniendo tu ubicación…", { duration: 3000 });
      // Forzar un intento de getCurrentPosition para despertar el GPS si estaba
      // en cold-start. El resultado llega a useSmoothPosition vía watchPosition,
      // que ya está corriendo; esto sólo acelera el primer fix.
      getCurrentPosition().catch(() => {});
      return;
    }
    followModeRef.current = true;
    programmaticMoveRef.current = true;
    // Llamar panTo directamente en el mapa para garantizar la animación de
    // cámara aunque las coordenadas de estado no hayan cambiado (ej. el usuario
    // alejó el zoom pero el GPS no se movió → setCenter no dispararía re-render).
    mapRef.current?.panTo({ lat: userLat, lng: userLng }, 15);
    setCenter({ lat: userLat, lng: userLng });
    setZoom(15);
  }, [hasRealFix, userLat, userLng]);

  // Construir lista de markers memoizada. Incluye:
  //  - El DOT del usuario (`__user__`) como marker en píxeles → mantiene
  //    SIEMPRE el mismo tamaño en pantalla, sin importar el zoom.
  //    (Antes era un Circle en metros que desaparecía al alejar el zoom.)
  //  - Cada worker disponible/ocupado.
  const markers = useMemo<NativeMarkerSpec[]>(() => {
    const list: NativeMarkerSpec[] = [];
    // Solo mostrar el dot del usuario cuando hay un fix GPS real.
    // Si hasRealFix es false la posición es caché/fallback (ubicación incorrecta).
    if (hasRealFix) {
      list.push({
        id: "__user__",
        lat: userLat,
        lng: userLng,
        iconUrl: USER_DOT_ICON_URL,
        iconSize: { width: 28, height: 28 },
        iconAnchor: { x: 14, y: 14 },
        title: "Tu ubicación",
        zIndex: 1000,
      });
    }
    for (const w of workers) {
      if (!w.lat || !w.lng) continue;
      const catIcon = w.category?.icon;
      const color = w.isAvailable ? getCategoryMarkerColor(catIcon) : "#666666";
      const emoji = getCategoryEmoji(catIcon);
      list.push({
        id: `w-${w.id}`,
        lat: w.lat,
        lng: w.lng,
        iconUrl: createWorkerMarkerSvg(color, emoji),
        iconSize: { width: 44, height: 52 },
        iconAnchor: { x: 22, y: 50 },
        title: w.name,
      });
    }
    return list;
  }, [workers, userLat, userLng, hasRealFix]);

  // Halo de precisión del GPS (Circle en metros — escala con el zoom porque
  // representa una distancia geográfica real). Solo se muestra si la accuracy
  // es razonable (<500m); con valores más altos taparía toda la pantalla.
  const circles = useMemo<NativeCircleSpec[]>(() => {
    if (!hasRealFix || !accuracy || accuracy >= 500) return [];
    return [{
      id: "__user_halo__",
      lat: userLat, lng: userLng, radius: accuracy,
      fillColor: "#2563EB", fillOpacity: 0.15,
      strokeColor: "#2563EB", strokeOpacity: 0.4, strokeWidth: 1,
      zIndex: 1,
    }];
  }, [hasRealFix, accuracy, userLat, userLng]);

  const handleMarkerClick = useCallback((id: string) => {
    if (id === "__user__") return;
    const wid = id.startsWith("w-") ? Number(id.slice(2)) : null;
    if (wid == null) return;
    const w = workers.find((x: any) => x.id === wid);
    if (w) {
      setSelectedWorker(w);
      mapRef.current?.panTo({ lat: w.lat, lng: w.lng }, 16);
    }
  }, [workers]);

  return (
    <>
      <NativeMap
        ref={mapRef}
        center={center}
        zoom={zoom}
        markers={markers}
        circles={circles}
        styles={mapType === "roadmap" ? darkMapStyles : satelliteLabelsStyles}
        mapTypeId={mapType === "satellite" ? "Satellite" : "Normal"}
        onMarkerClick={handleMarkerClick}
        onCameraIdle={handleCameraIdle}
        className="absolute inset-0"
        visible={visible}
        pendingPosition={!hasRealFix}
        pulsePosition={showPulse && hasRealFix ? { lat: userLat, lng: userLng } : undefined}
      />

      {/* Card del worker seleccionado, como bottom sheet */}
      <AnimatePresence>
        {selectedWorker && (
          <motion.div
            key="worker-card"
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 200, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="absolute left-3 right-3 bottom-24 z-30"
          >
            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 shadow-2xl">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{selectedWorker.name}</div>
                  {selectedWorker.category && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {getCategoryEmoji(selectedWorker.category.icon)} {selectedWorker.category.name}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>⭐ {selectedWorker.rating?.toFixed(1) || "Nuevo"} ({selectedWorker.totalReviews})</span>
                    {selectedWorker.distanceKm != null && (
                      <span>📍 {selectedWorker.distanceKm.toFixed(1)} km</span>
                    )}
                  </div>
                  <div className={`text-xs font-semibold mt-1.5 ${selectedWorker.isAvailable ? "text-green-500" : "text-muted-foreground"}`}>
                    {selectedWorker.isAvailable ? "● Disponible" : "● Ocupado"}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWorker(null)}
                  className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleRecenter}
        style={{
          position: "absolute", bottom: 160, right: 12, zIndex: 20,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(26,26,26,0.85)", border: "1.5px solid rgba(26,140,248,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)", cursor: "pointer", backdropFilter: "blur(6px)",
        }}
        title="Volver a mi ubicación"
      >
        <Navigation style={{ width: 16, height: 16, color: "#2563EB" }} />
      </button>

      {/* Botón de activar ubicación — visible cuando no hay fix GPS */}
      {!hasRealFix && (
        <button
          onClick={() => {
            toast.info("Activando ubicación…", { duration: 3000 });
            getCurrentPosition().catch(() => {});
          }}
          style={{
            position: "absolute", bottom: 204, right: 12, zIndex: 20,
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(26,26,26,0.85)", border: "1.5px solid rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)", cursor: "pointer", backdropFilter: "blur(6px)",
          }}
          title="Activar ubicación"
        >
          <MapPin style={{ width: 16, height: 16, color: "#9ca3af" }} />
        </button>
      )}
    </>
  );
}

function CategoryBrowserSheet({
  open,
  onClose,
  categories,
  categoriesLoading,
  categoriesError,
  categoriesFetching,
  onRetry,
  onNavigate,
  expandedId,
  onExpandedChange,
}: {
  open: boolean;
  onClose: () => void;
  categories: any[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  categoriesFetching: boolean;
  onRetry: () => void;
  onNavigate: (categoryId: number, subcategoryId?: number) => void;
  expandedId: number | null;
  onExpandedChange: (categoryId: number | null) => void;
}) {
  const expandedCat = categories.find((c: any) => c.id === expandedId) ?? null;
  const hasSubs = (cat: any) => Array.isArray(cat.subcategories) && cat.subcategories.length > 0;

  const handleCategoryClick = (cat: any) => {
    if (expandedId === cat.id) {
      onExpandedChange(null);
      return;
    }
    if (!hasSubs(cat)) {
      onNavigate(cat.id);
      return;
    }
    onExpandedChange(cat.id);
  };

  const handleClose = () => {
    onExpandedChange(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cat-browser"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 340, damping: 34 }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
          style={{ touchAction: "pan-y" }}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-4 pt-5 pb-3 border-b border-border/40">
            <div>
              <h2 className="text-2xl font-black text-foreground tracking-tight">¿Qué necesitas?</h2>
              <p className="text-base text-muted-foreground mt-0.5">Toca una categoría para ver sus especialidades</p>
            </div>
            <button
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {categoriesLoading ? (
              <div role="status" aria-live="polite" className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
                <p className="text-sm font-medium text-muted-foreground">Cargando categorías…</p>
              </div>
            ) : categoriesError && categories.length === 0 ? (
              <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
                <div>
                  <p className="font-bold text-foreground">No pudimos cargar las categorías</p>
                  <p className="mt-1 text-sm text-muted-foreground">Revisa tu conexión e inténtalo de nuevo.</p>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={categoriesFetching}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${categoriesFetching ? "animate-spin" : ""}`} aria-hidden="true" />
                  Reintentar
                </button>
              </div>
            ) : categories.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                <LayoutGrid className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="font-bold text-foreground">Aún no hay categorías disponibles</p>
                  <p className="mt-1 text-sm text-muted-foreground">Vuelve más tarde para explorar los servicios.</p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                {categoriesError && (
                  <div role="status" className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                    <p className="text-sm text-foreground">No se pudieron actualizar las categorías. Mostramos las disponibles.</p>
                    <button
                      type="button"
                      onClick={onRetry}
                      disabled={categoriesFetching}
                      className="shrink-0 text-sm font-bold text-primary disabled:opacity-60"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
                {/* Grid de categorías con acordeón inline */}
                <div className="px-3 pt-3 pb-3 space-y-0">
                  {(() => {
                const COLS = 4;
                const rows: any[][] = [];
                for (let i = 0; i < categories.length; i += COLS) {
                  rows.push(categories.slice(i, i + COLS));
                }
                const expandedRowIdx = expandedId !== null
                  ? Math.floor(categories.findIndex((c: any) => c.id === expandedId) / COLS)
                  : -1;

                return rows.map((row, rowIdx) => (
                  <div key={rowIdx}>
                    {/* Fila de 4 categorías */}
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {row.map((cat: any) => {
                        const style = getCategoryStyle(cat.icon);
                        const CatIcon = style.icon;
                        const isExpanded = expandedId === cat.id;
                        const catHasSubs = hasSubs(cat);

                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => handleCategoryClick(cat)}
                            className={`relative flex flex-col items-center gap-2 px-1 py-3 rounded-2xl border-2 transition-all active:scale-[0.95] ${
                              isExpanded
                                ? "border-primary bg-card shadow-md"
                                : "border-border/40 bg-card hover:border-primary/40 hover:bg-primary/5"
                            }`}
                          >
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${style.bg} border-2 ${style.border} shadow-sm`}>
                              <CatIcon className={`w-7 h-7 ${style.color}`} strokeWidth={1.5} />
                            </div>
                            <span className={`text-center font-bold text-[11px] leading-tight px-0.5 line-clamp-2 ${isExpanded ? "text-primary" : "text-foreground"}`}>
                              {cat.name}
                            </span>
                            {catHasSubs && isExpanded && (
                              <div className="absolute top-2 right-2">
                                <ChevronDown className="w-3.5 h-3.5 text-primary" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                      {/* Relleno si la fila queda incompleta */}
                      {Array.from({ length: COLS - row.length }).map((_, i) => <div key={`fill-${i}`} />)}
                    </div>

                    {/* Panel de especialidades — se inserta debajo de la fila correcta */}
                    <AnimatePresence initial={false}>
                      {expandedRowIdx === rowIdx && expandedCat && hasSubs(expandedCat) && (
                        <motion.div
                          key={`subs-${expandedCat.id}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="overflow-hidden mb-3"
                        >
                          <div className="rounded-2xl border-2 border-primary bg-card">
                            {/* Encabezado */}
                            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-primary/20">
                              {(() => {
                                const style = getCategoryStyle(expandedCat.icon);
                                const Icon = style.icon;
                                return (
                                  <>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.bg} border ${style.border}`}>
                                      <Icon className={`w-4 h-4 ${style.color}`} strokeWidth={1.6} />
                                    </div>
                                    <span className="font-black text-foreground" style={{ fontSize: 17 }}>
                                      {expandedCat.name}
                                    </span>
                                    <span className="ml-auto text-xs text-muted-foreground font-medium">
                                      {expandedCat.subcategories.length} especialidades
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                            {/* Lista de especialidades */}
                            <div className="p-2 space-y-1.5">
                              {expandedCat.subcategories.map((sub: any) => (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => onNavigate(expandedCat.id, sub.id)}
                                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-card hover:bg-primary/10 border border-border/40 hover:border-primary/40 transition-all active:scale-[0.98] text-left"
                                >
                                  <span className="font-semibold text-foreground leading-snug pr-2" style={{ fontSize: 16 }}>
                                    {sub.name}
                                  </span>
                                  <ChevronRight className="w-5 h-5 text-primary shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ));
                  })()}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Panel de perfil completo — sube desde abajo al tocar "Revisar" ── */
function WorkerProfilePanel({
  proposal,
  onClose,
  onChat,
}: {
  proposal: any;
  onClose: () => void;
  onChat: () => void;
}) {
  const baseW = proposal.worker;

  // Cargar perfil completo del trabajador para mostrar bio, skills, rating, etc.
  const { data: fullProfile } = useQuery({
    queryKey: ["workerFullProfile", baseW?.id],
    queryFn: async () => {
      if (!baseW?.id) return null;
      const token = localStorage.getItem("fixgo_token") ?? "";
      const res = await fetch(`/api/users/${baseW.id}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!baseW?.id,
    staleTime: 60_000,
  });

  // Merge: perfil completo tiene prioridad sobre los campos mínimos de la propuesta
  const w = fullProfile ? { ...baseW, ...fullProfile } : baseW;

  const rating = w?.rating ? Number(w.rating).toFixed(1) : null;
  const totalReviews = w?.totalReviews ?? 0;
  const etaMin = proposal.estimatedTime ? parseInt(proposal.estimatedTime) : null;
  const isKycVerified = w?.kycStatus === "approved";
  const skills = Array.isArray(w?.skills) ? w.skills : [];
  const categoryName = w?.category?.name || w?.specialization || null;

  return (
    <>
      {/* Backdrop semitransparente — cubre toda la pantalla */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(0,0,0,0.65)" }}
        onClick={onClose}
      />
      {/* Panel — sube desde abajo a pantalla completa */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="fixed inset-x-0 bottom-0 z-[61] rounded-t-[28px] overflow-y-auto"
        style={{
          background: "hsl(218 15% 10%)",
          boxShadow: "0 -16px 60px rgba(0,0,0,0.8)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderBottom: "none",
          maxHeight: "90dvh",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-[3px] rounded-full bg-white/25" />
        </div>

        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/8 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="px-5 pb-7 pt-1">
          {/* Cabecera: avatar grande + info */}
          <div className="flex items-start gap-4 mb-4">
            <div className="relative shrink-0">
              <Avatar className="w-[72px] h-[72px] border-2 border-primary/25 shadow-xl">
                <AvatarImage src={w?.avatarUrl || w?.profileImageUrl || undefined} />
                <AvatarFallback className="text-2xl font-black bg-primary/20 text-primary">
                  {w?.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              {isKycVerified && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-[hsl(218_15%_10%)] shadow">
                  <BadgeCheck className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pt-1">
              <h3 className="text-[17px] font-black text-white leading-tight truncate">{w?.name || "Especialista"}</h3>

              {categoryName && (
                <p className="text-[13px] text-white/60 mt-0.5 font-medium">{categoryName}</p>
              )}

              {/* Estrellas + reseñas */}
              <div className="flex items-center gap-2 mt-1.5">
                {rating ? (
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(parseFloat(rating)) ? "fill-amber-400 text-amber-400" : "fill-white/10 text-white/10"}`} />
                    ))}
                    <span className="text-[13px] font-bold text-amber-400 ml-1.5">{rating}</span>
                  </div>
                ) : (
                  <span className="text-xs text-white/40">Sin calificación</span>
                )}
                {totalReviews > 0 && (
                  <span className="text-[11px] text-white/50">{totalReviews} {totalReviews === 1 ? "reseña" : "reseñas"}</span>
                )}
              </div>

              {/* Badges inline */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {isKycVerified && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/12 px-2 py-0.5 rounded-full border border-primary/25">
                    <ShieldCheck className="w-3 h-3" />Verificado
                  </span>
                )}
                {etaMin != null && (
                  <span className="text-[10px] font-bold text-white/70 bg-white/8 px-2 py-0.5 rounded-full border border-white/12">
                    ~{etaMin} min
                  </span>
                )}
                <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  ● Disponible
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/6 mb-4" />

          {/* Bio */}
          {w?.bio && (
            <div className="mb-3">
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-1.5">Sobre mí</p>
              <p className="text-[13px] text-white/75 leading-relaxed line-clamp-3">{w.bio}</p>
            </div>
          )}

          {/* Especialidades */}
          {skills.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-1.5">Especialidades</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 5).map((s: string, i: number) => (
                  <span key={i} className="text-[11px] bg-white/6 border border-white/10 text-white/70 px-2.5 py-1 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mensaje de la propuesta */}
          {proposal.message && (
            <div className="mb-4 p-3 rounded-2xl bg-primary/8 border border-primary/20">
              <p className="text-[10px] text-primary/80 font-bold uppercase tracking-widest mb-1">Mensaje del especialista</p>
              <p className="text-[13px] text-white/80 leading-relaxed italic">"{proposal.message}"</p>
            </div>
          )}

          {/* Botón — solo chat, la aceptación se coordina dentro del chat */}
          <div className="pt-1">
            <button
              onClick={onChat}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-[15px] active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)", color: "#fff" }}
            >
              <MessageSquare className="w-4 h-4" />
              Ir al Chat
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ── Tarjeta de propuesta estilo InDrive ── */
function ProposalCard({ proposal, serviceId, onAccepted, onOpenChat, onReview, unreadCount, serviceTitle, index }: {
  proposal: any;
  serviceId: number;
  onAccepted: (proposal: any) => void;
  onOpenChat: (proposal: any) => void;
  onReview: (proposal: any) => void;
  unreadCount?: number;
  serviceTitle?: string;
  index?: number;
}) {
  const acceptMutation = useAcceptProposal();
  const rejectMutation = useRejectProposal();

  const handleAccept = async () => {
    try {
      await acceptMutation.mutateAsync({ id: proposal.id });
      onAccepted(proposal);
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error || e?.data?.error || e?.message;
      toast.error(serverMsg || "Error al aceptar la propuesta");
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({ id: proposal.id });
    } catch {}
  };

  const handleChat = () => {
    onOpenChat(proposal);
  };

  const w = proposal.worker;
  const rating = w?.rating ? Number(w.rating).toFixed(1) : null;
  const totalReviews = w?.totalReviews ?? 0;
  const etaMin = proposal.estimatedTime ? parseInt(proposal.estimatedTime) : null;
  const isKycVerified = w?.kycStatus === "approved";
  const categoryName = w?.category?.name || w?.specialization || null;

  return (
    <>
      <motion.div
        key={proposal.id}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ x: "105%", opacity: 0, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 340, damping: 32, delay: (index ?? 0) * 0.06 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={(_, info) => {
          if (info.offset.x > 80 || info.velocity.x > 450) handleReject();
        }}
        whileDrag={{ scale: 0.98, rotate: 1 }}
        className="relative w-full rounded-[18px] overflow-hidden select-none cursor-grab active:cursor-grabbing"
        style={{
          background: "hsl(0 0% 97%)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.12)",
        }}
      >
        <div className="px-4 pt-4 pb-4">
          {/* Fila superior: badge + ETA */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
              👍 Tu tarifa
            </span>
            {etaMin != null ? (
              <span className="text-[22px] font-black text-gray-900 tabular-nums leading-none">
                {etaMin} <span className="text-[13px] font-bold text-gray-400">min</span>
              </span>
            ) : (
              <span className="text-[12px] font-bold text-gray-400">Disponible ahora</span>
            )}
          </div>

          {/* Título del trabajo */}
          {serviceTitle && (
            <p className="text-[12px] font-semibold text-gray-500 mb-3 truncate" style={{ color: "hsl(220 14% 45%)" }}>
              📋 {serviceTitle}
            </p>
          )}

          {/* Fila del especialista */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative shrink-0">
              <Avatar className="w-[46px] h-[46px] border-[2.5px] border-gray-200">
                <AvatarImage src={w?.avatarUrl || w?.profileImageUrl || undefined} />
                <AvatarFallback className="text-base font-black bg-primary/12 text-primary">
                  {w?.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              {isKycVerified && (
                <div className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-primary rounded-full flex items-center justify-center border-2 border-white">
                  <BadgeCheck className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              {(unreadCount ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-black px-0.5 border-2 border-white">
                  {(unreadCount ?? 0) > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-black text-gray-900 leading-tight truncate">{w?.name || "Especialista"}</p>
                {rating && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="text-[12px] font-bold text-gray-700">{rating}</span>
                  </span>
                )}
                {totalReviews > 0 && (
                  <span className="text-[11px] text-gray-400 shrink-0">{totalReviews} {totalReviews === 1 ? "reseña" : "reseñas"}</span>
                )}
              </div>
              {categoryName && (
                <p className="text-[12px] text-gray-500 mt-0.5 truncate">{categoryName}</p>
              )}
              {isKycVerified && (
                <p className="text-[11px] font-bold text-primary mt-0.5">Identidad verificada</p>
              )}
            </div>
          </div>

          {/* Botones — todos activos en cada tarjeta */}
          <div className="flex gap-2.5">
            <button
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              className="flex-1 flex items-center justify-center py-[13px] rounded-[14px] font-black text-[14px] active:scale-[0.97] transition-all disabled:opacity-50"
              style={{ background: "hsl(220 14% 86%)", color: "hsl(220 14% 35%)" }}
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rechazar"}
            </button>
            <button
              onClick={() => onReview(proposal)}
              className="flex-1 flex items-center justify-center gap-1.5 py-[13px] rounded-[14px] font-black text-[14px] text-white active:scale-[0.97] transition-all shadow-sm"
              style={{ background: "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)" }}
            >
              <Eye className="w-4 h-4" />
              Revisar
            </button>
          </div>
        </div>
      </motion.div>

    </>
  );
}

export default function ClientHome({ visible }: { visible?: boolean } = {}) {
  const { user, isClient } = useAuth();
  const [currentPath, setLocation] = useLocation();
  const search = useSearch();
  const mapType = "roadmap" as const;
  // 29-may-2026: NO pasar user.lat/lng del DB como inicial.
  // Las coords del DB pueden ser incorrectas (grabadas por un bug GPS antiguo).
  // useSmoothPosition usará localStorage (<1h) o fallback Santiago.
  const userLocation = useSmoothPosition();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | null>(null);
  const [serviceSelectionStep, setServiceSelectionStep] = useState<1 | 2 | 3>(1);
  const prefersReducedMotion = useReducedMotion();
  const [proposalsPanelOpen, setProposalsPanelOpen] = useState(false);
  const [categoryBrowserOpen, setCategoryBrowserOpen] = useState(false);
  const [categoryBrowserExpandedId, setCategoryBrowserExpandedId] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>(getGeolocationStatus());
  const [radarSeconds, setRadarSeconds] = useState(0);
  const [radarDismissed, setRadarDismissed] = useState(false);
  const [radarActionLoading, setRadarActionLoading] = useState<"relaunch" | "background" | "cancel" | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [budgetAdjustOpen, setBudgetAdjustOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  // Propuestas recibidas directamente desde el socket (bypass React Query).
  // Se limpian cuando React Query trae sus propios datos o cuando cambia el servicio.
  const [socketProposals, setSocketProposals] = useState<{ serviceId: number; proposals: any[] } | null>(null);
  const [reviewedProposal, setReviewedProposal] = useState<any>(null);

  useEffect(() => onGeolocationStatusChange(setGeoStatus), []);

  useEffect(() => {
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    setServiceSelectionStep(1);
    setCategoryBrowserOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (currentPath !== "/" || !isHomeCategoryBrowserLocation(search)) return;
    setCategoryBrowserExpandedId(getCategoryBrowserCategoryId(search));
    setCategoryBrowserOpen(true);
  }, [currentPath, search]);

  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
      document.body.style.overflow = prev;
    };
  }, []);


  const NEARBY_RADIUS_KM = 50;
  const { data: workersData } = useGetNearbyWorkers(
    { lat: userLocation.lat, lng: userLocation.lng, radius: NEARBY_RADIUS_KM },
    { query: { staleTime: 20_000, refetchInterval: 45_000 } as any }
  );
  const workers = Array.isArray(workersData) ? workersData : (workersData as any)?.users || [];

  // ── Recibir ubicaciones de workers en vivo y patchear la cache ─────────
  // Cada vez que un worker disponible emite su posición, actualizamos el
  // marker en el mapa sin esperar al siguiente refetch del polling.
  const queryClientRT = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onMoved = (data: { workerId: number; lat: number; lng: number }) => {
      queryClientRT.setQueriesData(
        { queryKey: ["/api/workers/nearby"] },
        (old: any) => {
          if (!old) return old;
          const list = Array.isArray(old) ? old : old?.users;
          if (!Array.isArray(list)) return old;
          let changed = false;
          const next = list.map((w: any) => {
            if (w.id !== data.workerId) return w;
            if (w.lat === data.lat && w.lng === data.lng) return w;
            changed = true;
            return { ...w, lat: data.lat, lng: data.lng };
          });
          if (!changed) return old;
          return Array.isArray(old) ? next : { ...old, users: next };
        },
      );
    };
    socket.on("worker:moved", onMoved);
    return () => { socket.off("worker:moved", onMoved); };
  }, [user, queryClientRT]);

  // ── Viewers en tiempo real por servicio ─────────────────────────────────
  const [serviceViewersCount, setServiceViewersCount] = useState<Record<number, number>>({});
  const [serviceViewerIds, setServiceViewerIds] = useState<Record<number, number[]>>({});

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onViewersCount = ({ serviceId, count, viewerIds }: { serviceId: number; count: number; viewerIds: number[] }) => {
      setServiceViewersCount(prev => ({ ...prev, [serviceId]: count }));
      setServiceViewerIds(prev => ({ ...prev, [serviceId]: viewerIds }));
    };
    socket.on("service:viewers_count", onViewersCount);
    return () => { socket.off("service:viewers_count", onViewersCount); };
  }, [user]);

  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useListCategories({ query: { staleTime: 30 * 60_000 } } as any);
  const categoriesList: any[] = Array.isArray(categories) ? categories : [];

  const selectedCategory = categoriesList.find((c: any) => c.id === selectedCategoryId) || null;
  const subcategories: any[] = selectedCategory?.subcategories || [];
  const catStyle = selectedCategory ? getCategoryStyle(selectedCategory.icon) : null;
  const CatIcon = catStyle?.icon ?? null;

  // Los servicios activos se actualizan principalmente via socket (invalidateQueries
  // en layout.tsx y en los efectos de abajo). El refetchInterval es de respaldo
  // para casos donde el socket no emite (reconexión, lag). Intervalo largo = menos
  // peticiones en pantalla, más responsivo al socket.
  const SVCQ = { enabled: !!user, staleTime: 15_000, refetchInterval: 30_000, refetchOnMount: "always" } as any;

  const { data: pendingServicesData } = useListServices(
    { status: "pending" as any, limit: 5 },
    { query: SVCQ }
  );
  const pendingServices: any[] = Array.isArray(pendingServicesData)
    ? pendingServicesData
    : (pendingServicesData as any)?.services || [];
  const { data: alertingServicesData } = useListServices(
    { status: "alerting" as any, limit: 1 },
    { query: SVCQ }
  );
  const alertingServices: any[] = Array.isArray(alertingServicesData)
    ? alertingServicesData
    : (alertingServicesData as any)?.services || [];

  const { data: openServicesData } = useListServices(
    { status: "open" as any, limit: 1 },
    { query: SVCQ }
  );
  const openServices: any[] = Array.isArray(openServicesData)
    ? openServicesData
    : (openServicesData as any)?.services || [];

  // Incluir "alerting" y "open" para que el radar siga activo durante todas las
  // fases del motor. Sin "open" el panel desaparece cuando el servicio sale de
  // alerting hacia la bandeja (bug punto 6 — servicio activo "desaparece").
  const activePendingService =
    pendingServices.length > 0 ? pendingServices[pendingServices.length - 1] :
    alertingServices.length > 0 ? alertingServices[alertingServices.length - 1] :
    openServices.length > 0 ? openServices[openServices.length - 1] :
    null;

  // radarDismissed refleja una acción explícita del USUARIO ("Dejar publicada").
  // NO se deriva del status del servicio porque el servidor también mueve el servicio
  // a "open" automáticamente al terminar la fase activa (Pro Max), lo cual NO debe
  // apagar el radar del cliente si él no hizo nada.
  // El estado se persiste en sessionStorage por serviceId para sobrevivir navegaciones.

  const { data: inProgressServicesData } = useListServices(
    { status: "in_progress" as any, limit: 1 },
    { query: SVCQ }
  );
  const inProgressServices: any[] = Array.isArray(inProgressServicesData)
    ? inProgressServicesData
    : (inProgressServicesData as any)?.services || [];

  const { data: acceptedServicesData } = useListServices(
    { status: "accepted" as any, limit: 1 },
    { query: SVCQ }
  );
  const acceptedServices: any[] = Array.isArray(acceptedServicesData)
    ? acceptedServicesData
    : (acceptedServicesData as any)?.services || [];

  const hasAnyActiveService =
    pendingServices.length > 0 ||
    alertingServices.length > 0 ||
    openServices.length > 0 ||
    inProgressServices.length > 0 ||
    acceptedServices.length > 0;

  // Todos los trabajos activos combinados (para tabs múltiples)
  const allActiveServices: any[] = [
    ...pendingServices,
    ...alertingServices,
    ...openServices,
    ...inProgressServices,
    ...acceptedServices,
  ];

  // Trabajo seleccionado actualmente (para propuestas y tabs).
  // IMPORTANTE: si selectedJobId está seteado (por click del usuario o por evento socket),
  // buscar SOLO ese servicio — no caer al activePendingService que podría ser otro servicio.
  // Así activeServiceId siempre coincide con la key del cache de propuestas.
  const selectedService = selectedJobId
    ? (allActiveServices.find((s: any) => s.id === selectedJobId) ?? null)
    : (activePendingService ?? allActiveServices[0] ?? null);
  // Si el servicio aún no cargó en allActiveServices, usar selectedJobId directamente
  // para que la query de propuestas lea la key correcta del cache.
  const activeServiceId: number | null = selectedService?.id ?? selectedJobId ?? null;
  const isServiceAccepted = selectedService?.status === "accepted" || selectedService?.status === "in_progress";

  const handleReviewWorker = (proposal: any) => {
    const workerId = proposal.workerId || proposal.worker?.id;
    const svcId = proposal.serviceId || activeServiceId;
    if (!workerId) return;
    const params = new URLSearchParams();
    if (svcId) params.set("fromService", String(svcId));
    if (proposal.id) params.set("proposalId", String(proposal.id));
    if (selectedService?.title) params.set("serviceTitle", encodeURIComponent(selectedService.title));
    setLocation(`/workers/${workerId}?${params.toString()}`);
  };

  const handleReviewPanelChat = () => {
    if (!reviewedProposal) return;
    setReviewedProposal(null);
    handleOpenChat(reviewedProposal);
  };
  const assignedWorker = isServiceAccepted ? (selectedService?.worker ?? null) : null;

  const RADAR_DURATION = 120;
  const radarActive = !!activePendingService && !radarDismissed;
  const radarExpired = radarSeconds >= RADAR_DURATION;
  const radarRemaining = Math.max(0, RADAR_DURATION - radarSeconds);
  const radarTimerStr = `${Math.floor(radarRemaining / 60)}:${String(radarRemaining % 60).padStart(2, "0")}`;
  const radarMessage = (() => {
    if (radarSeconds <= 10) return "Confirmando y preparando tu solicitud...";
    if (radarSeconds <= 30) return "Localizando expertos disponibles cerca de ti...";
    if (radarSeconds <= 60) return "Te avisaremos apenas un experto tome tu requerimiento...";
    if (radarSeconds <= 90) return "Gracias por tu paciencia. Seguimos buscando...";
    return "Intentaremos conectarte con un especialista lo antes posible...";
  })();

  const { data: proposalsData, refetch: refetchProposals } = useGetServiceProposals(
    activeServiceId ?? 0,
    { query: { enabled: !!activeServiceId, refetchInterval: 10000 } as any }
  );

  const queryClient = useQueryClient();
  const handleProposalUpdated = useCallback(async (data: { serviceId: number; action: string }) => {
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(data.serviceId) });

    if (data.action === "new") {
      setSelectedJobId(data.serviceId);
      setProposalsPanelOpen(true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      toast("⚡ ¡Un especialista te envió una oferta!", {
        description: "Revísala abajo para chatear con él.",
        duration: 5000,
        action: { label: "Ver", onClick: () => setProposalsPanelOpen(true) },
      });
      // Fetch directo → guarda en estado local (bypass total de React Query cache)
      try {
        const proposals = await getServiceProposals(data.serviceId);
        setSocketProposals({ serviceId: data.serviceId, proposals });
        queryClient.setQueryData(getGetServiceProposalsQueryKey(data.serviceId), proposals);
      } catch {
        queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(data.serviceId) });
      }
    }
  }, [queryClient, setSelectedJobId]);

  useGlobalSocket(user?.id ?? null, {
    onProposalUpdated: handleProposalUpdated,
    onServiceUpdated: (data) => {
      // Solo invalidar cuando el servicio pasa a in_progress (trabajador aceptado)
      // para que el radar desaparezca en tiempo real.
      // NO invalidar en "completed" — ClientHome está siempre montado y si
      // invalida al completar, destruye el PostServiceModal en mis-trabajos.
      if (data.status === "in_progress" || data.status === "accepted") {
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      }
    },
  });
  // socketProposals tiene prioridad si corresponde al servicio activo.
  // Cuando React Query trae datos propios o cambia el servicio, socketProposals se limpia.
  const allProposals: any[] = (() => {
    if (socketProposals && activeServiceId && socketProposals.serviceId === activeServiceId) {
      return socketProposals.proposals;
    }
    if (socketProposals && !activeServiceId && socketProposals.proposals.length > 0) {
      return socketProposals.proposals;
    }
    return Array.isArray(proposalsData) ? proposalsData : [];
  })();
  // open_chat = trabajador solo revisó la alerta, aún no confirma interés con mensaje.
  // Solo mostramos tarjeta cuando el trabajador envió el primer mensaje (status "pending")
  // o avanzó en el flujo (worker_accepted, countered).
  const visibleProposals = allProposals.filter((p: any) =>
    p.status === "pending" || p.status === "worker_accepted" || p.status === "countered"
  );
  const [allProposalsOpen, setAllProposalsOpen] = useState(false);
  const PROPOSALS_PREVIEW_COUNT = 3;
  const previewProposals = visibleProposals.slice(0, PROPOSALS_PREVIEW_COUNT);
  const hiddenProposalsCount = Math.max(0, visibleProposals.length - PROPOSALS_PREVIEW_COUNT);

  useEffect(() => {
    if (visibleProposals.length > 0) setProposalsPanelOpen(true);
  }, [visibleProposals.length]);

  const prevServiceIdRef = useRef<number | null>(null);
  useEffect(() => {
    const newId = activePendingService?.id ?? null;
    // Ignorar cuando el ID pasa brevemente a null durante transiciones de estado
    // (ej. pending→alerting): evita reiniciar el timer en ese gap transitorio.
    if (newId === null) return;
    if (newId !== prevServiceIdRef.current) {
      prevServiceIdRef.current = newId;
      setBudgetAdjustOpen(false);
      setBudgetInput("");
      setSocketProposals(null);
      // Restaurar estado de "dismissed" desde sessionStorage (solo true si el USUARIO lo apagó)
      const dismissed = sessionStorage.getItem(`radar_dismissed_${newId}`) === "1";
      setRadarDismissed(dismissed);
      // Restaurar tiempo transcurrido desde sessionStorage o arrancar desde cero
      const key = `radar_start_${newId}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const elapsed = Math.floor((Date.now() - parseInt(stored, 10)) / 1000);
        setRadarSeconds(Math.max(0, elapsed));
      } else {
        sessionStorage.setItem(key, String(Date.now()));
        setRadarSeconds(0);
      }
    }
  }, [activePendingService?.id]);

  // Limpiar socketProposals cuando React Query ya tiene datos frescos del mismo servicio
  useEffect(() => {
    if (
      socketProposals &&
      activeServiceId === socketProposals.serviceId &&
      Array.isArray(proposalsData) &&
      proposalsData.length > 0
    ) {
      setSocketProposals(null);
    }
  }, [proposalsData, activeServiceId, socketProposals]);

  useEffect(() => {
    if (!radarActive || radarExpired) return;
    const timer = setInterval(() => setRadarSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [radarActive, radarExpired]);

  const [chatProposal, setChatProposal] = useState<any | null>(null);
  const [unreadByWorker, setUnreadByWorker] = useState<Record<number, number>>({});
  const acceptFromChatMutation = useAcceptProposal();

  const chatProposalRef = useRef(chatProposal);
  useEffect(() => { chatProposalRef.current = chatProposal; }, [chatProposal]);

  // Cuando llega un mensaje de un trabajador y el cliente NO está viendo ningún chat
  // (p.ej. no estaba conectado / la app estaba en background), NO abrimos el chat
  // automáticamente: solo marcamos el mensaje como no leído y mostramos el panel de
  // propuestas para que el cliente decida si entra a revisarlo (tocando "Revisar").
  const handleBackgroundMessage = useCallback(async (msg: any) => {
    if (!user || msg.senderId === user.id) return;
    const workerId: number = msg.workerId || msg.senderId;
    if (chatProposalRef.current?.workerId === workerId) return;
    setUnreadByWorker(prev => ({ ...prev, [workerId]: (prev[workerId] || 0) + 1 }));
    if (!chatProposalRef.current) {
      setProposalsPanelOpen(true);
    }
    const msgServiceId: number | null = msg.serviceId ?? null;
    if (msgServiceId) {
      setSelectedJobId(msgServiceId);
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      // Fetch directo → guarda en estado local (bypass total de React Query cache)
      try {
        const proposals = await getServiceProposals(msgServiceId);
        setSocketProposals({ serviceId: msgServiceId, proposals });
        queryClient.setQueryData(getGetServiceProposalsQueryKey(msgServiceId), proposals);
      } catch {
        queryClient.invalidateQueries({ queryKey: getGetServiceProposalsQueryKey(msgServiceId) });
      }
    }
    const senderName = msg?.sender?.name || "Un especialista";
    const toastId = `new-msg-${msg?.id ?? Date.now()}`;
    toast.success(`${senderName} te envió un mensaje`, {
      id: toastId,
      duration: 5000,
      action: { label: "Revisar", onClick: () => setProposalsPanelOpen(true) },
    });
  }, [user, queryClient, setSelectedJobId]);

  useSocket({
    serviceId: activeServiceId ?? null,
    onNewMessage: handleBackgroundMessage,
  });

  const handleOpenChat = useCallback((proposal: any) => {
    setChatProposal(proposal);
    setUnreadByWorker(prev => ({ ...prev, [proposal.workerId]: 0 }));
  }, []);

  const handleProposalAccepted = useCallback((proposal: any) => {
    setProposalsPanelOpen(false);
    setAllProposalsOpen(false);
    setChatProposal(proposal);
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  }, [queryClient]);

  useEffect(() => {
    if (!chatProposal) return;
    const fresh = allProposals.find((p: any) => p.id === chatProposal.id);
    if (fresh && fresh.status !== chatProposal.status) {
      setChatProposal(fresh);
    }
  }, [allProposals, chatProposal]);

  const handleAcceptFromChat = useCallback(async () => {
    if (!chatProposal) return;
    try {
      await acceptFromChatMutation.mutateAsync({ id: chatProposal.id });
      setProposalsPanelOpen(false);
      setAllProposalsOpen(false);
      // Refrescar de inmediato las listas de servicios: sin esto, si el socket
      // no está conectado, el home sigue mostrando el radar/"Buscar de nuevo"
      // hasta 30s después de aceptar.
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error || e?.data?.error || e?.message;
      toast.error(serverMsg || "Error al aceptar la propuesta");
    }
  }, [chatProposal, acceptFromChatMutation, queryClient]);

  const handleSolicitar = () => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set("categoryId", String(selectedCategoryId));
    if (selectedSubcategoryId) params.set("subcategoryId", String(selectedSubcategoryId));
    const qs = params.toString();
    setLocation(`/services/new${qs ? `?${qs}` : ""}`);
  };

  const handleSelectServiceCategory = (category: any) => {
    setSelectedCategoryId(category.id);
    setSelectedSubcategoryId(null);
    setServiceSelectionStep(category.subcategories?.length > 0 ? 2 : 3);
  };

  const handleServiceSelectionBack = () => {
    if (serviceSelectionStep === 3 && subcategories.length > 0) {
      setServiceSelectionStep(2);
      return;
    }
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    setServiceSelectionStep(1);
  };

  const handleCategoryBrowserNavigate = (categoryId: number, subcategoryId?: number) => {
    setCategoryBrowserOpen(false);
    setCategoryBrowserExpandedId(categoryId);
    setLocation(getCategoryBrowserReturnUrl("home", categoryId), { replace: true });
    setLocation(getCategoryBrowserServiceRequestUrl(categoryId, subcategoryId));
  };

  const handleCategoryBrowserExpandedChange = (categoryId: number | null) => {
    setCategoryBrowserExpandedId(categoryId);
    if (categoryId === null) {
      setLocation("/", { replace: true });
      return;
    }
    setLocation(getCategoryBrowserReturnUrl("home", categoryId), { replace: true });
  };

  const handleCategoryBrowserClose = () => {
    setCategoryBrowserOpen(false);
    setCategoryBrowserExpandedId(null);
    if (isHomeCategoryBrowserLocation(search)) setLocation("/", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* MAPA: ocupa todo el espacio disponible, se encoge cuando el panel crece */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0">
          <ClientMap userLat={userLocation.lat} userLng={userLocation.lng} accuracy={userLocation.accuracy} workers={workers} mapType={mapType} ready={userLocation.ready} hasRealFix={userLocation.hasRealFix} visible={visible} showPulse={hasAnyActiveService} />
        </div>

        {/* OVERLAY SUPERIOR — siempre visible */}
        <div className="absolute top-0 left-0 right-0 z-20 p-3 space-y-2">
          <HomeAlerts />
          <GeoPermissionBanner status={geoStatus} />

          {isServiceAccepted &&
            selectedService &&
            assignedWorker &&
            !selectedService.workerCompletedAt &&
            !selectedService.clientCompletedAt && (
            <ActiveServiceQuickCard
              service={selectedService}
              counterpartName={assignedWorker?.name}
              onChat={() => handleOpenChat({
                id: `active-${selectedService.id}`,
                serviceId: selectedService.id,
                workerId: assignedWorker?.id,
                worker: assignedWorker,
                status: "accepted",
              })}
              onGoToJobs={() => setLocation("/mis-trabajos")}
            />
          )}

          {hasAnyActiveService ? (
            <>
              {/* Tabs de trabajos múltiples */}
              {allActiveServices.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                  {allActiveServices.map((svc: any) => (
                    <button
                      key={svc.id}
                      onClick={() => setSelectedJobId(svc.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-[0.97] ${
                        activeServiceId === svc.id
                          ? "bg-primary text-white border-primary shadow-lg"
                           : "bg-card text-foreground border-border/40"
                      }`}
                    >
                      {svc.title ? svc.title.substring(0, 22) : `Solicitud #${svc.id}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Pill de estado de búsqueda */}
              {!isServiceAccepted && <div className={`bg-card rounded-2xl px-3 py-2.5 shadow-lg flex items-center gap-2 border border-primary/20`}>
                <div className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${isServiceAccepted ? "bg-green-500" : radarDismissed ? "bg-green-500" : "bg-primary"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-foreground leading-none">
                    {isServiceAccepted
                      ? (assignedWorker?.name ? `Con ${assignedWorker.name}` : "Especialista asignado")
                      : radarDismissed ? "Solicitud abierta"
                      : radarExpired ? "Sin respuesta aún"
                      : "Buscando especialistas"}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {isServiceAccepted
                      ? selectedService?.title ?? "Servicio activo"
                      : selectedService?.title ?? ""}
                  </p>
                </div>
                {!isServiceAccepted && radarActive && !radarExpired && (
                  <span className="text-xs font-mono text-primary font-bold shrink-0">{radarTimerStr}</span>
                )}
                {!isServiceAccepted && radarDismissed && (
                  <span className="text-[10px] text-green-500 font-bold shrink-0">En espera</span>
                )}
                {isServiceAccepted && (
                  <span className="text-[10px] text-green-400 font-bold shrink-0">✓ Conectado</span>
                )}
              </div>}
            </>
          ) : (
            workers.length > 0 && (
              <div className="flex items-center">
                 <div className="ml-auto bg-card rounded-xl px-3 py-2 shadow-lg border border-border/30">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-foreground">{workers.filter((w: any) => w.isAvailable).length}</span>
                    <span className="text-[10px] text-muted-foreground">cerca</span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* OVERLAY DE PROPUESTAS — anclado al fondo, lista vertical estilo InDrive */}
        {/* Muestra el panel tan pronto llega el evento socket (proposalsPanelOpen) aunque
            los datos aún no hayan cargado; o cuando ya hay propuestas visibles */}
        {hasAnyActiveService && !isServiceAccepted && (proposalsPanelOpen || visibleProposals.length > 0) && (
          <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
            {/* Gradiente oscuro detrás del área de propuestas para legibilidad */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)",
                pointerEvents: "none",
              }}
            />

            <div className="relative flex flex-col gap-0 px-3 pb-2 pt-8">
              {visibleProposals.length > 0 ? (
                <>
                  {/* Título — sobre el gradiente */}
                  <div className="flex items-center justify-between mb-2 pointer-events-auto">
                    <p className="text-[15px] font-black text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
                      Elige a un especialista
                    </p>
                    {hiddenProposalsCount > 0 && (
                      <button
                        onClick={() => setAllProposalsOpen(true)}
                        className="text-[11px] font-bold text-white/80 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm"
                      >
                        +{hiddenProposalsCount} más
                      </button>
                    )}
                  </div>

                  {/* Tarjetas — lista vertical simple */}
                  <div className="flex flex-col gap-2.5 pointer-events-auto">
                    <AnimatePresence mode="popLayout">
                      {previewProposals.map((proposal: any, idx: number) => (
                        <ProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          serviceId={activeServiceId!}
                          serviceTitle={selectedService?.title}
                          onAccepted={handleProposalAccepted}
                          onOpenChat={handleOpenChat}
                          onReview={handleReviewWorker}
                          unreadCount={unreadByWorker[proposal.workerId] || 0}
                          index={idx}
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Contador de vistas */}
                  <div className="flex items-center justify-center gap-2 pt-2 pb-0.5 pointer-events-none">
                    <div className="flex -space-x-2">
                      {visibleProposals.slice(0, 3).map((p: any) => (
                        <Avatar key={p.id} className="w-5 h-5 border-2 border-white/40">
                          <AvatarImage src={p.worker?.avatarUrl || p.worker?.profileImageUrl || undefined} />
                          <AvatarFallback className="text-[8px] font-bold bg-primary/20 text-primary">
                            {p.worker?.name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <p className="text-[11px] font-semibold text-white/90" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                      {visibleProposals.length} {visibleProposals.length === 1 ? "especialista está viendo" : "especialistas están viendo"} tu solicitud
                    </p>
                  </div>
                </>
              ) : (
                /* Estado de carga: llegó el evento socket pero los datos aún no se han refetcheado */
                <div className="flex items-center gap-3 pb-4 pt-2 pointer-events-auto">
                  <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                  <p className="text-[13px] font-semibold text-white/90" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                    ¡Un especialista está revisando tu solicitud!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PANEL INFERIOR: solo visible cuando no hay servicios activos */}
      {!hasAnyActiveService && (
      <div className="shrink-0 bg-card border-t border-border/50 rounded-t-3xl shadow-2xl px-4 pt-2 pb-4">
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        <p className="text-lg font-black text-foreground tracking-tight mb-3">
          ¿Qué servicio necesitas?
        </p>

        {/* ── FILA CATEGORÍA ── */}
        <button
          type="button"
          onClick={() => {
            if (selectedCategoryId) {
              setSelectedCategoryId(null);
              setSelectedSubcategoryId(null);
              setCategoryListOpen(false);
              setSubcategoryListOpen(false);
            } else {
              setCategoryListOpen(v => !v);
            }
          }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] mb-1 ${
            categoryListOpen
              ? "border-primary bg-primary/10"
              : "border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5"
          }`}
        >
          {selectedCategory && catStyle && CatIcon ? (
            <>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${catStyle.bg} border-2 ${catStyle.border}`}>
                <CatIcon className={`w-6 h-6 ${catStyle.color}`} strokeWidth={1.5} />
              </div>
              <span className="flex-1 text-left font-semibold text-foreground text-sm leading-tight">{selectedCategory.name}</span>
              <X className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          ) : (
            <>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-muted/30 border border-border/40">
                <LayoutGrid className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="flex-1 text-left text-muted-foreground text-sm">Selecciona una categoría...</span>
              <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${categoryListOpen ? "rotate-180" : ""}`} />
            </>
          )}
        </button>

        {/* Lista inline de categorías */}
        <AnimatePresence initial={false}>
          {categoryListOpen && !selectedCategoryId && (
            <motion.div
              key="cat-list"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden mb-1"
            >
              <div className="max-h-52 overflow-y-auto rounded-2xl border border-border/40 bg-card divide-y divide-border/20">
                {categoriesList.map((cat: any) => {
                  const style = getCategoryStyle(cat.icon);
                  const Icon = style.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setSelectedSubcategoryId(null);
                        setCategoryListOpen(false);
                        setSubcategoryListOpen(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/8 active:bg-primary/15 transition-colors text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.bg} border ${style.border}`}>
                        <Icon className={`w-5 h-5 ${style.color}`} strokeWidth={1.5} />
                      </div>
                      <span className="flex-1 font-semibold text-foreground text-sm">{cat.name}</span>
                      {Array.isArray(cat.subcategories) && cat.subcategories.length > 0 && (
                        <span className="text-[11px] text-muted-foreground mr-1">{cat.subcategories.length}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FILA ESPECIALIDAD ── aparece tras seleccionar categoría */}
        <AnimatePresence initial={false}>
          {selectedCategory && subcategories.length > 0 && (
            <motion.div
              key="sub-row"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  if (selectedSubcategoryId) {
                    setSelectedSubcategoryId(null);
                    setSubcategoryListOpen(false);
                  } else {
                    setSubcategoryListOpen(v => !v);
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] mb-1 ${
                  subcategoryListOpen
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {selectedSubcategoryId && catStyle && CatIcon ? (
                  <>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${catStyle.bg} border-2 ${catStyle.border}`}>
                      <CatIcon className={`w-6 h-6 ${catStyle.color}`} strokeWidth={1.5} />
                    </div>
                    <span className="flex-1 text-left font-semibold text-foreground text-sm leading-tight">
                      {subcategories.find((s: any) => s.id === selectedSubcategoryId)?.name}
                    </span>
                    <X className="w-4 h-4 text-muted-foreground shrink-0" />
                  </>
                ) : (
                  <>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${catStyle?.bg ?? "bg-muted/30"} border ${catStyle?.border ?? "border-border/40"}`}>
                      <ChevronRight className={`w-5 h-5 ${catStyle?.color ?? "text-muted-foreground"}`} />
                    </div>
                    <span className="flex-1 text-left text-muted-foreground text-sm">Selecciona una especialidad...</span>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${subcategoryListOpen ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>

              {/* Lista inline de especialidades */}
              <AnimatePresence initial={false}>
                {subcategoryListOpen && !selectedSubcategoryId && (
                  <motion.div
                    key="sub-list"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden mb-1"
                  >
                    <div className="max-h-48 overflow-y-auto rounded-2xl border border-primary/30 bg-card divide-y divide-border/20">
                      {subcategories.map((sub: any) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setSelectedSubcategoryId(sub.id);
                            setSubcategoryListOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/10 active:bg-primary/20 transition-colors text-left"
                        >
                          {catStyle && CatIcon && (
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${catStyle.bg} border ${catStyle.border}`}>
                              <CatIcon className={`w-5 h-5 ${catStyle.color}`} strokeWidth={1.5} />
                            </div>
                          )}
                          <span className="flex-1 font-semibold text-foreground text-sm">{sub.name}</span>
                          <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botón solicitar */}
        <AnimatePresence>
          {selectedCategoryId && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
            >
              <Button
                onClick={handleSolicitar}
                className="w-full fixgo-gradient font-bold text-white rounded-2xl h-12 text-sm shadow-lg active:scale-[0.98] transition-all"
              >
                {selectedSubcategoryId
                  ? `Solicitar: ${subcategories.find((s: any) => s.id === selectedSubcategoryId)?.name}`
                  : `Solicitar en ${selectedCategory?.name}`
                }
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* PANEL ACTIVO: visible cuando hay servicios activos */}
      {hasAnyActiveService && (
        <div className="shrink-0 bg-card border-t border-border/50 rounded-t-3xl shadow-2xl px-4 pt-2 pb-4">
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Contador de especialistas viendo esta solicitud en tiempo real */}
          {activeServiceId && (serviceViewersCount[activeServiceId] ?? 0) > 0 && (() => {
            const count = serviceViewersCount[activeServiceId] ?? 0;
            const viewerIds = serviceViewerIds[activeServiceId] ?? [];
            const avatarWorkers = viewerIds
              .map(id => workers.find((w: any) => w.id === id))
              .filter(Boolean)
              .slice(0, 4);
            return (
              <div className="flex items-center gap-2 mb-3">
                {avatarWorkers.length > 0 ? (
                  <div className="flex -space-x-2">
                    {avatarWorkers.map((w: any) => (
                      <Avatar key={w.id} className="w-7 h-7 border-2 border-card">
                        <AvatarImage src={w.avatarUrl || undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
                          {w.name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                ) : (
                  <div className="flex -space-x-2">
                    {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                      <div key={i} className="w-7 h-7 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center">
                        <Users className="w-3 h-3 text-primary" />
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{count}</span>
                  {count === 1 ? " especialista está viendo tu solicitud ahora" : " especialistas están viendo tu solicitud ahora"}
                </p>
              </div>
            );
          })()}

          {/* Timer + botones — estilo InDriver */}
          {visibleProposals.length === 0 && !isServiceAccepted && (radarActive || (radarExpired && !radarDismissed)) && (
            <div className="mb-3">
              {!radarExpired ? (
                <div className="space-y-3">
                  {/* Fila: mensaje izq + temporizador der */}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-foreground font-medium flex-1 leading-snug">
                      {radarMessage}
                    </p>
                    <span className="text-3xl font-black text-foreground tabular-nums shrink-0 tracking-tight">
                      {radarTimerStr}
                    </span>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${(radarSeconds / RADAR_DURATION) * 100}%` }}
                    />
                  </div>

                  {/* Botones */}
                  <div className="flex gap-2 pt-0.5">
                    <button
                      disabled={!!radarActionLoading}
                      onClick={async () => {
                        if (!activeServiceId || radarActionLoading) return;
                        setRadarActionLoading("relaunch");
                        try {
                          const token = localStorage.getItem("fixgo_token");
                          await fetch(`/api/services/${activeServiceId}/relaunch`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          // Resetear timer y limpiar el flag de dismissed
                          sessionStorage.setItem(`radar_start_${activeServiceId}`, String(Date.now()));
                          sessionStorage.removeItem(`radar_dismissed_${activeServiceId}`);
                          setRadarSeconds(0);
                          setRadarDismissed(false);
                          queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                        } catch { /* silencioso */ } finally {
                          setRadarActionLoading(null);
                        }
                      }}
                      className="flex-1 py-3 bg-muted rounded-2xl text-foreground font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {radarActionLoading === "relaunch"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Buscar de nuevo
                    </button>
                    <button
                      disabled={!!radarActionLoading}
                      onClick={async () => {
                        if (!activeServiceId || radarActionLoading) return;
                        setRadarActionLoading("background");
                        try {
                          const token = localStorage.getItem("fixgo_token");
                          await fetch(`/api/services/${activeServiceId}/background`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          // Marcar el dismiss explícito del USUARIO en sessionStorage.
                          // Solo esto debe apagar el radar, NO el status del servicio.
                          sessionStorage.setItem(`radar_dismissed_${activeServiceId}`, "1");
                          setRadarDismissed(true);
                          queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                        } catch { /* silencioso */ } finally {
                          setRadarActionLoading(null);
                        }
                      }}
                      className="flex-1 py-3 bg-muted/60 rounded-2xl text-muted-foreground font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {radarActionLoading === "background"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : null}
                      Dejar mi aviso publicado
                    </button>
                  </div>

                  {/* Cancelar solicitud — radar activo */}
                  {!cancelConfirm ? (
                    <button
                      disabled={!!radarActionLoading}
                      onClick={() => setCancelConfirm(true)}
                      className="w-full py-2 text-xs text-destructive/70 hover:text-destructive font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar solicitud
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCancelConfirm(false)}
                        disabled={radarActionLoading === "cancel"}
                        className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-xs font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                      >
                        Volver
                      </button>
                      <button
                        disabled={radarActionLoading === "cancel"}
                        onClick={async () => {
                          if (!activeServiceId) return;
                          setRadarActionLoading("cancel");
                          try {
                            const token = localStorage.getItem("fixgo_token");
                            await fetch(`/api/services/${activeServiceId}/cancel`, {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            setCancelConfirm(false);
                            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                          } catch { } finally { setRadarActionLoading(null); }
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {radarActionLoading === "cancel"
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <XCircle className="w-3.5 h-3.5" />}
                        Sí, cancelar
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Expirado — estilo InDriver */}
                  <p className="text-xs text-muted-foreground text-center">
                    A la espera de especialistas...
                  </p>
                  <p className="text-base font-bold text-foreground text-center">
                    ¿Aún necesitas este servicio?
                  </p>
                  <div className="space-y-2 pt-1">
                    <button
                      disabled={!!radarActionLoading}
                      onClick={async () => {
                        if (!activeServiceId || radarActionLoading) return;
                        setRadarActionLoading("relaunch");
                        try {
                          const token = localStorage.getItem("fixgo_token");
                          await fetch(`/api/services/${activeServiceId}/relaunch`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          if (activeServiceId) sessionStorage.setItem(`radar_start_${activeServiceId}`, String(Date.now()));
                          setRadarSeconds(0);
                          queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                        } catch { /* silencioso */ } finally {
                          setRadarActionLoading(null);
                        }
                      }}
                      className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {radarActionLoading === "relaunch"
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                      Buscar de nuevo
                    </button>
                    <button
                      disabled={!!radarActionLoading}
                      onClick={async () => {
                        if (!activeServiceId || radarActionLoading) return;
                        setRadarActionLoading("background");
                        try {
                          const token = localStorage.getItem("fixgo_token");
                          await fetch(`/api/services/${activeServiceId}/background`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          // Igual que en el estado activo: marcar el dismiss
                          // explícito del usuario para que el panel se cierre.
                          // Sin esto el botón no producía ningún cambio visible.
                          sessionStorage.setItem(`radar_dismissed_${activeServiceId}`, "1");
                          setRadarDismissed(true);
                          queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                        } catch { /* silencioso */ } finally {
                          setRadarActionLoading(null);
                        }
                      }}
                      className="w-full py-3.5 bg-muted rounded-2xl text-foreground font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {radarActionLoading === "background"
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : null}
                      Dejar mi aviso publicado
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center px-2">
                      Tu solicitud seguirá activa. Te avisaremos en cuanto un experto la acepte.
                    </p>

                    {/* Cancelar solicitud — estado expirado */}
                    {!cancelConfirm ? (
                      <button
                        disabled={!!radarActionLoading}
                        onClick={() => setCancelConfirm(true)}
                        className="w-full py-2 text-xs text-destructive/70 hover:text-destructive font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancelar solicitud
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCancelConfirm(false)}
                          disabled={radarActionLoading === "cancel"}
                          className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-xs font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                        >
                          Volver
                        </button>
                        <button
                          disabled={radarActionLoading === "cancel"}
                          onClick={async () => {
                            if (!activeServiceId) return;
                            setRadarActionLoading("cancel");
                            try {
                              const token = localStorage.getItem("fixgo_token");
                              await fetch(`/api/services/${activeServiceId}/cancel`, {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              setCancelConfirm(false);
                              queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                            } catch { } finally { setRadarActionLoading(null); }
                          }}
                          className="flex-1 py-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {radarActionLoading === "cancel"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <XCircle className="w-3.5 h-3.5" />}
                          Sí, cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ajustar presupuesto (cuando expiró y no está en modo seguir buscando ni ya aceptado) */}
          {radarExpired && !radarDismissed && !isServiceAccepted && (
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden mt-2">
              <button
                onClick={() => setBudgetAdjustOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
              >
                <span className="text-xs">Ajustar presupuesto sugerido</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${budgetAdjustOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {budgetAdjustOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Ajusta tu presupuesto para atraer más expertos
                      </p>
                      <div className="flex gap-2">
                        {[3000, 5000, 10000].map(delta => (
                          <button
                            key={delta}
                            onClick={() => {
                              const cur = parseInt(budgetInput.replace(/\D/g, "")) || 0;
                              setBudgetInput(String(cur + delta));
                            }}
                            className="flex-1 py-1.5 rounded-lg border border-primary/40 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 active:scale-[0.97] transition-all"
                          >
                            +${new Intl.NumberFormat("es-CL").format(delta)}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={budgetInput}
                          onChange={e => setBudgetInput(e.target.value)}
                          placeholder="Monto en pesos"
                          className="flex-1 px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
                        />
                        <button
                          disabled={!budgetInput}
                          onClick={async () => {
                            if (!activeServiceId || !budgetInput) return;
                            const formatted = `$${new Intl.NumberFormat("es-CL").format(parseInt(budgetInput) || 0)}`;
                            const token = localStorage.getItem("fixgo_token");
                            try {
                              await fetch(`/api/services/${activeServiceId}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ budgetNote: formatted }),
                              });
                              queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
                              if (activeServiceId) sessionStorage.setItem(`radar_start_${activeServiceId}`, String(Date.now()));
                              setRadarSeconds(0);
                              setBudgetAdjustOpen(false);
                            } catch {
                              toast.error("No se pudo actualizar el presupuesto");
                            }
                          }}
                          className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.97] transition-all whitespace-nowrap"
                        >
                          Relanzar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Modal con TODAS las propuestas */}
      <Dialog open={allProposalsOpen} onOpenChange={setAllProposalsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-base font-black uppercase tracking-wide">
              Todas las propuestas
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {visibleProposals.length} {visibleProposals.length === 1 ? "especialista disponible" : "especialistas disponibles"}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {visibleProposals.map((proposal: any) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                serviceId={activeServiceId!}
                serviceTitle={activePendingService?.title}
                onAccepted={(p) => {
                  setAllProposalsOpen(false);
                  handleProposalAccepted(p);
                }}
                onOpenChat={(p) => {
                  setAllProposalsOpen(false);
                  handleOpenChat(p);
                }}
                onReview={(p) => {
                  setAllProposalsOpen(false);
                  handleReviewWorker(p);
                }}
                unreadCount={unreadByWorker[proposal.workerId] || 0}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat de propuesta lifteado — persiste al elegir para seguir coordinando */}
      {chatProposal && (() => {
        // Datos del servicio del chat: tras aceptar, activePendingService pasa a
        // null, así que se busca también en las listas activas para no perder la
        // dirección (botón "Enviar Ubicación") ni el estado pendiente.
        const chatSvc: any = allActiveServices.find((s: any) => s.id === chatProposal.serviceId) ?? activePendingService;
        return (
          <ProposalChatSheet
            open={!!chatProposal}
            onOpenChange={(v) => { if (!v) setChatProposal(null); }}
            serviceId={chatProposal.serviceId}
            workerId={chatProposal.workerId}
            workerName={chatProposal.worker?.name || "Especialista"}
            workerAvatar={chatProposal.worker?.profileImageUrl}
            onAccept={chatProposal.status === "pending" ? handleAcceptFromChat : undefined}
            accepting={acceptFromChatMutation.isPending}
            otherUserId={chatProposal.workerId}
            budgetNote={chatSvc?.budgetNote || null}
            requestQuote={!!chatSvc?.requestQuote}
            iAmClient={true}
            // Obligatorio en fase pendiente: el servidor exige workerId en el
            // body del mensaje del cliente (400 si falta). Si el servicio ya
            // está asignado, el servidor ignora el workerId extra sin problema.
            isPending={!chatSvc || ["pending", "alerting", "open"].includes(String(chatSvc.status))}
            serviceStatus={chatSvc?.status ?? null}
            paymentMethod={chatSvc?.paymentMethod ?? null}
            freeCancelUntil={chatSvc?.freeCancelUntil ?? null}
            clientAddress={chatSvc?.address || null}
            clientLat={typeof chatSvc?.lat === "number" ? chatSvc.lat : null}
            clientLng={typeof chatSvc?.lng === "number" ? chatSvc.lng : null}
          />
        );
      })()}

      {/* Panel de perfil completo del trabajador — aparece al tocar "Revisar" */}
      <AnimatePresence>
        {reviewedProposal && (
          <WorkerProfilePanel
            proposal={reviewedProposal}
            onClose={() => setReviewedProposal(null)}
            onChat={handleReviewPanelChat}
          />
        )}
      </AnimatePresence>

      {/* Modal full-screen de navegación por categorías (Path B) */}
      <CategoryBrowserSheet
        open={categoryBrowserOpen}
        onClose={handleCategoryBrowserClose}
        categories={categoriesList}
        categoriesLoading={categoriesLoading}
        categoriesError={categoriesError}
        categoriesFetching={categoriesFetching}
        onRetry={() => { void refetchCategories(); }}
        onNavigate={handleCategoryBrowserNavigate}
        expandedId={categoryBrowserExpandedId}
        onExpandedChange={handleCategoryBrowserExpandedChange}
      />


    </div>
  );
}
