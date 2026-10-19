import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef, useState, type ReactNode, Component, type ErrorInfo } from "react";
import { GoogleMap, Marker, Circle, OverlayView } from "@react-google-maps/api";

// Suprimir el aviso de deprecación de google.maps.Marker.
// AdvancedMarkerElement requiere mapId, pero mapId deshabilita el array `styles`
// que usamos para el tema oscuro. Google ha confirmado que Marker no se eliminará
// en menos de 12 meses. Se remueve del log hasta migrar el tema de mapa a Cloud Console.
if (typeof window !== "undefined") {
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("google.maps.Marker is deprecated")) return;
    _warn(...args);
  };
}
import { Capacitor } from "@capacitor/core";
import { GoogleMap as CapMap } from "@capacitor/google-maps";
import { useGoogleMapsLoaded, useGoogleMapsError } from "./google-maps-provider";

declare const __GOOGLE_MAPS_KEY__: string;
declare const __GOOGLE_MAPS_KEY_MOBILE__: string;
declare const __GOOGLE_MAPS_MAP_ID__: string;

// Dos keys separadas para Google Maps:
//   - WEB / PWA: GOOGLE_MAPS_API_KEY (Maps JavaScript API, restringida por
//     HTTP referrer). Inyectada como __GOOGLE_MAPS_KEY__.
//   - MOBILE (Android/iOS): GOOGLE_MAPS_API_KEY_MOBILE (Maps SDK for Android
//     / iOS, restringida por package + SHA-1). Inyectada como
//     __GOOGLE_MAPS_KEY_MOBILE__ para JS, y al AndroidManifest.xml via
//     manifestPlaceholders en android/app/build.gradle.
// Esto permite tener proyectos GCP separados, restricciones distintas y
// rotar keys de forma independiente.
let warnedEmptyWeb = false;
let warnedEmptyMobile = false;

function getApiKey(): string {
  // Si estamos corriendo en el WebView de Capacitor (Android/iOS) usamos
  // la key de mobile, sino la web.
  const isNative = Capacitor.isNativePlatform();
  let key = "";
  try {
    if (isNative) {
      if (typeof __GOOGLE_MAPS_KEY_MOBILE__ !== "undefined" && __GOOGLE_MAPS_KEY_MOBILE__) {
        key = __GOOGLE_MAPS_KEY_MOBILE__;
      }
    } else {
      if (typeof __GOOGLE_MAPS_KEY__ !== "undefined" && __GOOGLE_MAPS_KEY__) {
        key = __GOOGLE_MAPS_KEY__;
      }
    }
  } catch {
    // ignore
  }
  if (!key) {
    if (isNative && !warnedEmptyMobile) {
      warnedEmptyMobile = true;
      console.warn(
        "[native-map] GOOGLE_MAPS_API_KEY_MOBILE no esta configurada. " +
        "El mapa nativo NO va a renderizar tiles. " +
        "Define la env var en el proyecto y rebuildea el APK (./gradlew assembleDebug)."
      );
    } else if (!isNative && !warnedEmptyWeb) {
      warnedEmptyWeb = true;
      console.warn(
        "[native-map] GOOGLE_MAPS_API_KEY no esta configurada. " +
        "El mapa web NO va a renderizar tiles. " +
        "Define la env var y rebuildea (pnpm build)."
      );
    }
  }
  return key;
}

// Map ID estilizado opcional. Si esta seteado se usa en lugar del look default.
// Crear en Google Cloud Console -> Maps Platform -> Map Styles.
//
// IMPORTANTE: En Google Cloud Console hay DOS cosas distintas:
//   1) Map STYLES (estilo visual: dark, light, etc)  -> ID estilo
//   2) Map IDS (identificadores de mapa que se asocian a un estilo)
// El SDK nativo Android/iOS solo acepta MAP IDs. Si pasas un Style ID
// (de la pantalla "Map Styles"), el SDK no carga tiles (queda blanco).
// Para tener mapa estilizado en nativo: crear un Map ID en
// "Map Management", asociarlo a un estilo, y usar ese Map ID aqui.
//
// Mientras no exista un Map ID valido, dejamos `mapId` desactivado
// para que los tiles se rendericen con el estilo default de Google.
//
// 27-abr-2026: confirmado que el Map ID viejo `779eb6873b48b48d3d103a8d`
// estaba creado para JavaScript y por eso Android recibia tiles vacios.
// Reemplazado por `779eb6873b48b48d3de54d56`, que deberia tener la
// plataforma Android habilitada en Cloud Console.
//
// Si el mapa sale beige/blanco aun con ENABLE_MAP_ID activo: el Map ID
// existe pero su estilo asociado para Android esta vacio (todas las
// features ocultas) o directamente no tiene un Map Style asociado para
// la plataforma Android. Se arregla en Cloud Console -> Map Management
// -> abrir el Map ID -> "Associated Map Styles" -> agregar un estilo
// para Android con features visibles.
//
// Para diagnosticar en runtime sin recompilar: tocar el badge de debug
// (esquina sup. izq. del mapa) alterna entre usar/no usar Map ID y
// recarga la app. Sin Map ID se ve el estilo default de Google.
// 28-abr-2026: REACTIVADO. El usuario confirmo en Cloud Console que el
// Map ID 779eb6873b48b48d3de54d56 ("Fixgo Android") tiene asociado el
// estilo "Fixgo Android" (id 9de3fbb3bb73b14298fdde81, modo oscuro)
// tanto en Modo claro como en Modo oscuro. Tambien tiene la plataforma
// Android habilitada. El plugin @capacitor/google-maps v8.0.1 lo recibe
// via la clave `androidMapId` (NO `mapId` legacy en nativo) — ver linea
// ~635 donde se construye nativeConfig.
//
// 29-abr-2026 11:57 AM: CONFIRMADO funcionando con APK del usuario.
// Los logs (Pasted-2026-04-29-11-54...txt + ...11-57...txt) muestran:
//   - config enviado al plugin: mapId/androidMapId/iOSMapId activos
//   - androidMapColorScheme: "DARK"
//   - onMapReady ✅ disparado
//   - onCameraIdle ✅ multiples veces (no quedo en 0)
//   - 175 tiles vector "maps/vt/proto" descargados de Google entre
//     11:57:39 y 11:57:55 → el SDK Android SI esta cargando tiles
//     vector con ese Map ID. El Map ID FUNCIONA en plataforma Android.
//
// 29-abr-2026 15:50 PM: el mapa quedo negro DESPUES de que el agente
// modificara MainActivity.java (quitar MODE_NIGHT_YES) y styles.xml
// (cambiar DayNight->Light, windowBackground=@null -> transparent).
// Esos cambios ROMPIERON el rendering del MapView nativo. La fix es
// REVERTIR esos archivos al estado del commit d36d6b3 (ya hecho hoy
// 29-abr ~16:00). NO desactivar ENABLE_MAP_ID — el Map ID funciona.
const ENABLE_MAP_ID = true;
const MAP_ID_OVERRIDE_KEY = "fixgo_disable_mapid";
const LITE_MODE_KEY = "fixgo_lite_mode";
function isMapIdDisabledByUser(): boolean {
  // 28-abr-2026: SIEMPRE devolvemos false. El flag quedaba "pegado" en
  // localStorage de sesiones anteriores (cuando el usuario tocaba el badge
  // DBG con el mapa beige) y eso causaba que en el PRIMER create del mapa
  // se omitiera el mapId -> mapa rojo/negro en la primera carga, despues
  // se limpiaba y el segundo create si lo incluia (mapa OK).
  // Ademas borramos el flag por si esta seteado de antes.
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(MAP_ID_OVERRIDE_KEY);
    }
  } catch {}
  return false;
}
// Modo "lite" del SDK Android: el MapView se renderiza como una imagen
// estatica (sin gestos, sin GL surface). Es el "modo simple" oficial de
// Google Maps Android. Sirve como TEST: si en lite mode SI se ven calles
// pero en modo full se ve beige -> el bug es 100% del rendering del
// plugin Capacitor Maps v8.0.1 con tu device. Si en lite mode TAMBIEN
// se ve beige -> es la API key (sin permisos para Maps SDK Android).
function isLiteModeEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(LITE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}
function getMapId(): string | undefined {
  if (!ENABLE_MAP_ID) return undefined;
  if (isMapIdDisabledByUser()) return undefined;
  try {
    if (typeof __GOOGLE_MAPS_MAP_ID__ !== "undefined" && __GOOGLE_MAPS_MAP_ID__) {
      return __GOOGLE_MAPS_MAP_ID__;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export interface NativeMarkerSpec {
  id: string;
  lat: number;
  lng: number;
  iconUrl?: string;
  iconSize?: { width: number; height: number };
  iconAnchor?: { x: number; y: number };
  title?: string;
  snippet?: string;
  zIndex?: number;
}

export interface NativeCircleSpec {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  zIndex?: number;
}

export interface NativeMapHandle {
  panTo: (coord: { lat: number; lng: number }, zoom?: number) => Promise<void>;
  setZoom: (zoom: number) => Promise<void>;
}

export interface NativeMapProps {
  center: { lat: number; lng: number };
  zoom: number;
  markers?: NativeMarkerSpec[];
  circles?: NativeCircleSpec[];
  styles?: any[];
  mapTypeId?: "Normal" | "Satellite" | "Hybrid" | "Terrain";
  onMarkerClick?: (markerId: string) => void;
  onMapClick?: (coord: { lat: number; lng: number }) => void;
  onCameraIdle?: (state: { lat: number; lng: number; zoom: number }) => void;
  children?: ReactNode;
  className?: string;
  /** Solo nativo: cuando false oculta el MapView nativo sin destruirlo,
   *  preservando tiles en cache. Cuando vuelve a true lo restaura. */
  visible?: boolean;
  /** Solo nativo: modo "calentamiento" del mapa. Crea el MapView nativo a
   *  pantalla completa detrás del WebView opaco para que el SDK descargue
   *  tiles al cache antes de que el usuario navegue al mapa real.
   *  - NO transparenta html/body (sino se veria el mapa fantasma).
   *  - NO muestra placeholder, debug badge ni botones.
   *  - Ignora el prop `visible`. */
  prewarm?: boolean;

  /** Cuando es true, el placeholder con apariencia de mapa se MANTIENE
   *  visible aunque el MapView nativo ya este listo (cameraIdle >= 1).
   *  Util para que la pantalla NO muestre el mapa real centrado en el
   *  fallback (Santiago/Plaza de Armas) mientras el GPS todavia no
   *  responde. Cuando llega la posicion real (pendingPosition baja a
   *  false), el placeholder hace fade-out y se ve el mapa ya centrado
   *  en la ciudad correcta. Evita el "mapa salta de Santiago a mi
   *  ciudad" en la primera apertura post-instalacion. */
  pendingPosition?: boolean;

  /** Coordenadas donde se dibujan los anillos de pulso (ondas).
   *  En web se implementa con OverlayView de Google Maps, por lo que
   *  las ondas siguen al punto GPS aunque el usuario mueva el mapa.
   *  En nativo las ondas se omiten (el SDK nativo no expone OverlayView). */
  pulsePosition?: { lat: number; lng: number };
}

function detectNative(): boolean {
  try {
    const platform = Capacitor.getPlatform();
    const native = platform === "android" || platform === "ios";
    // Log visible en logs Android (filtrar por "Capacitor/Console")
    // y tambien sirve para overlay debug abajo.
    if (typeof console !== "undefined") {
      console.log("[NativeMap] platform=", platform, "isNative=", native, "Capacitor.isNativePlatform=", Capacitor.isNativePlatform?.());
    }
    return native;
  } catch (err) {
    console.warn("[NativeMap] detectNative fallo:", err);
    return false;
  }
}
const IS_NATIVE = detectNative();
const PLATFORM = (() => { try { return Capacitor.getPlatform(); } catch { return "unknown"; } })();

const MAP_TYPE_MAP: Record<string, string> = {
  Normal: "roadmap",
  Satellite: "satellite",
  Hybrid: "hybrid",
  Terrain: "terrain",
};

const CONTAINER_STYLE: React.CSSProperties = { width: "100%", height: "100%" };

/* ------------------------------------------------------------------ */
/* Implementacion WEB con @react-google-maps/api                      */
/* ------------------------------------------------------------------ */
const WebMap = forwardRef<NativeMapHandle, NativeMapProps>(function WebMap(
  { center, zoom, markers = [], circles = [], styles, mapTypeId, onMarkerClick, onMapClick, onCameraIdle, children, className, pulsePosition },
  ref
) {
  const loaded = useGoogleMapsLoaded();
  const errorMsg = useGoogleMapsError();
  const mapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);
  const onUnmount = useCallback(() => { mapRef.current = null; }, []);
  const handleIdle = useCallback(() => {
    const m = mapRef.current;
    if (!m || !onCameraIdle) return;
    const c = m.getCenter();
    if (!c) return;
    onCameraIdle({ lat: c.lat(), lng: c.lng(), zoom: m.getZoom() ?? zoom });
  }, [onCameraIdle, zoom]);
  const handleClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!onMapClick || !e.latLng) return;
    onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  }, [onMapClick]);

  const options = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: true,
    clickableIcons: false,
    gestureHandling: "greedy",
    mapTypeId: (mapTypeId && MAP_TYPE_MAP[mapTypeId]) || "roadmap",
    // En web siempre usamos el array `styles` para aplicar el tema oscuro.
    // El mapId de Cloud Console ignora `styles`, por eso se excluye aquí.
    styles: styles as google.maps.MapTypeStyle[] | undefined,
  }), [styles, mapTypeId]);

  useImperativeHandle(ref, () => ({
    async panTo(coord, z) {
      const m = mapRef.current;
      if (!m) return;
      m.panTo(coord);
      if (typeof z === "number") m.setZoom(z);
    },
    async setZoom(z) { mapRef.current?.setZoom(z); },
  }), []);

  const buildIcon = (m: NativeMarkerSpec): google.maps.Icon | undefined => {
    if (!m.iconUrl) return undefined;
    const g = (window as any).google;
    if (!g?.maps) return { url: m.iconUrl } as google.maps.Icon;
    const icon: google.maps.Icon = { url: m.iconUrl };
    if (m.iconSize) {
      icon.scaledSize = new g.maps.Size(m.iconSize.width, m.iconSize.height);
      icon.size = new g.maps.Size(m.iconSize.width, m.iconSize.height);
    }
    if (m.iconAnchor) icon.anchor = new g.maps.Point(m.iconAnchor.x, m.iconAnchor.y);
    return icon;
  };

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {!loaded ? (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 13,
        }}>
          {errorMsg || "Cargando mapa…"}
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={CONTAINER_STYLE}
          center={center}
          zoom={zoom}
          options={options}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onIdle={handleIdle}
          onClick={handleClick}
        >
          {markers.map((m) => (
            <Marker
              key={m.id}
              position={{ lat: m.lat, lng: m.lng }}
              icon={buildIcon(m)}
              title={m.title}
              zIndex={m.zIndex}
              onClick={() => onMarkerClick?.(m.id)}
            />
          ))}
          {circles.map((c) => (
            <Circle
              key={c.id}
              center={{ lat: c.lat, lng: c.lng }}
              radius={c.radius}
              options={{
                fillColor: c.fillColor,
                fillOpacity: c.fillOpacity,
                strokeColor: c.strokeColor,
                strokeOpacity: c.strokeOpacity,
                strokeWeight: c.strokeWidth,
                zIndex: c.zIndex,
                clickable: false,
              }}
            />
          ))}
          {pulsePosition && (
            <OverlayView
              position={pulsePosition}
              mapPaneName={OverlayView.OVERLAY_LAYER}
              getPixelPositionOffset={() => ({ x: 0, y: 0 })}
            >
              <div style={{
                position: "absolute",
                width: 180,
                height: 180,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="pulse-ring"
                    style={{ animationDelay: `${i * 0.75}s` }}
                  />
                ))}
              </div>
            </OverlayView>
          )}
        </GoogleMap>
      )}
      {children}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Implementacion NATIVA con @capacitor/google-maps                   */
/* ------------------------------------------------------------------ */
// Cuantizador de coordenadas en METROS. 1 grado de lat ≈ 111111m.
// Lo usamos como tolerancia para las firmas: dos posiciones a menos de
// `metersPerStep` metros se consideran iguales y NO disparan rebuild de
// markers/circles.
//
// IMPORTANTE: sin esto, el GPS reporta jitter sub-metro (lat 22.7112307 vs
// 22.7112198 vs 22.7112327) y como `useMemo` reconstruye el array `markers`
// con cada fix, el `useEffect([markers])` lo veia como "todos cambiaron",
// llamaba removeMarker+addMarker para CADA marker en CADA frame de GPS y
// el plugin Capacitor procesaba decenas de operaciones por segundo. El
// SDK Google Maps Android se saturaba: no renderizaba tiles (mapa en
// blanco) y nunca disparaba onCameraIdle. Sintomas observados antes del
// fix: 170+ markers creados en 2s, "MAP NATIVE" sin tiles, idle:0.
function quantizeMeters(coord: number, metersPerStep: number): string {
  const step = metersPerStep / 111111;
  return (Math.round(coord / step) * step).toFixed(6);
}
function markerSignature(m: NativeMarkerSpec): string {
  return [
    // ~5m de tolerancia. Suficiente para distinguir workers en mapa
    // (marcadores reales estan a decenas/cientos de metros) e ignora
    // jitter del GPS (1-3m tipico).
    quantizeMeters(m.lat, 5), quantizeMeters(m.lng, 5),
    m.iconUrl || "", m.title || "", m.snippet || "",
    m.iconSize ? `${m.iconSize.width}x${m.iconSize.height}` : "",
    m.iconAnchor ? `${m.iconAnchor.x},${m.iconAnchor.y}` : "",
    m.zIndex ?? "",
  ].join("|");
}
function circleSignature(c: NativeCircleSpec): string {
  return [
    quantizeMeters(c.lat, 5), quantizeMeters(c.lng, 5),
    // Radius cuantizado a multiplos de 25m. El "accuracy circle" del GPS
    // baja de 300m -> 80m mientras el fix converge; cuantizar evita
    // recrear el circulo en cada lectura.
    Math.round(c.radius / 25) * 25,
    c.fillColor || "", c.fillOpacity ?? "",
    c.strokeColor || "", c.strokeOpacity ?? "", c.strokeWidth ?? "",
    c.zIndex ?? "",
  ].join("|");
}

const NativeImpl = forwardRef<NativeMapHandle, NativeMapProps>(function NativeImpl(
  { center, zoom, markers = [], circles = [], styles, mapTypeId, onMarkerClick, onMapClick, onCameraIdle, children, className, visible, prewarm, pendingPosition },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraIdleCount, setCameraIdleCount] = useState<number>(0);
  // Fallback de seguridad: si pendingPosition sigue true (nunca deberia darse
  // con ready:true siempre, pero lo dejamos como safety net).
  const [pendingTimedOut, setPendingTimedOut] = useState(false);

  // Mutex para syncMarkers/syncCircles: evita race condition cuando dos fixes
  // GPS llegan en rapida sucesion. Sin mutex, la segunda corrida borraria
  // __user__ del estado antes de que la primera termite el addMarker, creando
  // un marker fantasma duplicado que nunca se limpia (native remove/add son
  // operaciones async de ~30-80ms cada una).
  const syncMarkersRunning = useRef(false);
  const syncMarkersPending = useRef<NativeMarkerSpec[] | null>(null);
  const syncCirclesRunning = useRef(false);
  const syncCirclesPending = useRef<NativeCircleSpec[] | null>(null);


  const markerStateRef = useRef<Map<string, { nativeId: string; sig: string }>>(new Map());
  const circleStateRef = useRef<Map<string, { nativeId: string; sig: string }>>(new Map());

  const initializedRef = useRef(false);
  const mountedRef = useRef(true);
  const readyRef = useRef(false);

  // ID del mapa nativo (asignado tras CapMap.create()). Necesario para
  // llamar directamente al bridge del plugin al ocultar/mostrar.
  const mapIdRef = useRef<string | null>(null);
  // Ancestros del contenedor marcados con data-native-map-ancestor para
  // la cadena de transparencia. Guardado en ref para que el efecto de
  // visibilidad pueda añadirlos/quitarlos sin depender del closure del
  // efecto de montaje.
  const taggedRef = useRef<HTMLElement[]>([]);

  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const onCameraIdleRef = useRef(onCameraIdle);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onCameraIdleRef.current = onCameraIdle; }, [onCameraIdle]);

  const markersRef = useRef(markers);
  const circlesRef = useRef(circles);
  markersRef.current = markers;
  circlesRef.current = circles;

  // Toggle de transparencias en cascada (html/body + ancestros) para que el
  // mapa nativo sea visible a traves del WebView. El plugin nativo dibuja la
  // MapView DEBAJO del WebView; cualquier ancestro con background opaco
  // entre <body> y el contenedor del mapa lo tapa y se ve todo negro.
  //
  // En modo prewarm SALTAMOS este efecto a proposito: queremos que el WebView
  // siga opaco y TAPE el MapView fantasma para que el usuario no lo vea.
  // El SDK igual descarga tiles porque el MapView nativo se renderiza debajo
  // del WebView (es una SurfaceView de Android, no un elemento del DOM).
  useEffect(() => {
    if (prewarm) return;
    if (typeof document === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native-map-active");
    document.body.classList.add("native-map-active");

    // Marcar todos los ancestros del contenedor del mapa hasta <body>
    // para que el CSS los pinte transparentes en cascada.
    // Guardamos en taggedRef para que el efecto de visibilidad pueda
    // añadirlos/quitarlos al navegar sin desmontar el componente.
    const tag = () => {
      const node = containerRef.current;
      if (!node) return;
      let cur: HTMLElement | null = node;
      while (cur && cur !== document.body) {
        if (!cur.hasAttribute("data-native-map-ancestor")) {
          cur.setAttribute("data-native-map-ancestor", "");
          taggedRef.current.push(cur);
        }
        cur = cur.parentElement;
      }
    };
    // Esperar al primer paint para que el ref ya este montado.
    const raf = requestAnimationFrame(tag);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("native-map-active");
      document.body.classList.remove("native-map-active");
      for (const el of taggedRef.current) el.removeAttribute("data-native-map-ancestor");
      taggedRef.current = [];
    };
  }, []);

  // Efecto de visibilidad: cuando el padre pasa visible=false (el usuario
  // navego a otra pantalla), ocultamos el MapView nativo llamando al bridge
  // directamente con mapBounds {0,0,0,0} — equivale a un hide() sin destruir.
  // Tambien quitamos las clases de transparencia para que las demas paginas
  // tengan fondo opaco. Cuando visible vuelve a true, restauramos todo.
  //
  // Esto requiere que el componente permanezca MONTADO mientras el usuario
  // navega (ver App.tsx: WorkerHome/ClientHome se renderizan fuera del Switch).
  useEffect(() => {
    if (prewarm) return; // En prewarm el mapa SIEMPRE esta a pantalla completa.
    if (visible === undefined) return; // prop no controlada → comportamiento previo
    if (!Capacitor.isNativePlatform()) return;
    const mapId = mapIdRef.current;
    const plugin: any = (window as any).Capacitor?.Plugins?.CapacitorGoogleMaps;

    if (!visible) {
      // --- OCULTAR ---
      // 1. Quitar transparencias para que las otras pantallas sean opacas.
      document.documentElement.classList.remove("native-map-active");
      document.body.classList.remove("native-map-active");
      for (const el of taggedRef.current) el.removeAttribute("data-native-map-ancestor");
      // 2. Colapsar el MapView nativo a tamaño 0 (equivale a hide()).
      if (mapId && plugin) {
        plugin.onResize({ id: mapId, mapBounds: { x: 0, y: 0, width: 0, height: 0 } })
          .catch(() => {});
      }
    } else {
      // --- MOSTRAR ---
      // 1. Restaurar cadena de transparencias.
      document.documentElement.classList.add("native-map-active");
      document.body.classList.add("native-map-active");
      // Re-marcar ancestros (pueden haber cambiado si el DOM mutagio).
      taggedRef.current = [];
      const node = containerRef.current;
      if (node) {
        let cur: HTMLElement | null = node;
        while (cur && cur !== document.body) {
          if (!cur.hasAttribute("data-native-map-ancestor")) {
            cur.setAttribute("data-native-map-ancestor", "");
          }
          taggedRef.current.push(cur);
          cur = cur.parentElement;
        }
      }
      // 2. Restaurar bounds del MapView nativo tras el repaint del DOM.
      if (mapId && plugin && containerRef.current) {
        requestAnimationFrame(() => {
          const el = containerRef.current;
          const pid = mapIdRef.current;
          if (!el || !pid) return;
          const rect = el.getBoundingClientRect();
          plugin.onResize({ id: pid, mapBounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
            .catch(() => {});
        });
      }
    }
  }, [visible]);

  // Espera a que el contenedor tenga un tamanio ESTABLE antes de crear el mapa.
  // "Estable" = mismo ancho+alto por STABLE_FRAMES frames consecutivos.
  // Esto evita que el plugin reciba height=564px en `create` y luego 677px en
  // `updateRender` (que llama el plugin internamente al resolver el create),
  // un doble-resize que interrumpe el ciclo de render inicial del SDK y hace
  // que onCameraIdle nunca se dispare.
  const waitForSize = (el: HTMLElement, timeoutMs = 8000): Promise<void> => new Promise((resolve, reject) => {
    const STABLE_FRAMES = 3;
    const start = performance.now();
    let lastW = 0, lastH = 0, stableCount = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (Math.abs(r.width - lastW) < 0.5 && Math.abs(r.height - lastH) < 0.5) {
          stableCount++;
          if (stableCount >= STABLE_FRAMES) { resolve(); return; }
        } else {
          lastW = r.width; lastH = r.height; stableCount = 1;
        }
      }
      if (performance.now() - start > timeoutMs) {
        if (lastW > 0 && lastH > 0) { resolve(); return; }
        reject(new Error("contenedor sin tamano")); return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      if (!prewarm && visible === false) return;
      if (!containerRef.current || initializedRef.current) return;
      initializedRef.current = true;
      setErrorMsg(null);

      try {
        await waitForSize(containerRef.current);
        if (cancelled) return;

        // IMPORTANTE: el SDK NATIVO de Google Maps (Android/iOS) NO acepta
        // `styles` como JSON — esa API solo existe en el SDK web. Si se le
        // pasan estilos JSON, el SDK los reenvia al endpoint de tiles
        // (https://www.google.com/maps/vt/proto?...&styles=...) y Google
        // responde con tiles vacios -> el mapa se ve como un fondo beige liso
        // sin calles ni etiquetas (ese era exactamente el sintoma que tenia
        // este mapa).
        //
        // Para tener un mapa estilizado en nativo hay que crear un Map ID
        // estilizado en Google Cloud Console y pasar `mapId` (no `styles`).
        const mapIdNative = getMapId();
        // BUG IMPORTANTE descubierto 27-abr-2026:
        // El plugin @capacitor/google-maps v8.0.1 NO lee la clave `mapId`
        // en su codigo nativo. Cada plataforma lee su propia clave:
        //   - Android (GoogleMapConfig.kt linea 111):
        //       mapId = fromJSONObject.getString("androidMapId")
        //   - iOS (GoogleMapConfig.swift linea 60):
        //       self.mapId = fromJSObject["iOSMapId"] as? String
        //   - Web (plugin.js): usa `mapId` legacy.
        // Si pasamos solo `mapId`, el SDK NATIVO crea el mapa SIN mapId y
        // el estilo de Cloud Console NUNCA se aplica -> tiles vacios beige.
        // Por eso pasamos las tres claves apuntando al mismo Map ID.
        //
        // Config minimo y limpio para el plugin nativo Android. Removidos:
        //   - `apiKey`: el plugin Android lo IGNORA, lee siempre del
        //     AndroidManifest meta-data com.google.android.geo.API_KEY.
        //     Pasarlo solo agregaba ruido al bridge.
        //   - `disableDefaultUI`: no existe en GoogleMapConfig.kt nativo.
        //   - `mapType`: el Kotlin lee la key `mapTypeId` (no `mapType`).
        //     Antes pasabamos la key incorrecta y el SDK la ignoraba.
        const liteMode = isLiteModeEnabled();
        const nativeConfig: any = {
          center,
          zoom,
          androidLiteMode: liteMode,
          // 28-abr-2026: forzar variante OSCURA del estilo del Map ID a nivel
          // SDK (independiente del modo del SO o del tema de la app). Lo lee
          // nuestro patch a @capacitor/google-maps en GoogleMapConfig.kt y
          // llama a googleMapOptions.mapColorScheme(MapColorScheme.DARK).
          // Sin esto, el SDK usa FOLLOW_SYSTEM por default y muchos devices
          // (especialmente con MIUI/HyperOS y algunos Samsung) ignoran el
          // AppCompatDelegate.MODE_NIGHT_YES y renderizan los tiles claros.
          androidMapColorScheme: "DARK",
        };
        if (mapTypeId) nativeConfig.mapTypeId = MAP_TYPE_MAP[mapTypeId] || "roadmap";
        if (mapIdNative) {
          nativeConfig.mapId = mapIdNative;
          nativeConfig.androidMapId = mapIdNative;
          nativeConfig.iOSMapId = mapIdNative;
        }
        // Log VERBOSE del config exacto que se manda al plugin nativo.
        // Visible en Chrome DevTools (chrome://inspect → tu device).
        // Si filtras por "[NativeMap-DEBUG]" tenes el JSON completo.
        try {
          console.log("[NativeMap-DEBUG] config enviado al plugin:", JSON.stringify(nativeConfig));
          console.log("[NativeMap-DEBUG] mapId final:", mapIdNative || "(ninguno)");
        } catch {}
        let nativeApiKey = "";
        try {
          if (typeof __GOOGLE_MAPS_KEY_MOBILE__ !== "undefined" && __GOOGLE_MAPS_KEY_MOBILE__) {
            nativeApiKey = __GOOGLE_MAPS_KEY_MOBILE__;
          } else if (typeof __GOOGLE_MAPS_KEY__ !== "undefined" && __GOOGLE_MAPS_KEY__) {
            nativeApiKey = __GOOGLE_MAPS_KEY__;
          }
        } catch { /* noop */ }
        const map = await CapMap.create({
          id: `fixxer-map-${Math.random().toString(36).slice(2, 9)}`,
          apiKey: nativeApiKey,
          element: containerRef.current,
          config: nativeConfig,
          forceCreate: true,
        });
        if (cancelled) {
          await map.destroy();
          return;
        }
        mapRef.current = map;
        mapIdRef.current = (map as any).id ?? null;
        readyRef.current = true;

        await map.setOnMarkerClickListener((evt: any) => {
          const cb = onMarkerClickRef.current;
          if (!cb) return;
          const nativeId = evt.markerId;
          for (const [logicalId, st] of markerStateRef.current.entries()) {
            if (st.nativeId === nativeId) { cb(logicalId); return; }
          }
        });
        await map.setOnMapClickListener((evt: any) => {
          onMapClickRef.current?.({ lat: evt.latitude, lng: evt.longitude });
        });
        await map.setOnCameraIdleListener((evt: any) => {
          // Cada vez que la camara queda quieta sumamos. Si el contador
          // sube significa que el SDK MapView esta vivo y respondiendo
          // (independiente de si los tiles se ven o no).
          setCameraIdleCount((c) => c + 1);
          onCameraIdleRef.current?.({ lat: evt.latitude, lng: evt.longitude, zoom: evt.zoom });
        });

        await syncMarkers(markersRef.current);
        await syncCircles(circlesRef.current);

        // ============================================================
        // FIX GESTOS (29-abr-2026):
        // El plugin v8.0.1 usa este flujo para gestos en Android:
        //   1. WebView.onTouch -> plugin verifica si touch cae dentro
        //      del mapRect (basado en config.x/y/width/height del create)
        //   2. Si si, dispatch evento "isMapInFocus" al JS con (x,y)
        //   3. El JS hace document.elementFromPoint(x,y) y verifica
        //      elem.dataset.internalId === mapId. Si si, dispatch
        //      "dispatchMapEvent({focus:true})" -> plugin reenvia los
        //      eventos cacheados al MapView nativo.
        //
        // Bugs descubiertos en nuestro setup:
        //   a) El dataset.internalId que setea el plugin (en map.js
        //      linea 42) puede sobre-escribirse por React durante un
        //      re-render del div. Forzamos a que SIEMPRE este puesto.
        //   b) Los bounds de Android se calculan UNA VEZ al create.
        //      Si el container final difiere del inicial, el touch
        //      cae fuera del mapRect y onTouch nunca dispara
        //      isMapInFocus. Forzamos un onResize despues del create.
        //   c) El sistema necesita enableTouch explicito en Android.
        // ============================================================
        try {
          const node = containerRef.current;
          const pid = mapIdRef.current;
          const plugin: any = (window as any).Capacitor?.Plugins?.CapacitorGoogleMaps;
          if (node && pid) {
            // (a) Forzar dataset.internalId — clave para que document
            //     .elementFromPoint() devuelva nuestro div con el id
            //     correcto. Si React re-renderea el div, el dataset
            //     se mantiene porque setAttribute es imperativo.
            node.dataset.internalId = pid;
          }
          if (node && pid && plugin) {
            // (b) Refrescar bounds nativos con el rect ACTUAL del DOM.
            //     El plugin solo dispara onResize si cambia w/h via
            //     ResizeObserver — no detecta cambios de POSICION.
            //     Lo forzamos manualmente en el frame siguiente.
            requestAnimationFrame(() => {
              const r = node.getBoundingClientRect();
              plugin.onResize({
                id: pid,
                mapBounds: { x: r.x, y: r.y, width: r.width, height: r.height },
              }).catch(() => {});
            });
          }
          if (pid && plugin?.enableTouch) {
            // (c) Forzar enableTouch (en algunos devices Android v8 inicia
            //     con touchEnabled=undefined y no procesa los gestos).
            plugin.enableTouch({ id: pid }).catch(() => {});
          }
        } catch { /* no-op */ }

        // CRITICO – onCameraIdle del SDK se dispara UNA sola vez al terminar
        // el primer render (inmediatamente despues de create). En ese momento
        // el listener AUN no esta registrado (lo registramos 300ms despues,
        // tras addListeners + syncMarkers). Resultado: cameraIdle=0 para
        // siempre y el debug overlay muestra el mapa como "no respondiendo".
        //
        // Solucion: forzar un movimiento de camara minimo (zoom ±0 con
        // animate:false) despues de registrar todos los listeners. Esto re-
        // dispara onCameraIdle con el listener ya listo, incrementa el
        // contador y confirma que el SDK esta vivo.
        try {
          await (map as any).setCamera({
            coordinate: { lat: center.lat, lng: center.lng },
            zoom,
            animate: false,
          });
        } catch { /* no-op si el SDK no lo soporta */ }
      } catch (err: any) {
        if (cancelled) return;
        console.error("[NativeMap] error init:", err);
        setErrorMsg(String(err?.message || err));
        initializedRef.current = false;
      }
    }

    init();

    return () => {
      cancelled = true;
      if (!mapRef.current) initializedRef.current = false;
    };
    // Reintentar cuando la pantalla de inicio oculta se vuelve visible.
    // No se destruye el mapa al cambiar de pantalla: el efecto separado de
    // visibilidad sigue reduciendo/restaurando sus bounds nativos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, prewarm]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readyRef.current = false;
      const m = mapRef.current;
      if (m) {
        mapRef.current = null;
        markerStateRef.current.clear();
        circleStateRef.current.clear();
        m.destroy().catch(() => {});
      }
      initializedRef.current = false;
    };
  }, []);

  async function syncMarkersInner(next: NativeMarkerSpec[]) {
    const map = mapRef.current;
    if (!map) return;
    const state = markerStateRef.current;
    const nextById = new Map(next.map((m) => [m.id, m] as const));

    const toRemove: string[] = [];
    for (const [logicalId, st] of state.entries()) {
      const incoming = nextById.get(logicalId);
      if (!incoming) {
        toRemove.push(st.nativeId);
        state.delete(logicalId);
      } else if (markerSignature(incoming) !== st.sig) {
        toRemove.push(st.nativeId);
        state.delete(logicalId);
      }
    }
    for (const nid of toRemove) {
      try { await map.removeMarker(nid); } catch {}
    }

    for (const m of next) {
      if (state.has(m.id)) continue;
      try {
        // El plugin nativo NO soporta `data:` URIs como iconUrl en Android
        // (los trata como path relativo y falla con FileNotFoundException).
        // Si llega un data URI lo descartamos y dejamos el marker default
        // del plugin. Para iconos custom hay que servir un asset estatico
        // desde public/ y pasar URL relativa.
        //
        // 30-abr-2026: ADEMAS hay que QUITAR la barra inicial. El plugin
        // Android (CapacitorGoogleMap.kt:881) abre el icono con
        // `assets.open("public/${iconUrl}")`. Si pasamos `/foo.png`, el
        // path resuelto queda `public//foo.png` (doble barra) y falla con
        // FileNotFoundException → el SDK cae al pin rojo default sin avisar
        // (solo log warning). Sin la barra queda `public/foo.png` correcto.
        let safeIconUrl: string | undefined;
        if (m.iconUrl && !m.iconUrl.startsWith("data:")) {
          safeIconUrl = m.iconUrl.replace(/^\/+/, "");
        }
        const nid = await map.addMarker({
          coordinate: { lat: m.lat, lng: m.lng },
          iconUrl: safeIconUrl,
          iconSize: safeIconUrl ? m.iconSize : undefined,
          iconAnchor: safeIconUrl ? m.iconAnchor : undefined,
          title: m.title,
          snippet: m.snippet,
          zIndex: m.zIndex,
        });
        if (!mountedRef.current) return;
        state.set(m.id, { nativeId: nid, sig: markerSignature(m) });
      } catch (err) {
        console.warn("[NativeMap] addMarker error:", err);
      }
    }
  }
  // Wrapper con mutex: si ya hay una sync corriendo, guarda la mas reciente
  // y la corre al terminar. Evita duplicados cuando dos fixes GPS llegan
  // en rapida sucesion (~30-80ms de separacion) — sin mutex, removeMarker
  // + addMarker se solapan y quedan markers fantasma en el mapa nativo.
  async function syncMarkers(next: NativeMarkerSpec[]) {
    if (syncMarkersRunning.current) {
      syncMarkersPending.current = next;
      return;
    }
    syncMarkersRunning.current = true;
    try {
      await syncMarkersInner(next);
    } finally {
      syncMarkersRunning.current = false;
      const pending = syncMarkersPending.current;
      if (pending !== null) {
        syncMarkersPending.current = null;
        syncMarkers(pending).catch(() => {});
      }
    }
  }
  useEffect(() => { if (readyRef.current) syncMarkers(markers).catch(() => {}); }, [markers]);

  async function syncCirclesInner(next: NativeCircleSpec[]) {
    const map = mapRef.current;
    if (!map) return;
    const state = circleStateRef.current;
    const nextById = new Map(next.map((c) => [c.id, c] as const));

    const toRemove: string[] = [];
    for (const [logicalId, st] of state.entries()) {
      const incoming = nextById.get(logicalId);
      if (!incoming) {
        toRemove.push(st.nativeId);
        state.delete(logicalId);
      } else if (circleSignature(incoming) !== st.sig) {
        toRemove.push(st.nativeId);
        state.delete(logicalId);
      }
    }
    if (toRemove.length) {
      try { await map.removeCircles?.(toRemove); } catch {}
    }
    for (const c of next) {
      if (state.has(c.id)) continue;
      try {
        const ids = await map.addCircles?.([{
          center: { lat: c.lat, lng: c.lng },
          radius: c.radius,
          fillColor: c.fillColor,
          fillOpacity: c.fillOpacity,
          strokeColor: c.strokeColor,
          strokeOpacity: c.strokeOpacity,
          strokeWeight: c.strokeWidth,
          zIndex: c.zIndex,
          clickable: false,
        }]);
        if (!mountedRef.current) return;
        if (ids && ids[0]) state.set(c.id, { nativeId: ids[0], sig: circleSignature(c) });
      } catch (err) {
        console.warn("[NativeMap] addCircles error:", err);
      }
    }
  }
  async function syncCircles(next: NativeCircleSpec[]) {
    if (syncCirclesRunning.current) {
      syncCirclesPending.current = next;
      return;
    }
    syncCirclesRunning.current = true;
    try {
      await syncCirclesInner(next);
    } finally {
      syncCirclesRunning.current = false;
      const pending = syncCirclesPending.current;
      if (pending !== null) {
        syncCirclesPending.current = null;
        syncCircles(pending).catch(() => {});
      }
    }
  }
  useEffect(() => { if (readyRef.current) syncCircles(circles).catch(() => {}); }, [circles]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setCamera({
      coordinate: { lat: center.lat, lng: center.lng },
      zoom,
      animate: true,
      animationDuration: 400,
    }).catch(() => {});
  }, [center.lat, center.lng, zoom]);

  useImperativeHandle(ref, () => ({
    async panTo(coord, z) {
      const m = mapRef.current;
      if (!m) return;
      await m.setCamera({
        coordinate: coord,
        zoom: z,
        animate: true,
        animationDuration: 400,
      });
    },
    async setZoom(z) {
      const m = mapRef.current;
      if (!m) return;
      await m.setCamera({ zoom: z, animate: true, animationDuration: 300 });
    },
  }));

  // 30-abr-2026: Placeholder estilo "mapa" para que el usuario vea algo que
  // PARECE un mapa desde el primer frame, en lugar de pantalla negra con
  // spinner. Antes mostrábamos un fondo `#1a1a1a` sólido + loader; eso se
  // sentía como "esperando que cargue el mapa". Ahora rendereamos un SVG
  // inline con la paleta del estilo dark + una grilla sutil + algunas
  // líneas tipo calle + un dot amarillo central simulando "tu ubicación".
  //
  // Timeout de seguridad: si pendingPosition sigue true 20s despues de montar
  // el componente, forzamos mapReady = true de todas formas. Esto evita que
  // el placeholder se quede pegado indefinidamente en casos extremos (GPS
  // muy lento, false-denied temporal del sistema de permisos, etc.).
  // Si pendingPosition baja a false antes del timeout, reseteamos el flag.
  useEffect(() => {
    if (!pendingPosition) {
      setPendingTimedOut(false);
      return;
    }
    const t = setTimeout(() => setPendingTimedOut(true), 20_000);
    return () => clearTimeout(t);
  }, [pendingPosition]);

  // Cuando cameraIdleCount >= 1 (tiles reales cargados), el overlay hace
  // fade-out en 300ms y el mapa real toma control sin que el usuario perciba
  // la transición.
  //
  // 30-abr-2026: si `pendingPosition` es true (todavia no hay GPS), el
  // placeholder se mantiene visible aunque cameraIdle ya haya disparado.
  // Asi evitamos que el usuario vea el mapa real centrado en el fallback
  // (Santiago) durante 30+ segundos hasta que el GPS responda.
  // 1-may-2026: pendingTimedOut fuerza mapReady tras 20s como safety net.
  const mapReady = cameraIdleCount >= 1 && (!pendingPosition || pendingTimedOut);
  return (
    <div
      data-native-map-host
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", background: "transparent" }}
    >
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, background: "transparent" }}
      />
      {/* Placeholder con apariencia de mapa. pointer-events:none para no
          bloquear gestos del MapView nativo. En prewarm no se muestra
          (el contenedor padre tiene opacity:0). */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "#1a1a1a",
          pointerEvents: "none",
          opacity: prewarm ? 0 : (mapReady ? 0 : 1),
          transition: "opacity 400ms ease-out",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        {!mapReady && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            viewBox="0 0 360 640"
            style={{ display: "block" }}
          >
            <defs>
              {/* Patrón de grilla sutil — emula el "fondo" de los tiles
                  del estilo dark de Google Maps cuando hay zoom medio. */}
              <pattern id="fxgrid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#222" strokeWidth="1" />
              </pattern>
              {/* Halo translúcido para el dot del usuario. */}
              <radialGradient id="fxhalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#2563EB" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Fondo base color landscape del estilo dark. */}
            <rect width="360" height="640" fill="#1a1a1a" />
            {/* Grilla sutil. */}
            <rect width="360" height="640" fill="url(#fxgrid)" />
            {/* Línea ancha estilo highway (diagonal). */}
            <path d="M -40 480 Q 120 360 220 280 T 420 80" stroke="#3d3d3d" strokeWidth="14" fill="none" strokeLinecap="round" />
            <path d="M -40 480 Q 120 360 220 280 T 420 80" stroke="#505050" strokeWidth="6" fill="none" strokeLinecap="round" />
            {/* Calle arterial horizontal. */}
            <path d="M -20 380 Q 180 370 380 360" stroke="#333" strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M -20 380 Q 180 370 380 360" stroke="#444" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* Calles locales más finas. */}
            <path d="M 60 0 L 140 640" stroke="#2a2a2a" strokeWidth="4" fill="none" />
            <path d="M 280 0 L 240 640" stroke="#2a2a2a" strokeWidth="4" fill="none" />
            <path d="M 0 180 L 360 220" stroke="#2a2a2a" strokeWidth="3" fill="none" />
            <path d="M 0 540 L 360 560" stroke="#2a2a2a" strokeWidth="3" fill="none" />
            {/* Mancha tipo parque/agua oscura. */}
            <ellipse cx="80" cy="120" rx="60" ry="40" fill="#0d0d0d" opacity="0.9" />
            {/* Halo + dot amarillo del usuario en el centro del placeholder. */}
            <circle cx="180" cy="320" r="60" fill="url(#fxhalo)" />
            <circle cx="180" cy="320" r="14" fill="#FFFFFF" />
            <circle cx="180" cy="320" r="11" fill="#2563EB" />
          </svg>
        )}
      </div>
      {errorMsg && (
        <div style={{
          position: "absolute", top: 8, left: 8, right: 8,
          background: "rgba(220,38,38,0.92)", color: "#fff",
          padding: "8px 10px", borderRadius: 8, fontSize: 12, zIndex: 9999,
        }}>
          Mapa: {errorMsg}
        </div>
      )}
      {children}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Error boundary para capturar fallos del mapa nativo                */
/* ------------------------------------------------------------------ */
interface MapErrorBoundaryState { hasError: boolean; error: Error | null }

class MapErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  MapErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[NativeMap] Error boundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "#f1f5f9", borderRadius: 8,
        }}>
          <div style={{ textAlign: "center", color: "#64748b", padding: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
            <div style={{ fontSize: 14 }}>No se pudo cargar el mapa</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Componente publico: elige implementacion segun plataforma          */
/* ------------------------------------------------------------------ */
export const NativeMap = forwardRef<NativeMapHandle, NativeMapProps>(function NativeMap(props, ref) {
  if (IS_NATIVE) {
    return (
      <MapErrorBoundary>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <NativeImpl ref={ref} {...props} />
        </div>
      </MapErrorBoundary>
    );
  }
  if (props.prewarm) return null;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <WebMap ref={ref} {...props} />
    </div>
  );
});

