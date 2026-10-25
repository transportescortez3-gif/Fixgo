import assert from "node:assert/strict";
import {
  canReceiveWorkerAlerts,
  NEARBY_DELAY_MS,
  resolveLatestWorkerPlans,
  splitAlertRecipients,
} from "./alert-recipient-selection";

assert.equal(canReceiveWorkerAlerts("worker", "client", "worker"), true);
assert.equal(canReceiveWorkerAlerts("admin", "worker", "admin"), true);
assert.equal(canReceiveWorkerAlerts("admin", "admin", undefined), false);
assert.equal(canReceiveWorkerAlerts("admin", "client", "admin"), false);
assert.equal(canReceiveWorkerAlerts("client", "worker", "client"), false);

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

const effectivePlans = resolveLatestWorkerPlans([
  {
    userId: 1,
    id: 2,
    planCode: "pro_plus_monthly",
    features: { radius_km: -1 },
    createdAt: new Date("2026-10-24T12:00:00Z"),
  },
  {
    userId: 1,
    id: 1,
    planCode: "pro_free",
    features: { radius_km: 5 },
    createdAt: new Date("2026-10-23T12:00:00Z"),
  },
]);
assert.equal(
  effectivePlans.get(1)?.planCode,
  "pro_plus_monthly",
  "an older active free row must not override the newest Pro Max subscription",
);
assert.equal(effectivePlans.get(1)?.features.radius_km, -1);
console.log("Service alert recipient selection checks passed");
