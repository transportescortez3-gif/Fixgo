import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation } from "lucide-react";

interface Worker {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  totalReviews: number;
  isAvailable: boolean;
  skills?: string | null;
  distanceKm?: number | null;
  category?: { icon?: string | null; name?: string } | null;
}

interface WorkersMapProps {
  workers: Worker[];
  userLat: number;
  userLng: number;
  onWorkerClick?: (workerId: number) => void;
  className?: string;
}

const userIcon = L.divIcon({
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
    width: 36px; height: 36px;
    background: #1a1a1a;
    border: 3px solid hsl(221 83% 53%);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 16px;
  ">🔧</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const workerBusyIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width: 36px; height: 36px;
    background: #1a1a1a;
    border: 3px solid #666;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-size: 16px;
    opacity: 0.7;
  ">🔧</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

export default function WorkersMap({ workers, userLat, userLng, onWorkerClick, className }: WorkersMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const handleRecenter = useCallback(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([userLat, userLng], 13, { animate: true });
    }
  }, [userLat, userLng]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current, {
      center: [userLat, userLng],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.marker([userLat, userLng], { icon: userIcon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family: system-ui; text-align: center; padding: 4px;">
          <strong style="font-size: 14px;">Tu ubicación</strong>
        </div>
      `);

    const bounds = L.latLngBounds([[userLat, userLng]]);

    workers.forEach((worker) => {
      if (worker.lat === null || worker.lng === null) return;

      const profIcon = worker.category?.icon;
      const borderColor = worker.isAvailable ? "hsl(221 83% 53%)" : "#666";
      const opacity = worker.isAvailable ? "1" : "0.7";
      const icon = profIcon
        ? L.divIcon({
            className: "custom-marker",
            html: `<div style="
              width: 36px; height: 36px;
              background: #1a1a1a;
              border: 3px solid ${borderColor};
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              font-size: 18px;
              opacity: ${opacity};
              line-height: 1;
            ">${profIcon}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 36],
            popupAnchor: [0, -36],
          })
        : worker.isAvailable ? workerAvailableIcon : workerBusyIcon;
      const stars = worker.rating ? "⭐ " + worker.rating.toFixed(1) : "Nuevo";
      const dist = worker.distanceKm != null ? `${worker.distanceKm.toFixed(1)} km` : "";
      const skills = worker.skills
        ? worker.skills.split(",").slice(0, 2).map(s => s.trim()).join(", ")
        : "";

      const marker = L.marker([worker.lat, worker.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: system-ui; min-width: 160px; padding: 4px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <div style="
                width: 32px; height: 32px;
                background: hsl(221 83% 53% / 0.15);
                color: hsl(221 83% 53%);
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: bold; font-size: 13px;
              ">${worker.name.substring(0, 2).toUpperCase()}</div>
              <div>
                <strong style="font-size: 13px; display: block;">${worker.name}</strong>
                <span style="font-size: 11px; color: #999;">${stars} (${worker.totalReviews})</span>
              </div>
            </div>
            ${dist ? `<div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">📍 A ${dist}</div>` : ""}
            ${skills ? `<div style="font-size: 11px; color: #ccc;">${skills}</div>` : ""}
            <div style="
              margin-top: 8px;
              padding: 4px 0;
              text-align: center;
              font-size: 11px;
              font-weight: 600;
              color: ${worker.isAvailable ? "#22c55e" : "#999"};
            ">${worker.isAvailable ? "● Disponible" : "● Ocupado"}</div>
          </div>
        `);

      if (onWorkerClick) {
        marker.on("click", () => onWorkerClick(worker.id));
      }

      bounds.extend([worker.lat, worker.lng]);
    });

    if (workers.some(w => w.lat !== null && w.lng !== null)) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [workers, userLat, userLng]);

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "300px" }}>
      <div
        ref={mapRef}
        className={className}
        style={{ width: "100%", height: "100%", minHeight: "300px" }}
      />
      <button
        onClick={handleRecenter}
        style={{
          position: "absolute", bottom: 56, right: 10, zIndex: 1000,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(26,26,26,0.85)", border: "1.5px solid rgba(234,179,8,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)", cursor: "pointer", backdropFilter: "blur(6px)",
        }}
        title="Volver a mi ubicación"
      >
        <Navigation style={{ width: 16, height: 16, color: "#2563EB" }} />
      </button>
    </div>
  );
}
