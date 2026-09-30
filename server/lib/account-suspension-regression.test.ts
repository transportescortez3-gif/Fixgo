import assert from "node:assert/strict";
import {
  getLateCancellationAction,
  getSuspensionDurationHours,
  getSuspensionUntil,
} from "./suspension-policy";
import {
  isRestrictedAccountAllowedPath,
  isSuspensionActive,
} from "./restricted-account-policy";
import { authorizeAuthenticatedUser } from "../middlewares/authenticate";

const now = new Date("2026-09-06T12:00:00.000Z");

assert.equal(getLateCancellationAction(1), "warning");
assert.equal(getLateCancellationAction(2), "warning");
assert.equal(getLateCancellationAction(3), "suspension");
assert.equal(getLateCancellationAction(4), "suspension");

function responseDouble() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

async function authorizePath(path: string, method: string, suspendedUntil: Date | null) {
  const req = {
    path,
    method,
    userRole: "worker",
  } as any;
  const response = responseDouble();
  const cacheEntry = {
    role: "worker",
    status: "active",
    suspendedUntil,
    lastActivityAt: null,
    securitySelfieRequired: false,
    lastActivityWrittenAt: now.getTime(),
    expiresAt: now.getTime() + 60_000,
  };

  const allowed = await authorizeAuthenticatedUser(
    req,
    response as any,
    {
      id: 42,
      status: "active",
      suspendedUntil,
      lastActivityAt: null,
      securitySelfieRequired: false,
    },
    cacheEntry,
    now.getTime(),
  );

  return { allowed, response };
}

// First late cancellation: warning only, no suspension.
const firstWarning = {
  suspensionCount: 0,
  currentMonthCancellations: 1,
  previousMonthCancellations: 0,
};
assert.equal(getSuspensionDurationHours(firstWarning), 0);
assert.equal(
  getSuspensionUntil(now, firstWarning).toISOString(),
  "2026-09-06T12:00:00.000Z",
);

// The third, fourth, and fifth late cancellations escalate the duration.
assert.equal(
  getSuspensionDurationHours({
    suspensionCount: 3,
    currentMonthCancellations: 3,
    previousMonthCancellations: 0,
  }),
  24,
);
assert.equal(
  getSuspensionDurationHours({
    suspensionCount: 4,
    currentMonthCancellations: 4,
    previousMonthCancellations: 0,
  }),
  7 * 24,
);
assert.equal(
  getSuspensionDurationHours({
    suspensionCount: 5,
    currentMonthCancellations: 5,
    previousMonthCancellations: 0,
  }),
  30 * 24,
);

// The middleware allowlist blocks marketplace operations while keeping profile
// and support available to the authenticated restricted session.
assert.equal(
  isSuspensionActive("2026-09-07T12:00:00.000Z", now.getTime()),
  true,
);
assert.equal(
  isRestrictedAccountAllowedPath("/services", "GET", 42),
  false,
);
assert.equal(
  isRestrictedAccountAllowedPath("/services/42/messages", "POST", 42),
  false,
);
assert.equal(
  isRestrictedAccountAllowedPath("/users/42", "PATCH", 42),
  true,
);
assert.equal(
  isRestrictedAccountAllowedPath("/tickets", "POST", 42),
  true,
);
assert.equal(
  isSuspensionActive("2026-09-06T11:59:59.999Z", now.getTime()),
  false,
);

const blockedMarketplaceRequest = await authorizePath(
  "/services",
  "POST",
  getSuspensionUntil(now, {
    suspensionCount: 0,
    currentMonthCancellations: 3,
    previousMonthCancellations: 0,
  }),
);
assert.equal(blockedMarketplaceRequest.allowed, false);
assert.equal(blockedMarketplaceRequest.response.statusCode, 403);
assert.equal((blockedMarketplaceRequest.response.body as any).code, "ACCOUNT_SUSPENDED");

const allowedProfileRequest = await authorizePath(
  "/users/42",
  "PATCH",
  getSuspensionUntil(now, {
    suspensionCount: 0,
    currentMonthCancellations: 3,
    previousMonthCancellations: 0,
  }),
);
assert.equal(allowedProfileRequest.allowed, true);
assert.equal(allowedProfileRequest.response.statusCode, 200);

const expiredSuspensionRequest = await authorizePath(
  "/services",
  "POST",
  new Date("2026-09-06T11:59:59.999Z"),
);
assert.equal(expiredSuspensionRequest.allowed, true);
assert.equal(expiredSuspensionRequest.response.statusCode, 200);

console.log("account suspension regression checks passed");