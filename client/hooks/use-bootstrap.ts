import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListCategoriesQueryKey, getGetSiteSettingsQueryKey } from "@/api";
import { Capacitor } from "@capacitor/core";
import { getCurrentPosition } from "@/lib/geolocation";
import { APP_URL } from "@/lib/app-config";

// Flag para no lanzar el getCurrentPosition de startup mas de una vez.
let globalGeoPrefetchStarted = false;

function prefetchPosition() {
  if (globalGeoPrefetchStarted) return;
  globalGeoPrefetchStarted = true;
  // Solo pedimos un fix inicial para que getLastKnownPosition() tenga datos
  // frescos cuando el mapa se monte. El watchPosition continuo lo maneja
  // useSmoothPosition (que corre dentro del componente del mapa). Arrancar
  // dos watchPosition en paralelo provocaba una carrera de checkPermissions/
  // requestPermissions que podía resultar en un falso "denied" al arrancar.
  getCurrentPosition().catch(() => { /* errores manejados por GeoPermissionBanner */ });
}

/**
 * Carga categorías + configuración del sitio en UNA sola llamada al servidor.
 * Siembra la caché de React Query para que useListCategories() y
 * useGetSiteSettings() no necesiten hacer peticiones adicionales.
 *
 * Beneficio: reduce 2 llamadas de startup a 1, y Cloudflare cachea el
 * resultado en nodos de Sudamérica (Cache-Control: s-maxage=300).
 *
 * 28-abr-2026: ademas en nativo hace un getCurrentPosition anticipado para
 * que getLastKnownPosition() tenga datos frescos cuando el mapa se monte.
 * 1-may-2026: se eliminó el watchPosition del bootstrap — causaba una carrera
 * de requestPermissions con useSmoothPosition y Android devolvía "denied"
 * falsamente, bloqueando el mapa en el placeholder indefinidamente.
 */
export function useBootstrap() {
  const queryClient = useQueryClient();
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    // En nativo, pedir un fix inicial YA (abre el dialog de permiso del SO
    // si todavia no se ha otorgado). Solo UN fetch — el watch continuo lo
    // inicia useSmoothPosition cuando el mapa se monta.
    if (Capacitor.isNativePlatform()) {
      prefetchPosition();
    }

    // Si ya tenemos datos en caché (hot reload, navegación SPA), no refetch
    const hasCategories = queryClient.getQueryData(getListCategoriesQueryKey());
    const hasSettings = queryClient.getQueryData(getGetSiteSettingsQueryKey());
    if (hasCategories && hasSettings) return;

    const base = Capacitor.isNativePlatform() ? APP_URL : "";
    fetch(`${base}/api/bootstrap`)
      .then((r) => r.json())
      .then(({ categories, siteSettings }) => {
        if (categories && !hasCategories) {
          queryClient.setQueryData(getListCategoriesQueryKey(), categories);
        }
        if (siteSettings && !hasSettings) {
          queryClient.setQueryData(getGetSiteSettingsQueryKey(), siteSettings);
        }
      })
      .catch(() => {
        // Fallo silencioso: useListCategories y useGetSiteSettings
        // harán sus llamadas individuales como fallback automático
      });
  }, [queryClient]);
}
