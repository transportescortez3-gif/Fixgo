import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { authenticate } from "../../server/middlewares/authenticate";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const token = `${base64Url({ alg: "none" })}.${base64Url({ id: 42, role: "client" })}.signature`;
storage.setItem("fixgo_token", token);

const PASSWORD = "correct-password";
const PBKDF2_ITERATIONS = 200_000;

function toBase64(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64");
}

async function createBackup() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PASSWORD),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const wrapKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrapKey,
    new TextEncoder().encode(JSON.stringify(privateKey)),
  );

  return {
    hasBackup: true,
    encryptedPrivateKey: toBase64(encrypted),
    kdfSalt: toBase64(salt.buffer),
    kdfIv: toBase64(iv.buffer),
    kdfIterations: PBKDF2_ITERATIONS,
  };
}

const backup = await createBackup();
const { restoreOrCreateKeyPair } = await import("./e2e-crypto");

function installBackupFetch(requests: Array<{ method: string; headers: Headers }>): void {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (_input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
      });
      return new Response(JSON.stringify(backup), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}

const successfulRequests: Array<{ method: string; headers: Headers }> = [];
installBackupFetch(successfulRequests);
assert.equal(await restoreOrCreateKeyPair(PASSWORD), "restored");
assert.ok(storage.getItem("fixgo_e2e_keypair_v1:42"), "correct password restores the local key");
assert.equal(successfulRequests.length, 1);
assert.equal(successfulRequests[0].method, "GET");
assert.equal(successfulRequests[0].headers.get("Authorization"), `Bearer ${token}`);
assert.equal(successfulRequests[0].headers.has("X-Device-Id"), false);

storage.removeItem("fixgo_e2e_keypair_v1:42");
const incorrectPasswordRequests: Array<{ method: string; headers: Headers }> = [];
installBackupFetch(incorrectPasswordRequests);
assert.equal(await restoreOrCreateKeyPair("incorrect-password"), "restore_failed");
assert.equal(storage.getItem("fixgo_e2e_keypair_v1:42"), null);
assert.deepEqual(
  incorrectPasswordRequests.map(({ method }) => method),
  ["GET"],
  "a decrypt failure must not upload or rotate a key",
);

storage.removeItem("fixgo_e2e_keypair_v1:42");
let networkRequestCount = 0;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: async () => {
    networkRequestCount += 1;
    throw new TypeError("network unavailable");
  },
});
assert.equal(await restoreOrCreateKeyPair(PASSWORD), "unknown");
assert.equal(storage.getItem("fixgo_e2e_keypair_v1:42"), null);
assert.equal(networkRequestCount, 1, "a network failure must abort before key generation or upload");

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
let nextCalled = false;
await authenticate(
  { headers: {} } as any,
  response as any,
  () => {
    nextCalled = true;
  },
);
assert.equal(response.statusCode, 401);
assert.deepEqual(response.body, { error: "Unauthorized" });
assert.equal(nextCalled, false);

const messagesRouteSource = await readFile(
  new URL("../../server/routes/messages.ts", import.meta.url),
  "utf8",
);
const backupRouteStart = messagesRouteSource.indexOf('router.get("/messages/keys/backup"');
const nextRouteStart = messagesRouteSource.indexOf('router.get("/messages/keys/:userId"', backupRouteStart);
assert.ok(backupRouteStart >= 0 && nextRouteStart > backupRouteStart);
const backupRoute = messagesRouteSource.slice(backupRouteStart, nextRouteStart);
assert.match(backupRoute, /router\.get\("\/messages\/keys\/backup", authenticate,/);
assert.doesNotMatch(backupRoute, /phoneVerified|SMS|sms|X-Device-Id|x-device-id|deviceId/);

console.log("E2E key backup regression checks passed");