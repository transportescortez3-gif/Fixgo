import { useRef, useCallback } from "react";
import { Autocomplete } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { useGoogleMapsLoaded } from "@/components/google-maps-provider";

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
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePlaceChanged = useCallback(() => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place?.formatted_address) {
        onChange(place.formatted_address);
      } else if (inputRef.current?.value) {
        onChange(inputRef.current.value);
      }
      if (onLatLng && place?.geometry?.location) {
        onLatLng(place.geometry.location.lat(), place.geometry.location.lng());
      }
    }
  }, [onChange, onLatLng]);

  if (!mapsLoaded) {
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <Autocomplete
      onLoad={(ac) => { autocompleteRef.current = ac; }}
      onPlaceChanged={handlePlaceChanged}
      options={{ types: ["address"] }}
    >
      <Input
        ref={inputRef}
        id={id}
        defaultValue={value}
        onBlur={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    </Autocomplete>
  );
}
