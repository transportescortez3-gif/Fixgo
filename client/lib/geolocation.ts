let isCapacitor: boolean | null = null;

function detectCapacitor(): boolean {
  if (isCapacitor !== null) return isCapacitor;
  try {
    isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    isCapacitor = false;
  }
  return isCapacitor;
}

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type GeoStatus = "unknown" | "granted" | "denied" | "service-off" | "unavailable";

const LAST_POS_KEY = "fixgo_last_position";
// 30-abr-2026: subimos el TTL de 5min → 7 días.
// Antes, si el usuario abría la app después de >5min de no usarla, el cache
// quedaba "stale" y el mapa se centraba en el fallback de Santiago hasta que
// llegaba el primer fix del GPS (1-3s). Eso producía un salto visible y
// confundía al usuario ("¿por qué empieza en Santiago si vivo en Concepción?").
//
// El fix válido para CENTRAR el mapa puede ser viejo (la ciudad del usuario
// no cambia entre sesiones); el GPS apenas llega lo reemplaza. La accuracy
// real se valida en useSmoothPosition antes de hacer recommendations.
// 29-may-2026: reducido de 7 días → 1 hora.
// Con 7 días, una posición incorrecta grabada por un bug GPS antiguo podía
// usarse durante una semana como centro del mapa. Con 1 hora, la posición
// sólo se usa si la sesión anterior fue muy reciente; de lo contrario se
// vuelve al fallback de Santiago. El GPS al llegar reemplaza inmediatamente.
const LAST_POS_MAX_AGE_MS = 60 * 60 * 1000;

// Estado global del permiso/servicio. Se cachea para evitar bucles infinitos
// pidiéndole permiso al usuario o al SO cuando ya sabemos que está denegado
// o el servicio de ubicación está apagado.
let cachedStatus: GeoStatus = "unknown";
let inflightFix: Promise<GeoPosition> | null = null;
// Token de generación: cada vez que reseteamos, lo incrementamos para invalidar
// promesas y emisiones de status pendientes (evita que una llamada vieja
// sobreescriba el status después de un retry).
let generation = 0;
const statusListeners = new Set<(s: GeoStatus) => void>();

function setStatus(s: GeoStatus): void {
  if (cachedStatus === s) return;
  cachedStatus = s;
  for (const fn of statusListeners) {
    try { fn(s); } catch { /* noop */ }
  }
}

/**
 * Permite forzar un estado de geolocalización desde fuera del módulo.
 * Usado por useLocationStartup para reflejar el resultado de su propio
 * checkPermissions/getCurrentPosition rápido.
 */
export function setGeolocationStatus(s: GeoStatus): void {
  setStatus(s);
}

export function getGeolocationStatus(): GeoStatus {
  return cachedStatus;
}

export function onGeolocationStatusChange(fn: (s: GeoStatus) => void): () => void {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}

/**
 * Resetea el cache de permiso. Llamar cuando el usuario regrese desde
 * Ajustes del sistema y queramos volver a intentar. Invalida cualquier
 * promesa o callback de status pendiente vía bump del generation token.
 */
export function resetGeolocationStatus(): void {
  generation += 1;
  cachedStatus = "unknown";
  inflightFix = null;
  for (const fn of statusListeners) {
    try { fn("unknown"); } catch { /* noop */ }
  }
}

function classifyError(err: any): GeoStatus {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  if (code === "OS-PLUG-GLOC-0007" || msg.includes("services are not enabled") || msg.includes("location services")) {
    return "service-off";
  }
  if (code === "OS-PLUG-GLOC-0003" || code === "1" || msg.includes("denied") || msg.includes("permission")) {
    return "denied";
  }
  return "unavailable";
}

function saveLastPosition(pos: GeoPosition): void {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ ...pos, ts: Date.now() }));
  } catch { /* noop */ }
}

export function getLastKnownPosition(): GeoPosition | null {
  try {
    const raw = localStorage.getItem(LAST_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    if (Date.now() - (parsed.ts ?? 0) > LAST_POS_MAX_AGE_MS) return null;
    return { lat: parsed.lat, lng: parsed.lng, accuracy: parsed.accuracy };
  } catch {
    return null;
  }
}

async function getCurrentPositionInternal(myGen: number): Promise<GeoPosition> {
  // Helper: si el generation token cambió mientras esperábamos, descartamos
  // cualquier efecto secundario (no toques setStatus, no guardes posición vieja).
  const stale = () => myGen !== generation;

  if (detectCapacitor()) {
    const { Geolocation } = await import("@capacitor/geolocation");

    // Permisos: pedir UNA vez. Si falla, marcamos el status y no reintentamos.
    try {
      const perms = await Geolocation.checkPermissions();
      if (perms.location !== "granted") {
        const req = await Geolocation.requestPermissions();
        if (req.location !== "granted") {
          if (!stale()) setStatus("denied");
          throw Object.assign(new Error("Location permission request was denied."), { code: "OS-PLUG-GLOC-0003" });
        }
      }
    } catch (err: any) {
      const status = classifyError(err);
      if (!stale() && (status === "denied" || status === "service-off")) {
        setStatus(status);
      }
      throw err;
    }

    // 29-may-2026: el fix INICIAL usa BAJA precisión (network/wifi/fused).
    // Razón crítica: enableHighAccuracy:true + maximumAge:0 obliga al chip GPS
    // a conseguir un lock de satélites. INDOORS (interiores) ese lock puede no
    // llegar NUNCA → el usuario se queda sin ubicación incluso tras 5+ minutos.
    // Con enableHighAccuracy:false el proveedor fusionado devuelve una posición
    // de red/wifi en 1-3s que SÍ funciona en interiores. El watchPosition
    // (high-accuracy) refina después a precisión de GPS cuando hay señal real.
    // El "salto" del fix de red al de GPS se enmascara con el halo de accuracy
    // del dot, igual que hacen Google Maps y Uber.
    // maximumAge:30000 permite reutilizar un fix reciente del SO → display casi
    // instantáneo.
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000,
      });
      if (stale()) throw Object.assign(new Error("Cancelado"), { code: "STALE" });
      const result = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      setStatus("granted");
      saveLastPosition(result);
      return result;
    } catch (err: any) {
      const status = classifyError(err);
      if (!stale() && (status === "denied" || status === "service-off")) setStatus(status);
      throw err;
    }
  }

  // Web/PWA — baja precisión para el fix inicial (rápido, funciona sin GPS
  // dedicado). El watch refina luego con alta precisión.
  //
  // maximumAge:300000 (5 min): si Chrome tiene cualquier posición cacheada de
  // los últimos 5 min (de esta u otra pestaña), la devuelve INMEDIATAMENTE sin
  // tocar el hardware → clave para desktop sin GPS. El watchPosition que corre
  // en paralelo refinará con posición fresca cuando esté disponible.
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      reject(new Error("Geolocalización no disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const r = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setStatus("granted");
        saveLastPosition(r);
        resolve(r);
      },
      (err) => {
        if (err?.code === 1) setStatus("denied");
        else if (err?.code === 2) setStatus("service-off");
        reject(err);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  });
}

/**
 * Fallback de último recurso: geolocalización por IP.
 * Precisión ~5-50 km (nivel ciudad). Se llama cuando navigator.geolocation
 * falla repetidamente (desktop sin chip GPS, GPS apagado, etc.).
 *
 * Usa el endpoint propio del servidor /api/geoip (proxy server-side a ipapi.co).
 * Esto evita problemas de CORS, rate-limiting por IP de cliente, y bloqueos
 * de navegador que hacen fallar el fetch directo a ipapi.co desde el browser.
 */
export async function getIpLocation(): Promise<GeoPosition> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("/api/geoip", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`geoip server ${res.status}`);
    const data = await res.json() as { lat?: number; lng?: number; accuracy?: number; error?: string };
    if (data.error || typeof data.lat !== "number" || typeof data.lng !== "number") {
      throw new Error(`geoip bad data: ${data.error ?? "no coords"}`);
    }
    return { lat: data.lat, lng: data.lng, accuracy: data.accuracy ?? 15000 };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Devuelve un fix de ubicación. Si ya sabemos que el permiso está denegado o
 * el servicio está apagado, rechaza inmediatamente sin llamar al SO (evita el
 * bucle infinito de pop-ups o errores en consola).
 *
 * Las llamadas concurrentes comparten la misma promesa en vuelo.
 */
export async function getCurrentPosition(): Promise<GeoPosition> {
  if (cachedStatus === "denied" || cachedStatus === "service-off" || cachedStatus === "unavailable") {
    throw Object.assign(new Error("Geolocation no disponible"), { code: cachedStatus });
  }
  if (inflightFix) return inflightFix;
  const myGen = generation;
  inflightFix = getCurrentPositionInternal(myGen).finally(() => {
    // Solo limpiamos si seguimos siendo la promesa actual (no si un reset disparó otra).
    if (myGen === generation) inflightFix = null;
  });
  return inflightFix;
}

/**
 * Vigila la posición en tiempo real. Si el permiso ya está denegado o el
 * servicio apagado, no se inicia el watch y se notifica una sola vez al
 * onError; así no martilleamos al SO con peticiones que sabemos van a fallar.
 */
export function watchPosition(
  callback: (pos: GeoPosition) => void,
  onError?: (err: any) => void
): () => void {
  if (cachedStatus === "denied" || cachedStatus === "service-off" || cachedStatus === "unavailable") {
    queueMicrotask(() => onError?.(Object.assign(new Error("Geolocation no disponible"), { code: cachedStatus })));
    return () => {};
  }

  let firstFix = true;
  let lastGood: GeoPosition | null = null;
  const handle = (pos: GeoPosition) => {
    if (!firstFix) {
      // 29-may-2026: eliminado el filtro accuracy > 100m.
      // En arranque en frío el GPS tarda 30-60s en tener buena precisión y
      // los fixes intermedios (100-500m) son legítimos para centrar el mapa.
      // useSmoothPosition maneja su propio dead-zone para suavizar el dot.
      if (lastGood && pos.accuracy && lastGood.accuracy) {
        const R = 6371000;
        const dLat = ((pos.lat - lastGood.lat) * Math.PI) / 180;
        const dLng = ((pos.lng - lastGood.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lastGood.lat * Math.PI) / 180) *
            Math.cos((pos.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (pos.accuracy > lastGood.accuracy && distM < lastGood.accuracy) return;
      }
    }
    firstFix = false;
    lastGood = pos;
    setStatus("granted");
    saveLastPosition(pos);
    callback(pos);
  };

  if (detectCapacitor()) {
    let watchId: string | null = null;
    let cancelled = false;
    import("@capacitor/geolocation").then(async ({ Geolocation }) => {
      if (cancelled) return;
      try {
        const perms = await Geolocation.checkPermissions();
        if (perms.location !== "granted") {
          const req = await Geolocation.requestPermissions();
          if (req.location !== "granted") {
            setStatus("denied");
            onError?.(Object.assign(new Error("Permiso denegado"), { code: "OS-PLUG-GLOC-0003" }));
            return;
          }
        }
      } catch (err: any) {
        const status = classifyError(err);
        if (status === "denied" || status === "service-off") setStatus(status);
        onError?.(err);
        return;
      }
      if (cancelled) return;
      Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
        (pos, err) => {
          if (err) {
            const status = classifyError(err);
            if (status === "denied" || status === "service-off") {
              setStatus(status);
              // Cancelar el watch — no tiene sentido seguir intentando
              if (watchId !== null) {
                Geolocation.clearWatch({ id: watchId }).catch(() => {});
                watchId = null;
              }
            }
            onError?.(err);
            return;
          }
          if (pos) handle({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        }
      ).then((id) => {
        if (cancelled) {
          Geolocation.clearWatch({ id });
        } else {
          watchId = id;
        }
      });
    });
    return () => {
      cancelled = true;
      if (watchId !== null) {
        const id = watchId;
        watchId = null;
        import("@capacitor/geolocation").then(({ Geolocation }) => Geolocation.clearWatch({ id }));
      }
    };
  }

  if (!navigator.geolocation) {
    setStatus("unavailable");
    queueMicrotask(() => onError?.(new Error("Geolocalización no disponible")));
    return () => {};
  }

  // Chrome en desktop no tiene chip GPS. Cuando watchPosition usa
  // enableHighAccuracy:true, Chrome intenta GPS nativo → siempre da TIMEOUT
  // en escritorio. Estrategia de degradación progresiva:
  //
  //   Intentos 0-1: alta precisión (enableHighAccuracy:true, timeout:30s)
  //                 → funciona en móvil con GPS. En desktop hace timeout.
  //   Intento  2+:  baja precisión (enableHighAccuracy:false, timeout:20s)
  //                 → usa WiFi/IP geolocation, funciona en desktop.
  //                 maximumAge:120000 acepta caché de hasta 2 min para primer
  //                 fix rápido; Chrome sigue entregando actualizaciones después.
  //
  // También manejamos el bug de Chrome donde code:3 cancela el watch (vs spec
  // W3C que lo mantiene activo). Solucionamos reiniciando el watch.
  let currentId: number | null = null;
  let cancelled = false;
  let timeoutCount = 0;

  function startWatch() {
    if (cancelled) return;
    const highAccuracy = timeoutCount < 1;
    const opts: PositionOptions = highAccuracy
      ? { enableHighAccuracy: true,  timeout: 30000, maximumAge: 0 }
      : { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 };

    currentId = navigator.geolocation.watchPosition(
      (pos) => {
        handle({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      (err) => {
        if (err?.code === 1) {
          setStatus("denied");
          onError?.(err);
          return;
        }
        if (err?.code === 2) {
          setStatus("service-off");
          onError?.(err);
          return;
        }
        // Código 3 = TIMEOUT: Chrome cancela el watch → reiniciamos.
        // Incrementamos el contador para degradar progresivamente.
        timeoutCount += 1;
        onError?.(err);
        if (currentId !== null) {
          navigator.geolocation.clearWatch(currentId);
          currentId = null;
        }
        setTimeout(() => startWatch(), 1000);
      },
      opts,
    );
  }

  startWatch();

  return () => {
    cancelled = true;
    if (currentId !== null) {
      navigator.geolocation.clearWatch(currentId);
      currentId = null;
    }
  };
}
