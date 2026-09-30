import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface NearbyWorker {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  totalReviews: number;
  isAvailable: boolean;
  distanceKm?: number | null;
}

interface ServiceLocationMapProps {
  serviceLat: number;
  serviceLng: number;
  workers?: NearbyWorker[];
  onWorkerClick?: (workerId: number) => void;
  className?: string;
}

const serviceIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width: 40px; height: 40px;
    background: hsl(221 83% 53%);
    border: 3px solid #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 18px;
  ">📍</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

const workerAvailableIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width: 34px; height: 34px;
    background: #1a1a1a;
    border: 3px solid hsl(221 83% 53%);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 15px;
  ">🔧</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -34],
});

export default function ServiceLocationMap({
  serviceLat,
  serviceLng,
  workers = [],
  onWorkerClick,
  className,
}: ServiceLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current, {
      center: [serviceLat, serviceLng],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OSM &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.marker([serviceLat, serviceLng], { icon: serviceIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>Ubicación del servicio</strong></div>`);

    const bounds = L.latLngBounds([[serviceLat, serviceLng]]);

    workers.forEach((worker) => {
      if (worker.lat == null || worker.lng == null) return;
      const stars = worker.rating ? "⭐ " + worker.rating.toFixed(1) : "Nuevo";
      const dist = worker.distanceKm != null ? `${worker.distanceKm.toFixed(1)} km` : "";

      const marker = L.marker([worker.lat, worker.lng], { icon: workerAvailableIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui;min-width:140px;padding:4px;">
            <strong style="font-size:13px;">${worker.name}</strong><br/>
            <span style="font-size:11px;color:#999;">${stars}</span>
            ${dist ? `<br/><span style="font-size:11px;color:#aaa;">📍 A ${dist}</span>` : ""}
            <div style="margin-top:6px;font-size:11px;color:#22c55e;font-weight:600;">● Disponible</div>
          </div>
        `);

      if (onWorkerClick) {
        marker.on("click", () => onWorkerClick(worker.id));
      }

      bounds.extend([worker.lat, worker.lng]);
    });

    if (workers.some((w) => w.lat != null)) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [serviceLat, serviceLng, workers.length]);

  return (
    <div style={{ isolation: "isolate" }}>
      <div
        ref={mapRef}
        className={className}
        style={{ width: "100%", minHeight: "260px" }}
      />
    </div>
  );
}
