import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, Clock } from "lucide-react";

interface WorkerRouteMapProps {
  serviceLat: number;
  serviceLng: number;
  className?: string;
}

const serviceIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width:42px;height:42px;
    background:hsl(221 83% 53%);
    border:3px solid #fff;
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 3px 10px rgba(0,0,0,0.5);
    font-size:20px;
  ">🏠</div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 42],
  popupAnchor: [0, -42],
});

const workerIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width:38px;height:38px;
    background:#1a1a1a;
    border:3px solid hsl(221 83% 53%);
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 3px 10px rgba(0,0,0,0.5);
    font-size:18px;
  ">🔧</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 38],
  popupAnchor: [0, -38],
});

export default function WorkerRouteMap({ serviceLat, serviceLng, className }: WorkerRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [workerPos, setWorkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distKm: number; etaMin: number } | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWorkerPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      () => { setGpsError(true); setLoading(false); },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); }

    const centerLat = workerPos ? (workerPos.lat + serviceLat) / 2 : serviceLat;
    const centerLng = workerPos ? (workerPos.lng + serviceLng) / 2 : serviceLng;

    const map = L.map(mapRef.current, {
      center: [centerLat, centerLng],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.marker([serviceLat, serviceLng], { icon: serviceIcon })
      .addTo(map)
      .bindPopup("<b>Ubicación del cliente</b>");

    if (workerPos) {
      L.marker([workerPos.lat, workerPos.lng], { icon: workerIcon })
        .addTo(map)
        .bindPopup("<b>Tu ubicación</b>");

      const bounds = L.latLngBounds(
        [workerPos.lat, workerPos.lng],
        [serviceLat, serviceLng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

      const tempLine = L.polyline(
        [[workerPos.lat, workerPos.lng], [serviceLat, serviceLng]],
        {
          color: "hsl(45,96%,53%)",
          weight: 3,
          opacity: 0.55,
          dashArray: "6 8",
        }
      ).addTo(map);

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${workerPos.lng},${workerPos.lat};${serviceLng},${serviceLat}?overview=full&geometries=geojson`;

      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 6000);

      fetch(osrmUrl, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => {
          clearTimeout(timeoutId);
          if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            const distKm = +(route.distance / 1000).toFixed(1);
            const etaMin = Math.ceil(route.duration / 60);
            setRouteInfo({ distKm, etaMin });

            map.removeLayer(tempLine);

            L.geoJSON(route.geometry, {
              style: {
                color: "hsl(45, 96%, 53%)",
                weight: 4,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
              },
            }).addTo(map);

            const routeBounds = L.latLngBounds(
              route.geometry.coordinates.map((c: number[]) => [c[1], c[0]])
            );
            map.fitBounds(routeBounds, { padding: [55, 55], maxZoom: 15 });
          }
        })
        .catch(() => {
          clearTimeout(timeoutId);
        });
    }

    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [workerPos, serviceLat, serviceLng]);

  return (
    <div className="relative" style={{ isolation: "isolate" }}>
      {(loading || (!workerPos && !gpsError)) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80 rounded-xl">
          <p className="text-xs text-muted-foreground animate-pulse">Obteniendo tu ubicación...</p>
        </div>
      )}

      <div ref={mapRef} className={className} style={{ width: "100%", minHeight: "260px" }} />

      {routeInfo && (
        <div className="absolute top-2 left-2 z-[400] bg-card/95 backdrop-blur border border-primary/40 rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
          <div className="flex items-center gap-1.5 text-primary">
            <Navigation className="w-4 h-4" />
            <span className="text-sm font-black">{routeInfo.distKm} km</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5 text-foreground">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-bold">~{routeInfo.etaMin} min</span>
          </div>
        </div>
      )}

      {gpsError && (
        <div className="absolute top-2 left-2 z-[400] bg-destructive/20 border border-destructive/40 rounded-xl px-3 py-1.5">
          <p className="text-[11px] text-destructive font-medium">Sin acceso a GPS</p>
        </div>
      )}
    </div>
  );
}
