// The installed Google typings predate the stable Places (New) widget.
// Keep this boundary aligned with the current public widget API, not legacy events.
export interface PlacesAddressElement extends HTMLElement {
  value: string;
  placeholder: string;
}

interface SelectedPlace {
  formattedAddress?: string | null;
  location?: { lat(): number; lng(): number } | null;
  fetchFields(options: { fields: string[] }): Promise<unknown>;
}

interface PredictionSelection extends Event {
  placePrediction: { toPlace(): SelectedPlace };
}

export interface AddressCallbacks {
  onChange(value: string): void;
  onLatLng?(lat: number, lng: number): void;
  onError(): void;
}

export function bindPlacesAddressElement(
  element: PlacesAddressElement,
  callbacks: AddressCallbacks,
) {
  let disposed = false;
  let revision = 0;
  const onInput = () => {
    revision++;
    callbacks.onChange(element.value);
  };
  const onSelect = async (event: Event) => {
    const currentRevision = ++revision;
    try {
      const place = (event as PredictionSelection).placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      // Ignore a result after unmount, further typing, or a newer selection.
      if (disposed || currentRevision !== revision) return;
      const address = place.formattedAddress || element.value;
      element.value = address;
      callbacks.onChange(address);
      if (place.location) callbacks.onLatLng?.(place.location.lat(), place.location.lng());
    } catch {
      if (!disposed && currentRevision === revision) callbacks.onError();
    }
  };
  const onError = () => {
    if (disposed) return;
    revision++;
    callbacks.onChange(element.value);
    callbacks.onError();
  };
  element.addEventListener("input", onInput);
  element.addEventListener("gmp-select", onSelect);
  element.addEventListener("gmp-error", onError);
  return () => {
    disposed = true;
    revision++;
    element.removeEventListener("input", onInput);
    element.removeEventListener("gmp-select", onSelect);
    element.removeEventListener("gmp-error", onError);
  };
}
