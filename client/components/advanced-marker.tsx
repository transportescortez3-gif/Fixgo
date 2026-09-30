import { useEffect, useRef } from "react";
import { OverlayView } from "@react-google-maps/api";

interface AdvancedMarkerProps {
  map?: google.maps.Map | null;
  position: google.maps.LatLngLiteral;
  zIndex?: number;
  clickable?: boolean;
  onClick?: () => void;
  content: () => HTMLElement;
}

export function AdvancedMarker({ position, zIndex, clickable = true, onClick, content }: AdvancedMarkerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (containerRef.current && !contentElRef.current) {
      contentElRef.current = content();
      containerRef.current.appendChild(contentElRef.current);
    }
  }, []);

  return (
    <OverlayView
      position={position}
      mapPaneName={clickable && onClick ? OverlayView.OVERLAY_MOUSE_TARGET : OverlayView.OVERLAY_LAYER}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          zIndex,
          cursor: clickable && onClick ? "pointer" : "default",
          transform: "translate(-50%, -50%)",
        }}
        onClick={onClick}
      />
    </OverlayView>
  );
}

export function createCircleEl(opts: {
  size: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
}): HTMLElement {
  const total = opts.size + opts.strokeWeight * 2;
  const el = document.createElement("div");
  el.style.cssText = `
    width:${total}px;height:${total}px;border-radius:50%;
    background:${opts.fillColor};opacity:${opts.fillOpacity};
    border:${opts.strokeWeight}px solid ${opts.strokeColor};
    box-sizing:border-box;pointer-events:none;
  `;
  return el;
}

export function createSvgMarkerEl(svgUrl: string, width: number, height: number): HTMLElement {
  const img = document.createElement("img");
  img.src = svgUrl;
  img.width = width;
  img.height = height;
  img.style.display = "block";
  return img;
}
