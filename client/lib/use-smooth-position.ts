import { useEffect, useRef, useState } from "react";
import { watchPosition, getLastKnownPosition, getCurrentPosition, getGeolocationStatus, getIpLocation, onGeolocationStatusChange, type GeoPosition } from "./geolocation";

/**
 * Hook que devuelve la ubicación del usuario a partir de los fixes reales del GPS.
 *
 * Retorna:
 *  - `lat`, `lng`, `accuracy` — posición actual (caché/fallback hasta que llegue GPS real)
 *  - `ready` — siempre true (el mapa se muestra inmediatamente)
 *  - `hasRealFix` — true SOLO cuando llegó al menos un fix GPS real del dispositivo.
 *    Mientras sea false la posición es el caché/fallback y el dot del usuario
 *    NO debe mostrarse en el mapa (evita "ubicación random").
 */
export function useSmoothPosition(initial?: { lat: number; lng: number }) {
  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };
  const last = getLastKnownPosition();

  const start = last
    ? { lat: last.lat, lng: last.lng, accuracy: last.accuracy, ready: true }
    : initial
    ? { lat: initial.lat, lng: initial.lng, accuracy: undefined as number | undefined, ready: true }
    : { lat: SANTIAGO.lat, lng: SANTIAGO.lng, accuracy: undefined as number | undefined, ready: true };

  const [position, setPosition] = useState(start);
  const [hasRealFix, setHasRealFix] = useState(false);

  const lastEmittedRef = useRef(start);
  const hasRealFixRef = useRef(false);

  const [statusGen, setStatusGen] = useState(getGeolocationStatus());
  useEffect(() => onGeolocationStatusChange((s) => setStatusGen(s)), []);

  // 29-may-2026: dependemos de un booleano "blocked" en vez del status crudo.
  // Antes el efecto se reiniciaba en CADA cambio de status — incluido el
  // unknown→granted que ocurre cuando llega el primer fix. Ese reinicio limpiaba
  // el watch y reseteaba hasRealFix en pleno arranque, produciendo parpadeo del
  // dot y, peor, perdiendo el primer fix en vuelo. Ahora el efecto SOLO se
  // reinicia al cruzar la frontera "bloqueado" (denied/service-off/unavailable),
  // que es el único caso en que realmente hay que detener o reanudar el GPS.
  const blocked =
    statusGen === "denied" || statusGen === "service-off" || statusGen === "unavailable";

  // 15-jun-2026: resetear hasRealFix SOLO cuando el estado pasa a bloqueado.
  // Antes el cleanup del effect GPS siempre reseteaba hasRealFix, lo que
  // causaba que cualquier fluctuación temporal de status (ej. "unavailable"
  // por un error puntual del SO) perdiera el fix para siempre — el effect
  // se reiniciaba con blocked=true y no volvía a pedir GPS. Ahora el reset
  // ocurre únicamente en el trayecto false→true de "blocked".
  useEffect(() => {
    if (blocked) {
      hasRealFixRef.current = false;
      setHasRealFix(false);
    }
  }, [blocked]);

  useEffect(() => {
    if (blocked) return;

    let cancelledQuick = false;

    const emit = (pos: GeoPosition) => {
      const next = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, ready: true };
      lastEmittedRef.current = next;
      if (!hasRealFixRef.current) {
        hasRealFixRef.current = true;
        setHasRealFix(true);
      }
      setPosition(next);
    };

    console.log("[GPS] Iniciando GPS. cachedStatus actual:", getGeolocationStatus());

    // Intento inmediato de IP fallback si el GPS falla (no esperar 8s).
    // ipRetryCount controla cuántas veces se ha intentado; cada 3 retries del
    // timer se vuelve a probar la IP (por si el servidor estaba temporalmente caído).
    let ipRetryCount = 0;

    function tryIpFallback(reason: string) {
      if (cancelledQuick || hasRealFixRef.current) return;
      console.log(`[GPS] Intentando IP geolocation como fallback (${reason})…`);
      getIpLocation()
        .then((pos) => {
          console.log("[GPS] IP geolocation OK →", pos.lat.toFixed(5), pos.lng.toFixed(5), "acc:", pos.accuracy);
          if (cancelledQuick || hasRealFixRef.current) return;
          emit(pos);
        })
        .catch((e) => { console.warn("[GPS] IP geolocation falló →", e?.message); });
    }

    getCurrentPosition()
      .then((pos) => {
        console.log("[GPS] getCurrentPosition OK →", pos.lat.toFixed(5), pos.lng.toFixed(5), "acc:", pos.accuracy, "cancelledQuick:", cancelledQuick, "hasRealFix:", hasRealFixRef.current);
        if (cancelledQuick || hasRealFixRef.current) return;
        emit(pos);
      })
      .catch((err) => {
        console.warn("[GPS] getCurrentPosition FALLÓ →", err?.code, err?.message);
        // Fallback inmediato por IP cuando el GPS falla desde el primer intento
        tryIpFallback("primer fallo GPS");
      });

    // Timer de reintento cada 8 s mientras no haya fix GPS real.
    // Sigue intentando getCurrentPosition por si el usuario acepta el permiso
    // del browser después del primer timeout. Cada 3 fallos reinvoca el
    // fallback por IP (por si la primera vez también falló).
    const retryTimer = setInterval(() => {
      if (hasRealFixRef.current || cancelledQuick) return;
      console.log("[GPS] Reintentando getCurrentPosition (timer 8s)…");
      getCurrentPosition()
        .then((pos) => {
          console.log("[GPS] Retry OK →", pos.lat.toFixed(5), pos.lng.toFixed(5));
          if (cancelledQuick || hasRealFixRef.current) return;
          emit(pos);
        })
        .catch((err) => {
          console.warn("[GPS] Retry falló →", err?.code, err?.message);
          ipRetryCount += 1;
          // Reintentar IP cada 3 fallos consecutivos del GPS (por si el servidor
          // tenía un fallo temporal o el caché de IP expiró)
          if (ipRetryCount % 3 === 0) {
            tryIpFallback(`retry #${ipRetryCount}`);
          }
        });
    }, 8000);

    const stop = watchPosition(
      (pos) => {
        console.log("[GPS] watchPosition tick →", pos.lat.toFixed(5), pos.lng.toFixed(5), "acc:", pos.accuracy);
        const prev = lastEmittedRef.current;

        if (!hasRealFixRef.current) {
          emit(pos);
          return;
        }

        const R = 6371000;
        const dLat = ((pos.lat - prev.lat) * Math.PI) / 180;
        const dLng = ((pos.lng - prev.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((prev.lat * Math.PI) / 180) *
            Math.cos((pos.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const noiseThreshold = Math.max(5, (pos.accuracy ?? 20) * 0.5);
        // 15-jun-2026: reducido el umbral de accuracy de 5m → 2m.
        // Con 5m, mejoras lentas de GPS (ej. 50m→48m entre ticks) no pasaban
        // el filtro cuando el usuario está quieto, dejando el círculo de
        // precisión "congelado" en la accuracy inicial de red. Con 2m,
        // cualquier mejora mayor que el ruido del sensor se emite.
        const accDelta = Math.abs((pos.accuracy ?? 0) - (prev.accuracy ?? 0));
        if (distM < noiseThreshold && accDelta < 2) return;

        const prevAcc = prev.accuracy ?? pos.accuracy ?? 20;
        if (pos.accuracy && pos.accuracy > prevAcc * 5 && distM < 30) return;

        emit(pos);
      },
      () => { /* ignorar errores, ya hay fallbacks */ }
    );

    return () => {
      cancelledQuick = true;
      clearInterval(retryTimer);
      stop();
      // 15-jun-2026: NO resetear hasRealFix aquí. El cleanup solo detiene el
      // watch GPS. El reset de hasRealFix lo maneja el effect de "blocked" de
      // arriba, que se activa únicamente cuando el permiso es denegado/apagado.
      // Antes este cleanup siempre reseteaba hasRealFix, causando que cualquier
      // re-ejecución del effect (incluso por fluctuaciones transitorias de
      // status) perdiera el fix real adquirido.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  return { ...position, hasRealFix };
}
