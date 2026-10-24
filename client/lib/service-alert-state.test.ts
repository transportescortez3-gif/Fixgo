import assert from "node:assert/strict";
import { mergeIncomingServiceAlert } from "./service-alert-state";

const now = 1_000_000;
const proMax = {
  serviceId: 41,
  deliveryId: "delivery-promax",
  title: "Reparar una fuga",
  clientName: "Cliente de prueba",
  convivenciaScore: 5,
  distanceKm: 2.4,
  phase: "promax" as const,
  totalSeconds: 60,
  budgetNote: "Presupuesto reservado para Pro Max",
};

const first = mergeIncomingServiceAlert([], proMax, now);
assert.equal(first.resetHandled, true);
assert.equal(first.queue.length, 1, "an incoming event creates the card state immediately");
assert.equal(first.queue[0].phase, "promax", "the card receives the Pro Max phase");
assert.equal(first.queue[0].budgetNote, proMax.budgetNote);
assert.equal(first.queue[0].expiresAt, now + 60_000);

const replay = mergeIncomingServiceAlert(first.queue, proMax, now + 2_000);
assert.equal(replay.resetHandled, false);
assert.equal(replay.queue[0].expiresAt, first.queue[0].expiresAt, "replay must not restart the countdown");

const nearby = {
  ...proMax,
  serviceId: 42,
  deliveryId: "delivery-nearby",
  phase: "nearby" as const,
  budgetNote: null,
};
const delayed = mergeIncomingServiceAlert(first.queue, nearby, now + 10_000);
assert.equal(delayed.queue.length, 2, "the delayed Pro/Free event creates a second card");
assert.equal(delayed.queue[1].phase, "nearby");
assert.equal(delayed.queue[1].budgetNote, null, "the delayed card has no suggested budget");

const freshDelivery = mergeIncomingServiceAlert(
  first.queue,
  { ...proMax, deliveryId: "delivery-recovered" },
  now + 3_000,
);
assert.equal(freshDelivery.resetHandled, true, "a replacement delivery can be shown again");
assert.equal(freshDelivery.queue[0].deliveryId, "delivery-recovered");

console.log("Service alert card state checks passed");
