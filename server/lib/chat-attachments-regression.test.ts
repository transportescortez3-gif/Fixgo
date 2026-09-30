import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachmentAccessError } from "./chat-attachment-access";
import { featureEnabled } from "./subscription-access";

const pendingService = {
  clientId: 100,
  workerId: null,
  status: "pending",
  freeCancelUntil: new Date("2026-09-12T12:10:00.000Z"),
};

// Before an agreement, both sides can prepare an attachment. The grace window
// is intentionally not an attachment gate; it only controls cancellation.
assert.equal(attachmentAccessError(pendingService, 100, "client"), null);
assert.equal(attachmentAccessError(pendingService, 200, "worker"), null);
assert.equal(
  attachmentAccessError({ ...pendingService, status: "open" }, 100, "client"),
  null,
);

// A client can only address its own service. A pending worker is allowed to
// open its own marketplace thread, while a non-worker account is not.
assert.deepEqual(
  attachmentAccessError(pendingService, 999, "client"),
  { status: 403, error: "No tienes acceso a este chat" },
);
assert.deepEqual(
  attachmentAccessError(pendingService, 999, "admin"),
  { status: 403, error: "No tienes acceso a este chat" },
);

// Once assigned, only the client and assigned worker remain participants.
const assignedService = { ...pendingService, status: "in_progress", workerId: 200 };
assert.equal(attachmentAccessError(assignedService, 100, "client"), null);
assert.equal(attachmentAccessError(assignedService, 200, "worker"), null);
assert.deepEqual(
  attachmentAccessError(assignedService, 300, "worker"),
  { status: 403, error: "No tienes acceso a este chat" },
);

// Closed conversations are blocked even for their former participants.
for (const status of ["cancelled", "completed"]) {
  assert.deepEqual(
    attachmentAccessError({ ...assignedService, status }, 100, "client"),
    { status: 409, error: "El servicio está cerrado" },
  );
  assert.deepEqual(
    attachmentAccessError({ ...assignedService, status }, 200, "worker"),
    { status: 409, error: "El servicio está cerrado" },
  );
}

// Free plans remain blocked by the existing feature gate.
assert.equal(featureEnabled({ planCode: "client_free", features: { image_attachments: false } }, "image_attachments"), false);
assert.equal(featureEnabled({ planCode: "pro_free", features: { image_attachments: false } }, "image_attachments"), false);
assert.equal(featureEnabled({ planCode: "client_pro", features: { image_attachments: true } }, "image_attachments"), true);

const attachmentsRoute = await readFile(
  new URL("../routes/chat-attachments.ts", import.meta.url),
  "utf8",
);
const messagesRoute = await readFile(
  new URL("../routes/messages.ts", import.meta.url),
  "utf8",
);
const clientAttachmentLibrary = await readFile(
  new URL("../../client/lib/chat-attachments.ts", import.meta.url),
  "utf8",
);

// Every prepare/complete/upload phase resolves the same thread, and init
// stores that resolved workerId instead of trusting a service-level workerId.
assert.match(
  attachmentsRoute,
  /resolveAttachmentThread\(service, req\.userId!, req\.userRole, req\.body\?\.workerId\)/,
);
assert.match(
  attachmentsRoute,
  /workerId: thread\.threadWorkerId/,
);
assert.match(
  attachmentsRoute,
  /resolveAttachmentThread\(service, req\.userId!, req\.userRole, row\.workerId\)/,
);
assert.match(
  attachmentsRoute,
  /eq\(proposalsTable\.workerId, threadWorkerId\)[\s\S]*inArray\(proposalsTable\.status, OPEN_PROPOSAL_STATUSES\)/,
);
assert.match(
  attachmentsRoute,
  /featureEnabled\(plan, "image_attachments"\)/,
);
assert.match(
  attachmentsRoute,
  /const threadWorkerId = row\.workerId \?\? service\.workerId/,
);
assert.match(
  attachmentsRoute,
  /requestedWorkerId[\s\S]*requestedWorkerId === threadWorkerId/,
);

// The old post-agreement-only guard must not return: association is allowed
// before agreement and during freeCancelUntil, but still requires the same
// service/thread checks above.
assert.doesNotMatch(messagesRoute, /Los adjuntos se habilitarán/);
assert.doesNotMatch(messagesRoute, /service\.freeCancelUntil\.getTime\(\)/);
assert.match(
  messagesRoute,
  /eq\(chatAttachmentsTable\.workerId, threadWorkerId\)/,
);
assert.match(messagesRoute, /workerId: threadWorkerId/);
assert.match(
  messagesRoute,
  /inArray\(chatAttachmentsTable\.id, attachmentIds\),\s+isNull\(chatAttachmentsTable\.messageId\)/s,
);

// The client must carry the selected pending-thread worker through prepare
// and content download; omitting it would mix multiple pending conversations.
assert.match(
  clientAttachmentLibrary,
  /batchBytes: number,\s+workerId: number,\s+\): Promise<ChatAttachmentMeta>/s,
);
assert.match(
  clientAttachmentLibrary,
  /batchCount, batchBytes, workerId \}\)/,
);
assert.match(
  clientAttachmentLibrary,
  /content\?workerId=\$\{workerId\}/,
);

console.log("chat attachment regression checks passed");