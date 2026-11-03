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
  totalSeconds: 120,
  modalSeconds: 60,
  budgetNote: "Presupuesto reservado para Pro Max",
};

const first = mergeIncomingServiceAlert([], proMax, now);
assert.equal(first.resetHandled, true);
assert.equal(first.queue.length, 1, "an incoming event creates the card state immediately");
assert.equal(first.queue[0].phase, "promax", "the card receives the Pro Max phase");
assert.equal(first.queue[0].budgetNote, proMax.budgetNote);
assert.equal(first.queue[0].expiresAt, now + 120_000);
assert.equal(first.queue[0].modalExpiresAt, now + 60_000);

const replay = mergeIncomingServiceAlert(first.queue, proMax, now + 2_000);
assert.equal(replay.resetHandled, false);
assert.equal(replay.queue[0].expiresAt, first.queue[0].expiresAt, "replay must not restart the countdown");
assert.equal(replay.queue[0].modalExpiresAt, first.queue[0].modalExpiresAt, "replay must not restart the modal window");
const secondMinute = replay.queue.filter((alert) => alert.expiresAt > now + 60_000);
assert.equal(secondMinute.length, 1, "the alert remains available through its second minute");
assert.equal(secondMinute[0].modalExpiresAt, now + 60_000, "the modal ends before the alert expires");
assert.equal(replay.queue.filter((alert) => alert.expiresAt > now + 120_000).length, 0, "the alert leaves the tray at two minutes");

const nearby = {
  ...proMax,
  serviceId: 42,
  deliveryId: "delivery-nearby",
  phase: "nearby" as const,
  totalSeconds: 30,
  budgetNote: null,
};
const delayed = mergeIncomingServiceAlert(first.queue, nearby, now + 10_000);
assert.equal(delayed.queue.length, 2, "the delayed Pro/Free event creates a second card");
assert.equal(delayed.queue[1].phase, "nearby");
assert.equal(delayed.queue[1].budgetNote, null, "the delayed card has no suggested budget");
assert.equal(delayed.queue[0].expiresAt, now + 120_000, "adding another card must not reset the first timer");
assert.equal(delayed.queue[1].expiresAt, now + 40_000, "each card must get its own expiry deadline");

const remainingAfterSkip = delayed.queue.filter((alert) => alert.serviceId !== proMax.serviceId);
assert.equal(remainingAfterSkip.length, 1, "omitting one card must preserve the other card");
assert.equal(remainingAfterSkip[0].serviceId, nearby.serviceId);
assert.equal(
  remainingAfterSkip[0].expiresAt,
  delayed.queue[1].expiresAt,
  "omitting one card must not change another card's timer",
);

const freshDelivery = mergeIncomingServiceAlert(
  first.queue,
  { ...proMax, deliveryId: "delivery-recovered" },
  now + 3_000,
);
assert.equal(freshDelivery.resetHandled, false, "a new delivery id must not duplicate an active service alert");
assert.equal(freshDelivery.queue.length, 1, "the same service remains a single modal");
assert.equal(freshDelivery.queue[0].deliveryId, "delivery-promax", "the active delivery identity is preserved");
assert.equal(freshDelivery.queue[0].expiresAt, first.queue[0].expiresAt, "duplicate delivery must preserve total expiry");
assert.equal(freshDelivery.queue[0].modalExpiresAt, first.queue[0].modalExpiresAt, "duplicate delivery must preserve modal expiry");

const afterExpiry = mergeIncomingServiceAlert(
  first.queue,
  { ...proMax, deliveryId: "delivery-after-expiry" },
  now + 121_000,
);
assert.equal(afterExpiry.resetHandled, true, "a new delivery after the previous session expires can be shown");
assert.equal(afterExpiry.queue[0].deliveryId, "delivery-after-expiry");

console.log("Service alert card state checks passed");
