import assert from "node:assert/strict";
import { splitAlertRecipients } from "./alert-recipient-selection";

const workers = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `plus-${index}`, isProMax: true })),
  ...Array.from({ length: 10 }, (_, index) => ({ id: `pro-${index}`, isProMax: false })),
];

const { proMaxWorkers, nearbyWorkers } = splitAlertRecipients(workers);

assert.equal(proMaxWorkers.length, 8);
assert.equal(nearbyWorkers.length, 8);
assert.equal(proMaxWorkers[0].id, "plus-0");
assert.equal(nearbyWorkers[0].id, "pro-0");
console.log("Service alert recipient selection checks passed");
