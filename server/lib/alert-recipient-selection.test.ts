import assert from "node:assert/strict";
import {
  canReceiveWorkerAlerts,
  getActiveAlertExclusionReasons,
  getLateAlertWindow,
  isLateAlertPhase,
  isProMaxAlertPhase,
  isWorkerWithinAlertRadius,
  NEARBY_DELAY_MS,
  resolveLatestWorkerPlans,
  splitAlertRecipients,
} from "./alert-recipient-selection";

assert.equal(canReceiveWorkerAlerts("worker", "client", "worker"), true);
assert.equal(canReceiveWorkerAlerts("admin", "worker", "admin"), true);
assert.equal(canReceiveWorkerAlerts("admin", "admin", undefined), false);
assert.equal(canReceiveWorkerAlerts("admin", "client", "admin"), false);
assert.equal(canReceiveWorkerAlerts("client", "worker", "client"), true);
assert.equal(canReceiveWorkerAlerts("client", "client", undefined), false);

const diagnosticNow = new Date("2026-11-03T12:00:00Z");
const eligibleDiagnostic = {
  role: "worker",
  isAvailable: true,
  status: "active",
  categoryMatches: true,
  alertCooldownUntil: null,
  suspendedUntil: null,
  activeAsWorker: true,
  hasActiveService: false,
  now: diagnosticNow,
};
assert.deepEqual(getActiveAlertExclusionReasons(eligibleDiagnostic), []);
assert.deepEqual(
  getActiveAlertExclusionReasons({ ...eligibleDiagnostic, role: "client" }),
  [],
  "a client-base account switched into an authenticated worker session is eligible",
);
assert.deepEqual(
  getActiveAlertExclusionReasons({
    ...eligibleDiagnostic,
    role: "client",
    isAvailable: false,
    status: "blocked",
    categoryMatches: false,
    alertCooldownUntil: new Date("2026-11-03T12:01:00Z"),
    suspendedUntil: new Date("2026-11-03T12:02:00Z"),
    activeAsWorker: false,
    hasActiveService: true,
  }),
  [
    "not_available",
    "account_not_active",
    "category_mismatch",
    "alert_cooldown_active",
    "account_suspended",
    "not_in_worker_mode",
    "has_active_service",
  ],
  "diagnostics should identify each active-alert exclusion without changing recipient selection",
);
assert.deepEqual(
  getActiveAlertExclusionReasons({
    ...eligibleDiagnostic,
    alertCooldownUntil: diagnosticNow,
    suspendedUntil: diagnosticNow,
  }),
  ["alert_cooldown_active", "account_suspended"],
  "cooldown and suspension remain active through their exact end time",
);

const lateAlertNow = new Date("2026-11-03T12:00:20Z");
const lateAlertStart = new Date("2026-11-03T12:00:00Z");
const originalModalDeadline = new Date("2026-11-03T12:01:00Z");
const originalAlertDeadline = new Date("2026-11-03T12:02:00Z");
assert.deepEqual(
  getLateAlertWindow({
    now: lateAlertNow,
    cohortStartedAt: lateAlertStart,
    modalExpiresAt: originalModalDeadline,
    expiresAt: originalAlertDeadline,
    phase: "promax",
  }),
  {
    availableAt: lateAlertNow,
    modalExpiresAt: originalModalDeadline,
    expiresAt: originalAlertDeadline,
  },
  "late recipients keep the original expiry rather than receiving a fresh timer",
);
assert.deepEqual(
  getLateAlertWindow({
    now: new Date("2026-11-03T12:00:05Z"),
    cohortStartedAt: lateAlertStart,
    modalExpiresAt: originalModalDeadline,
    expiresAt: originalAlertDeadline,
    phase: "nearby",
  }),
  {
    availableAt: new Date("2026-11-03T12:00:10Z"),
    modalExpiresAt: originalModalDeadline,
    expiresAt: originalAlertDeadline,
  },
  "nearby recipients preserve the existing ten-second phase delay",
);
assert.equal(
  getLateAlertWindow({
    now: originalModalDeadline,
    cohortStartedAt: lateAlertStart,
    modalExpiresAt: originalModalDeadline,
    expiresAt: originalAlertDeadline,
    phase: "promax",
  }),
  null,
  "expired modal windows are not recovered",
);
assert.equal(
  getLateAlertWindow({
    now: new Date("2026-11-03T12:00:05Z"),
    cohortStartedAt: lateAlertStart,
    modalExpiresAt: new Date("2026-11-03T12:00:09Z"),
    expiresAt: originalAlertDeadline,
    phase: "nearby",
  }),
  null,
  "a nearby recipient is not scheduled after the original modal window",
);
assert.equal(isLateAlertPhase("late_promax"), true);
assert.equal(isLateAlertPhase("nearby"), false);
assert.equal(isProMaxAlertPhase("late_promax"), true);
assert.equal(isProMaxAlertPhase("late_nearby"), false);
assert.deepEqual(
  getActiveAlertExclusionReasons({
    ...eligibleDiagnostic,
    alertCooldownUntil: diagnosticNow,
    suspendedUntil: diagnosticNow,
  }),
  ["alert_cooldown_active", "account_suspended"],
  "cooldown and suspension remain active through their exact end time",
);

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

const inRadius = (input: Parameters<typeof isWorkerWithinAlertRadius>[0]) =>
  isWorkerWithinAlertRadius(input);
const baseRadiusCase = {
  isProMax: false,
  profileRadiusKm: 20,
  planRadiusKm: 5,
  distanceKm: 8,
  hasServiceCoordinates: true,
};
assert.equal(
  inRadius(baseRadiusCase),
  false,
  "Pro and free workers must satisfy the plan radius as well as their profile radius",
);
assert.equal(
  inRadius({ ...baseRadiusCase, profileRadiusKm: 5, planRadiusKm: 20 }),
  false,
  "Pro and free workers must satisfy their profile radius",
);
assert.equal(
  inRadius({ ...baseRadiusCase, profileRadiusKm: null, planRadiusKm: -1, distanceKm: 100 }),
  true,
  "null profile and negative plan radii are unlimited limits",
);
assert.equal(
  inRadius({ ...baseRadiusCase, isProMax: true, profileRadiusKm: 5, planRadiusKm: -1 }),
  false,
  "Pro Max uses the profile radius and is not capped by the plan radius",
);
assert.equal(
  inRadius({ ...baseRadiusCase, distanceKm: null }),
  true,
  "missing worker coordinates must not exclude an expert",
);
assert.equal(
  inRadius({ ...baseRadiusCase, hasServiceCoordinates: false }),
  true,
  "missing service coordinates must not exclude an expert",
);
console.log("Service alert recipient selection checks passed");
