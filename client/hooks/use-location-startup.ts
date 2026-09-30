import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  resetGeolocationStatus,
  getGeolocationStatus,
  onGeolocationStatusChange,
  setGeolocationStatus,
} from "@/lib/geolocation";

/**
 * Hook que se ejecuta UNA sola vez al arrancar la app en plataforma nativa.
 *
 * Comportamiento igual a Google Maps / Uber:
 * 1. Solicita permiso de ubicación INMEDIATAMENTE al montar (sin esperar al
 *    usuario ni a que navegue al mapa).
 * 2. Si el permiso está concedido pero el GPS está APAGADO, abre los Ajustes
 *    de Ubicación del sistema AUTOMÁTICAMENTE (el usuario solo tiene que activar
 *    el toggle — no necesita buscar el ajuste manualmente).
 * 3. Cuando el usuario regresa a la app, reintenta automáticamente.
 *
 * Solo corre en Android/iOS (Capacitor nativo). En web es no-op.
 */
export function useLocationStartup() {
  const didRunRef = useRef(false);
  const openedSettingsRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    async function openGpsSettings() {
      if (openedSettingsRef.current) return;
      openedSettingsRef.current = true;
      try {
        const platform = Capacitor.getPlatform();
        const { AppLauncher } = await import("@capacitor/app-launcher");
        if (platform === "android") {
          // Abre directamente la pantalla de Ubicación del sistema Android
          await AppLauncher.openUrl({
            url: "intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end",
          });
        } else if (platform === "ios") {
          await AppLauncher.openUrl({ url: "App-Prefs:Privacy&path=LOCATION" });
        }
      } catch { /* noop */ }
    }

    async function checkAndRequestGps() {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");

        // PASO 1: Verificar / solicitar permiso (operación instantánea,
        // muestra el diálogo nativo si aún no se ha concedido).
        let perms = await Geolocation.checkPermissions();
        if (perms.location !== "granted") {
          try {
            const req = await Geolocation.requestPermissions({ permissions: ["location"] });
            if (req.location !== "granted") {
              setGeolocationStatus("denied");
              return;
            }
          } catch {
            setGeolocationStatus("denied");
            return;
          }
        }

        // PASO 2: Verificar si el servicio de GPS está ENCENDIDO usando un
        // timeout corto (4 s). Si falla = GPS apagado → abrir ajustes.
        // Usamos enableHighAccuracy:false para que Android no espere al chip
        // GPS y falle más rápido si el servicio de ubicación está apagado.
        try {
          await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 4000,
            maximumAge: 60000,
          });
          // GPS encendido. NO llamar setGeolocationStatus("granted") aquí:
          // useSmoothPosition / geolocation.ts manejan su propio estado cuando
          // watchPosition recibe el primer fix real. Si llamamos "granted" aquí
          // se reinicia el efecto de useSmoothPosition y se pierde el fix en vuelo.
          openedSettingsRef.current = false;
        } catch {
          // Check de 4s falló → posiblemente GPS apagado → abrir ajustes.
          // NO seteamos "service-off" en el status compartido: eso bloquearía
          // watchPosition en useSmoothPosition incluso si el GPS está encendido
          // pero tardó más de 4s en responder (arranque en frío).
          await openGpsSettings();
        }
      } catch { /* noop — evitar crash en edge cases */ }
    }

    // Sin delay: solicitar GPS inmediatamente al montar el componente,
    // igual que hace Google Maps al abrir la app.
    checkAndRequestGps();

    // Reintentar automáticamente cuando el usuario vuelve a la app
    // (por ejemplo, tras haber ido a los Ajustes a activar el GPS).
    let removeAppListener: (() => void) | null = null;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appStateChange", async (state) => {
        if (!state.isActive) return;
        const currentStatus = getGeolocationStatus();
        // Reintentar si el GPS estaba apagado o si el permiso no estaba dado
        if (
          currentStatus === "service-off" ||
          currentStatus === "denied" ||
          currentStatus === "unknown"
        ) {
          resetGeolocationStatus();
          openedSettingsRef.current = false;
          await checkAndRequestGps();
        } else if (currentStatus === "granted") {
          // GPS ya estaba activo; simplemente resetear el flag de ajustes
          openedSettingsRef.current = false;
        }
      }).then((handle) => {
        removeAppListener = () => handle.remove();
      });
    });

    // Escuchar cambios de status en tiempo real (p.ej. si el usuario apaga
    // el GPS mientras usa la app → abrir ajustes automáticamente).
    const unsubStatus = onGeolocationStatusChange(async (s) => {
      if (s === "service-off" && !openedSettingsRef.current) {
        await openGpsSettings();
      }
    });

    return () => {
      removeAppListener?.();
      unsubStatus();
    };
  }, []);
}
