import assert from "node:assert/strict";
import { applyAccountSuspension } from "./account-suspension";

const suspendedUntil = "2026-09-07T12:00:00.000Z";
const currentUser = {
  id: 42,
  isAvailable: true,
  status: "active",
};

assert.deepEqual(
  applyAccountSuspension(currentUser, { suspendedUntil, level: 1 }),
  {
    ...currentUser,
    isAvailable: false,
    suspendedUntil,
  },
);
assert.equal(
  applyAccountSuspension(currentUser, { suspendedUntil: null }),
  currentUser,
);

console.log("account suspension client event checks passed");