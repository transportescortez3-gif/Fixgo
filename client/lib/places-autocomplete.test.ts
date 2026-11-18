import assert from "node:assert/strict";
import { bindPlacesAddressElement, type PlacesAddressElement } from "./places-autocomplete";

class FakeWidget extends EventTarget {
  value = "";
  input(value: string) {
    this.value = value;
    this.dispatchEvent(new Event("input"));
  }
  select(address: string, lat: number, lng: number, pending = Promise.resolve()) {
    const event = Object.assign(new Event("gmp-select"), {
      placePrediction: {
        toPlace: () => ({
          formattedAddress: address,
          location: { lat: () => lat, lng: () => lng },
          fetchFields: async ({ fields }: { fields: string[] }) => {
            assert.deepEqual(fields, ["formattedAddress", "location"]);
            await pending;
          },
        }),
      },
    });
    this.dispatchEvent(event);
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const mount = () => {
  const widget = new FakeWidget();
  const values: string[] = [];
  const coordinates: number[][] = [];
  let errors = 0;
  const dispose = bindPlacesAddressElement(widget as unknown as PlacesAddressElement, {
    onChange: (value) => values.push(value),
    onLatLng: (lat, lng) => coordinates.push([lat, lng]),
    onError: () => errors++,
  });
  return { widget, values, coordinates, dispose, errors: () => errors };
};

const origin = mount();
const destination = mount();
origin.widget.input("Santiago 1523");
assert.equal(origin.values.at(-1), "Santiago 1523", "Manual text is delivered immediately");
origin.widget.select("Santiago 1523, Santiago, Chile", -33.45, -70.66);
destination.widget.select("Providencia 100, Santiago, Chile", -33.43, -70.61);
await flush();
assert.equal(origin.values.at(-1), "Santiago 1523, Santiago, Chile");
assert.deepEqual(origin.coordinates, [[-33.45, -70.66]]);
assert.deepEqual(destination.coordinates, [[-33.43, -70.61]]);
assert.equal(destination.values.at(-1), "Providencia 100, Santiago, Chile");

let release!: () => void;
const pending = new Promise<void>((resolve) => { release = resolve; });
origin.widget.select("Outdated result", 0, 0, pending);
origin.widget.input("New manual address");
release();
await flush();
assert.equal(origin.values.at(-1), "New manual address");
assert.equal(origin.coordinates.length, 1, "Stale details must not overwrite a new edit");
origin.widget.input("");
assert.equal(origin.values.at(-1), "", "Clearing is propagated");

const broken = mount();
broken.widget.value = "Keep this text";
broken.widget.dispatchEvent(new Event("gmp-error"));
assert.equal(broken.errors(), 1);
assert.equal(broken.values.at(-1), "Keep this text", "Preserve text when reverting to manual input");

const detailsFailure = mount();
detailsFailure.widget.select("Bad details", 0, 0, Promise.reject(new Error("denied")));
await flush();
assert.equal(detailsFailure.errors(), 1, "Place details failure enables manual fallback");

const removed = mount();
let releaseRemoved!: () => void;
removed.widget.select("Unmounted address", 0, 0, new Promise<void>((resolve) => { releaseRemoved = resolve; }));
removed.dispose();
releaseRemoved();
removed.widget.input("Ignored");
await flush();
assert.deepEqual(removed.values, []);
assert.deepEqual(removed.coordinates, []);
origin.dispose();
destination.dispose();
broken.dispose();
detailsFailure.dispose();
console.log("Places (New): origin/destination, manual text, clearing, errors, races and cleanup passed");
