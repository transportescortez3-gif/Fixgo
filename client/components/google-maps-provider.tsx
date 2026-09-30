import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

declare const __GOOGLE_MAPS_KEY__: string;

const FALLBACK_MAPS_KEY = "AIzaSyBLqGtCFZG3-cl9oILRHE-1QOJATX-gm-4";

interface GoogleMapsContextValue {
  loaded: boolean;
  error: string | null;
}

const GoogleMapsContext = createContext<GoogleMapsContextValue>({ loaded: false, error: null });

export function useGoogleMapsLoaded() {
  return useContext(GoogleMapsContext).loaded;
}

export function useGoogleMapsError() {
  return useContext(GoogleMapsContext).error;
}

const LIBRARIES: ("places")[] = ["places"];

function MapsLoader({ apiKey, children }: { apiKey: string; children: ReactNode }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  useEffect(() => {
    if (loadError) {
      console.error("[GoogleMaps] Error al cargar Maps API:", loadError.message ?? loadError);
    }
  }, [loadError]);

  const errorMsg = loadError
    ? `Error al cargar Google Maps: ${loadError.message ?? "clave inválida o sin acceso"}`
    : null;

  return (
    <GoogleMapsContext.Provider value={{ loaded: isLoaded && !loadError, error: errorMsg }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const buildTimeKey = typeof __GOOGLE_MAPS_KEY__ !== "undefined" ? __GOOGLE_MAPS_KEY__ : "";
  const resolvedKey = buildTimeKey || FALLBACK_MAPS_KEY;
  const [apiKey] = useState(resolvedKey);

  if (!apiKey) {
    return (
      <GoogleMapsContext.Provider value={{ loaded: false, error: "No hay clave de API configurada" }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <MapsLoader apiKey={apiKey}>{children}</MapsLoader>;
}
