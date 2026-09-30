import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { NativeMap } from "./native-map";
import { getLastKnownPosition, onGeolocationStatusChange } from "@/lib/geolocation";

const SANTIAGO_FALLBACK = { lat: -33.4489, lng: -70.6693 };

const PREWARM_DONE_KEY = "fixgo_map_prewarmed";

// Niveles de zoom que se cargan en secuencia para cachear tiles desde el nivel
// ciudad (12) hasta el nivel calle (16). Cada nivel dura 4 segundos — suficiente
// para que el SDK descargue los tiles del área visible y los guarde en disco.
// Los tiles vector de Google Maps persisten entre sesiones en:
//   /data/data/com.fixxer.app/cache/  (Android)
// Así la segunda apertura de la app muestra el mapa al instante sin internet.
const ZOOM_STEPS = [12, 14, 16];
const STEP_DURATION_MS = 4_000;
const PREWARM_DURATION_MS = ZOOM_STEPS.length * STEP_DURATION_MS; // 12s total

function readInitialCenter(): { lat: number; lng: number } {
  try {
    const last = getLastKnownPosition?.();
    if (last && typeof last.lat === "number" && typeof last.lng === "number") {
      return { lat: last.lat, lng: last.lng };
    }
  } catch {}
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("fixgo_last_position");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
          return { lat: parsed.lat, lng: parsed.lng };
        }
      }
    }
  } catch {}
  return SANTIAGO_FALLBACK;
}

/**
 * MapPrewarm — calienta el SDK de Google Maps nativo apenas la app arranca,
 * INCLUSO antes de que el usuario inicie sesión. ONE-SHOT por sesión.
 *
 * Estrategia multi-zoom:
 *  - Arranca en zoom 12 (vista ciudad completa) para cachear tiles de área grande.
 *  - A los 4s sube a zoom 14 (barrio).
 *  - A los 8s sube a zoom 16 (calle, máximo detalle).
 *  - Esto asegura que si el usuario abre la app sin internet, ya tiene tiles
 *    desde la ciudad entera hasta el nivel de calle, todo en su ciudad real.
 *
 * Los tiles se guardan en disco por el SDK y persisten entre sesiones.
 * El prewarm se destruye al terminar para no interferir con el mapa real.
 */
export function MapPrewarm() {
  const isNative = (() => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  })();

  const mountedRef = useRef(false);
  const [center, setCenter] = useState(() => readInitialCenter());
  const [zoom, setZoom] = useState(ZOOM_STEPS[0]);
  const [shouldMount, setShouldMount] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!isNative) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Si ya prewarmeamos en esta sesión, no volvemos a montar.
    try {
      if (sessionStorage.getItem(PREWARM_DONE_KEY) === "1") {
        setActive(false);
        return;
      }
    } catch {}

    // Montar el mapa fantasma inmediatamente.
    setTimeout(() => setShouldMount(true), 0);

    // Avanzar por cada nivel de zoom para cachear desde ciudad hasta calle.
    const zoomTimers: ReturnType<typeof setTimeout>[] = [];
    ZOOM_STEPS.forEach((z, i) => {
      if (i === 0) return; // el primer zoom ya es el estado inicial
      const t = setTimeout(() => setZoom(z), i * STEP_DURATION_MS);
      zoomTimers.push(t);
    });

    // Destruir el prewarm al terminar.
    const tEnd = setTimeout(() => {
      try { sessionStorage.setItem(PREWARM_DONE_KEY, "1"); } catch {}
      setActive(false);
    }, PREWARM_DURATION_MS);

    // Si el GPS reporta posición real, recentramos para cachear la ciudad
    // correcta del usuario (no el fallback de Santiago).
    const off = onGeolocationStatusChange?.(() => {
      const last = getLastKnownPosition?.();
      if (last && typeof last.lat === "number" && typeof last.lng === "number") {
        setCenter({ lat: last.lat, lng: last.lng });
      }
    });

    return () => {
      zoomTimers.forEach(clearTimeout);
      clearTimeout(tEnd);
      try { off?.(); } catch {}
    };
  }, [isNative]);

  if (!isNative || !active || !shouldMount) return null;

  return (
    <div
      aria-hidden
      data-fixxer-map-prewarm
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        opacity: 0,
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      <NativeMap
        center={center}
        zoom={zoom}
        markers={[]}
        circles={[]}
        prewarm
      />
    </div>
  );
}

export default MapPrewarm;
