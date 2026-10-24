import assert from "node:assert/strict";
import { NEARBY_DELAY_MS, splitAlertRecipients } from "./alert-recipient-selection";

const workers = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `plus-${index}`, isProMax: true })),
  ...Array.from({ length: 10 }, (_, index) => ({ id: `pro-${index}`, isProMax: false })),
];

const { proMaxWorkers, nearbyWorkers } = splitAlertRecipients(workers);

assert.equal(proMaxWorkers.length, 10, "all eligible Pro Max workers must be included");
assert.equal(nearbyWorkers.length, 10, "all eligible Pro and free workers must be included");
assert.equal(proMaxWorkers[0].id, "plus-0");
assert.equal(nearbyWorkers[0].id, "pro-0");
assert.equal(NEARBY_DELAY_MS, 10_000);
console.log("Service alert recipient selection checks passed");
