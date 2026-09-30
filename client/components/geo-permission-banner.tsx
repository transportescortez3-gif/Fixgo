import { useEffect } from "react";
import { MapPinOff, RefreshCw, Settings } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { type GeoStatus, resetGeolocationStatus, getCurrentPosition, setGeolocationStatus } from "@/lib/geolocation";

interface Props {
  status: GeoStatus;
  className?: string;
}

async function openGpsSettings() {
  const platform = Capacitor.getPlatform();
  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    if (platform === "android") {
      await AppLauncher.openUrl({
        url: "intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end",
      });
    } else if (platform === "ios") {
      await AppLauncher.openUrl({ url: "App-Prefs:Privacy&path=LOCATION" });
    }
  } catch { /* noop */ }
}

async function openAppSettings() {
  const platform = Capacitor.getPlatform();
  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    if (platform === "android") {
      const pkg = (window as any).Capacitor?.getServerUrl
        ? "com.fixxer.app"
        : "com.fixxer.app";
      await AppLauncher.openUrl({
        url: `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${pkg};end`,
      });
    } else if (platform === "ios") {
      await AppLauncher.openUrl({ url: "app-settings:" });
    }
  } catch { /* noop */ }
}

/**
 * Banner que aparece sobre el mapa cuando la ubicación está denegada o el
 * servicio del SO está apagado.
 *
 * - "denied" en Android/iOS: primero intenta requestPermissions() para mostrar
 *   el diálogo nativo. Si el SO bloquea el diálogo (permiso denegado permanente),
 *   abre los Ajustes de la app para que el usuario lo active manualmente.
 * - "service-off" en Android/iOS: abre la pantalla de GPS del sistema para que
 *   el usuario encienda el servicio de ubicación.
 * - Web: botón "Reintentar" que llama getCurrentPosition de nuevo.
 *
 * Cuando el usuario vuelve a la app (appStateChange), reintenta automáticamente.
 */
export function GeoPermissionBanner({ status, className }: Props) {
  if (status !== "denied" && status !== "service-off" && status !== "unavailable") return null;

  const isNative = Capacitor.isNativePlatform();

  const titles: Record<string, string> = {
    "denied": "Permiso de ubicación denegado",
    "service-off": "GPS apagado",
    "unavailable": "Ubicación no disponible",
  };

  const descs: Record<string, string> = {
    "denied": isNative
      ? "Fixgo necesita acceder a tu ubicación para funcionar."
      : "Activa los permisos en tu navegador para ver tu posición.",
    "service-off": isNative
      ? "Activa el GPS del teléfono para usar el mapa."
      : "Enciende el GPS de tu dispositivo para usar el mapa.",
    "unavailable": "Tu dispositivo no soporta geolocalización.",
  };

  const handleDenied = async () => {
    if (!isNative) {
      resetGeolocationStatus();
      try { await getCurrentPosition(); } catch { }
      return;
    }
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const req = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (req.location === "granted") {
        resetGeolocationStatus();
        try { await getCurrentPosition(); } catch { }
      } else {
        await openAppSettings();
      }
    } catch {
      await openAppSettings();
    }
  };

  const handleServiceOff = async () => {
    await openGpsSettings();
  };

  const handleRetry = async () => {
    resetGeolocationStatus();
    try { await getCurrentPosition(); } catch { }
  };

  useEffect(() => {
    if (!isNative) return;
    if (status !== "service-off" && status !== "denied") return;
    let unlisten: (() => void) | null = null;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appStateChange", async (state) => {
        if (!state.isActive) return;
        resetGeolocationStatus();
        try { await getCurrentPosition(); } catch { }
      }).then((handle) => {
        unlisten = () => handle.remove();
      });
    });
    return () => { unlisten?.(); };
  }, [status, isNative]);

  useEffect(() => {
    if (isNative) return;
    if (status !== "denied" && status !== "service-off") return;
    if (!navigator.permissions) return;
    let ps: PermissionStatus | null = null;
    navigator.permissions.query({ name: "geolocation" as PermissionName }).then((p) => {
      ps = p;
      p.onchange = () => {
        if (p.state === "granted") {
          resetGeolocationStatus();
          getCurrentPosition().catch(() => {});
        }
      };
    }).catch(() => {});
    return () => { if (ps) ps.onchange = null; };
  }, [status, isNative]);

  if (isNative && status === "denied") {
    return (
      <div className={`mx-auto max-w-[340px] bg-primary rounded-xl px-3 py-2.5 shadow-lg border border-primary/70 flex items-center gap-2 ${className || ""}`}>
        <MapPinOff className="w-4 h-4 text-white shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white leading-tight">{titles[status]}</p>
          <p className="text-[10px] text-white/90 leading-tight mt-0.5">{descs[status]}</p>
        </div>
        <button
          onClick={handleDenied}
          className="shrink-0 bg-white text-primary font-bold text-[10px] px-2 py-1 rounded-full flex items-center gap-1 active:scale-95"
        >
          <RefreshCw className="w-3 h-3" />
          Activar
        </button>
      </div>
    );
  }

  if (isNative && status === "service-off") {
    return (
      <div className={`mx-auto max-w-[340px] bg-primary rounded-xl px-3 py-2.5 shadow-lg border border-primary/70 flex items-center gap-2 ${className || ""}`}>
        <MapPinOff className="w-4 h-4 text-white shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white leading-tight">{titles[status]}</p>
          <p className="text-[10px] text-white/90 leading-tight mt-0.5">{descs[status]}</p>
        </div>
        <button
          onClick={handleServiceOff}
          className="shrink-0 bg-white text-primary font-bold text-[10px] px-2 py-1 rounded-full flex items-center gap-1 active:scale-95"
        >
          <Settings className="w-3 h-3" />
          Abrir GPS
        </button>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-[340px] bg-primary rounded-xl px-3 py-2.5 shadow-lg border border-primary/70 flex items-center gap-2 ${className || ""}`}>
      <MapPinOff className="w-4 h-4 text-white shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white leading-tight">{titles[status]}</p>
        <p className="text-[10px] text-white/90 leading-tight mt-0.5">{descs[status]}</p>
      </div>
      <button
        onClick={status === "denied" ? handleDenied : handleRetry}
        className="shrink-0 bg-white text-primary font-bold text-[10px] px-2 py-1 rounded-full flex items-center gap-1 active:scale-95"
      >
        <RefreshCw className="w-3 h-3" />
        Reintentar
      </button>
    </div>
  );
}
