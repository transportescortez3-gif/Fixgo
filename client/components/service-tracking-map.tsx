import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface ServiceTrackingMapProps {
  serviceLat: number;
  serviceLng: number;
  workerLat?: number | null;
  workerLng?: number | null;
  workerName?: string;
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

const workerIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width: 40px; height: 40px;
    background: #22c55e;
    border: 3px solid #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    font-size: 18px;
    animation: pulse-green 2s infinite;
  ">🔧</div>
  <style>
    @keyframes pulse-green {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
      50% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
    }
  </style>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

export default function ServiceTrackingMap({
  serviceLat,
  serviceLng,
  workerLat,
  workerLng,
  workerName = "Profesional",
  className,
}: ServiceTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const workerMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current, {
      center: [serviceLat, serviceLng],
      zoom: 14,
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

    if (workerLat != null && workerLng != null) {
      const wm = L.marker([workerLat, workerLng], { icon: workerIcon })
        .addTo(map)
        .bindPopup(`<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>${workerName}</strong><br/><span style="color:#22c55e;font-size:11px;">● En camino</span></div>`);
      workerMarkerRef.current = wm;

      const bounds = L.latLngBounds([[serviceLat, serviceLng], [workerLat, workerLng]]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      workerMarkerRef.current = null;
    };
  }, [serviceLat, serviceLng]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (workerLat == null || workerLng == null) return;

    if (workerMarkerRef.current) {
      workerMarkerRef.current.setLatLng([workerLat, workerLng]);
    } else {
      const wm = L.marker([workerLat, workerLng], { icon: workerIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>${workerName}</strong><br/><span style="color:#22c55e;font-size:11px;">● En camino</span></div>`);
      workerMarkerRef.current = wm;
    }
  }, [workerLat, workerLng, workerName]);

  return (
    <div style={{ isolation: "isolate" }}>
      <div
        ref={mapRef}
        className={className}
        style={{ width: "100%", minHeight: "280px" }}
      />
    </div>
  );
}
