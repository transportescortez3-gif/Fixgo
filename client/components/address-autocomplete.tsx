import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useGoogleMapsLoaded } from "@/components/google-maps-provider";
import { bindPlacesAddressElement, type PlacesAddressElement } from "@/lib/places-autocomplete";
import "./address-autocomplete.css";

interface AddressAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onLatLng?: (lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  onLatLng,
  placeholder,
  className,
}: AddressAutocompleteProps) {
  const mapsLoaded = useGoogleMapsLoaded();
  const hostRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<PlacesAddressElement | null>(null);
  const latest = useRef({ value, onChange, onLatLng, placeholder, id });
  latest.current = { value, onChange, onLatLng, placeholder, id };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mapsLoaded || failed) return;
    let cancelled = false;
    let unbind: (() => void) | undefined;
    let widget: PlacesAddressElement | undefined;
    void (async () => {
      try {
        const library = await google.maps.importLibrary("places");
        if (cancelled || !hostRef.current) return;
        const { PlaceAutocompleteElement } = library as unknown as {
          PlaceAutocompleteElement: new (options: {
            requestedLanguage: string;
          }) => PlacesAddressElement;
        };
        widget = new PlaceAutocompleteElement({ requestedLanguage: "es" });
        widget.value = latest.current.value;
        widget.placeholder = latest.current.placeholder ?? "";
        widget.id = latest.current.id ?? "";
        widget.setAttribute("aria-label", latest.current.placeholder ?? "Dirección del servicio");
        widget.className = "places-address-widget";
        unbind = bindPlacesAddressElement(widget, {
          onChange: (address) => latest.current.onChange(address),
          onLatLng: (lat, lng) => latest.current.onLatLng?.(lat, lng),
          onError: () => setFailed(true),
        });
        elementRef.current = widget;
        hostRef.current.replaceChildren(widget);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      unbind?.();
      widget?.remove();
      elementRef.current = null;
    };
  }, [mapsLoaded, failed]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (element.value !== value) element.value = value;
    element.placeholder = placeholder ?? "";
    element.id = id ?? "";
    element.setAttribute("aria-label", placeholder ?? "Dirección del servicio");
  }, [value, placeholder, id]);

  const showWidget = mapsLoaded && ready && !failed;
  return (
    <div className="places-address">
      <div ref={hostRef} hidden={!showWidget} />
      {!showWidget && (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
      {failed && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          No se pudieron cargar las sugerencias. Puedes escribir la dirección completa.
        </p>
      )}
    </div>
  );
}
