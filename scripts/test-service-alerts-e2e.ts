import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  alertSessionsTable,
  categoriesTable,
  notificationsTable,
  servicesTable,
  subscriptionPlansTable,
  userSubscriptionsTable,
  usersTable,
  workerAlertSlotsTable,
  workerCategoriesTable,
} from "../server/db";
import { hashPassword, signToken } from "../server/lib/auth";

const BASE_URL = process.env.SERVICE_ALERT_E2E_BASE_URL
  ?? `http://127.0.0.1:${process.env.PORT ?? "5000"}`;
const PREFIX = `service-alert-e2e-${Date.now()}-${process.pid}`;
const PROMAX_PLAN = "pro_plus_monthly";
const PRO_PLAN = "pro_monthly";
const NEARBY_DELAY_MS = 10_000;
const MAX_ALERT_WAIT_MS = 18_000;

interface AlertEvent {
  serviceId: number;
  deliveryId?: string;
  title: string;
  phase?: "promax" | "nearby";
  budgetNote?: string | null;
}

interface ExpiredAlertEvent {
  serviceId: number;
}

interface TestAccount {
  id: number;
  email: string;
  role: "client" | "worker";
  name: string;
}

const accounts: TestAccount[] = [];
const serviceIds: number[] = [];
const sockets: Socket[] = [];
const eventsByWorker = new Map<number, AlertEvent[]>();
const socketsByWorker = new Map<number, Socket>();
const expiredEventsByWorker = new Map<number, ExpiredAlertEvent[]>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  failureMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  assert.fail(failureMessage);
}

async function createAccount(
  name: string,
  role: TestAccount["role"],
  index: number,
): Promise<TestAccount> {
  const email = `${PREFIX}-${index}@fixxer.test`;
  const [account] = await db.insert(usersTable).values({
    name,
    email,
    password: hashPassword("service-alert-e2e-only"),
    role,
    status: "active",
    emailVerified: true,
    phoneVerified: true,
    kycStatus: role === "worker" ? "approved" : "not_submitted",
    isAvailable: role === "worker",
  }).returning({ id: usersTable.id });

  const result = { id: account.id, email, role, name };
  accounts.push(result);
  eventsByWorker.set(account.id, []);
  expiredEventsByWorker.set(account.id, []);
  return result;
}

async function connectWorker(worker: TestAccount): Promise<Socket> {
  const socket = io(BASE_URL, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: false,
    auth: {
      token: signToken({ id: worker.id, email: worker.email, role: worker.role }),
    },
  });
  sockets.push(socket);
  socket.on("service:active_alert", (event: AlertEvent) => {
    eventsByWorker.get(worker.id)?.push(event);
  });
  socket.on("service:alert_expired", (event: ExpiredAlertEvent) => {
    expiredEventsByWorker.get(worker.id)?.push(event);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Socket connection timed out for ${worker.name}`)), 8_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });
  return socket;
}

async function cleanup(): Promise<void> {
  const workerIds = accounts.filter((account) => account.role === "worker").map((account) => account.id);
  const accountIds = accounts.map((account) => account.id);
  const clientIds = accounts.filter((account) => account.role === "client").map((account) => account.id);
  const fixtureServices = clientIds.length
    ? await db.select({ id: servicesTable.id }).from(servicesTable)
      .where(inArray(servicesTable.clientId, clientIds))
    : [];
  const allServiceIds = [...new Set([...serviceIds, ...fixtureServices.map((service) => service.id)])];
  if (workerIds.length) {
    await db.delete(workerAlertSlotsTable).where(inArray(workerAlertSlotsTable.workerId, workerIds));
    await db.delete(workerCategoriesTable).where(inArray(workerCategoriesTable.workerId, workerIds));
    await db.delete(userSubscriptionsTable).where(inArray(userSubscriptionsTable.userId, workerIds));
  }
  if (allServiceIds.length) {
    await db.delete(alertSessionsTable).where(inArray(alertSessionsTable.serviceId, allServiceIds));
    await db.delete(servicesTable).where(inArray(servicesTable.id, allServiceIds));
  }
  if (accountIds.length) {
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, accountIds));
    await db.delete(usersTable).where(inArray(usersTable.id, accountIds));
  }
}

async function main(): Promise<void> {
  const [category] = await db.select({
    id: categoriesTable.id,
  }).from(categoriesTable).where(and(
    eq(categoriesTable.isActive, true),
    eq(categoriesTable.platform, "expertos"),
  )).limit(1);
  assert.ok(category, "an active Expertos category is needed for the test");

  const planRows = await db.select({
    code: subscriptionPlansTable.code,
  }).from(subscriptionPlansTable).where(inArray(subscriptionPlansTable.code, [PROMAX_PLAN, PRO_PLAN]));
  const availablePlans = new Set(planRows.map((row) => row.code));
  assert.ok(availablePlans.has(PROMAX_PLAN), `subscription plan ${PROMAX_PLAN} is missing`);
  assert.ok(availablePlans.has(PRO_PLAN), `subscription plan ${PRO_PLAN} is missing`);

  const client = await createAccount("Cliente de prueba de alertas", "client", 0);
  const proMax = await createAccount("Experto Pro Max de prueba", "worker", 1);
  const pro = await createAccount("Experto Pro de prueba", "worker", 2);
  const free = await createAccount("Experto Gratis de prueba", "worker", 3);
  const workers = [proMax, pro, free];

  for (const worker of workers) {
    await db.insert(workerCategoriesTable).values({
      workerId: worker.id,
      categoryId: category.id,
      isPrimary: true,
    });
  }

  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(userSubscriptionsTable).values([
    {
      userId: proMax.id,
      planCode: PROMAX_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    {
      userId: pro.id,
      planCode: PRO_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  ]);

  for (const worker of workers) {
    socketsByWorker.set(worker.id, await connectWorker(worker));
  }
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/services`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
    body: JSON.stringify({
      title: `${PREFIX}: reparación urgente`,
      description: "Solicitud temporal para verificar la entrega de alertas en tiempo real.",
      categoryId: category.id,
      address: "Dirección de prueba",
      paymentMethod: "cash",
      budgetNote: "Este presupuesto solo debe mostrarse a Pro Max",
    }),
  });
  const responseText = await response.text();
  assert.equal(response.status, 201, `service creation failed: ${response.status} ${responseText}`);
  const created = JSON.parse(responseText) as { id?: number; service?: { id?: number } };
  const serviceId = created.id ?? created.service?.id;
  assert.ok(serviceId, "the service creation response must include its ID");
  serviceIds.push(serviceId);

  await waitUntil(
    () => eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === serviceId) ?? false,
    6_000,
    "Pro Max did not receive the active alert immediately",
  );
  const proMaxEvent = eventsByWorker.get(proMax.id)!.find((event) => event.serviceId === serviceId)!;
  assert.equal(proMaxEvent.phase, "promax");
  assert.equal(proMaxEvent.title, `${PREFIX}: reparación urgente`);
  assert.equal(proMaxEvent.budgetNote, "Este presupuesto solo debe mostrarse a Pro Max");
  assert.ok(Date.now() - startedAt < NEARBY_DELAY_MS, "Pro Max must receive the card before the nearby phase");

  await sleep(Math.max(0, startedAt + NEARBY_DELAY_MS - 500 - Date.now()));
  for (const nearbyWorker of [pro, free]) {
    assert.equal(
      eventsByWorker.get(nearbyWorker.id)?.some((event) => event.serviceId === serviceId) ?? false,
      false,
      `${nearbyWorker.name} received the alert before the 10-second delay`,
    );
  }

  for (const nearbyWorker of [pro, free]) {
    await waitUntil(
      () => eventsByWorker.get(nearbyWorker.id)?.some((event) => event.serviceId === serviceId) ?? false,
      MAX_ALERT_WAIT_MS,
      `${nearbyWorker.name} did not receive the delayed active alert`,
    );
    const nearbyEvent: AlertEvent = eventsByWorker.get(nearbyWorker.id)!.find((item) => item.serviceId === serviceId)!;
    assert.equal(nearbyEvent.phase, "nearby");
    assert.equal(nearbyEvent.budgetNote, null, `${nearbyWorker.name} must not receive a suggested budget`);
    assert.ok(Date.now() - startedAt >= NEARBY_DELAY_MS - 500, "Pro and Free alerts must be delayed by about 10 seconds");
  }

  for (const [index, worker] of workers.entries()) {
    socketsByWorker.get(worker.id)?.disconnect();
    await connectWorker(worker);
    await waitUntil(
      () => (eventsByWorker.get(worker.id) ?? []).filter((event) => event.serviceId === serviceId).length >= 2,
      6_000,
      `${worker.name} did not recover the active alert after reconnecting`,
    );
    const recovered: AlertEvent = eventsByWorker.get(worker.id)!.filter((event) => event.serviceId === serviceId).at(-1)!;
    assert.equal(recovered.phase, index === 0 ? "promax" : "nearby");
    assert.equal(
      recovered.budgetNote,
      index === 0 ? "Este presupuesto solo debe mostrarse a Pro Max" : null,
      `${worker.name} received an incorrect budget during alert recovery`,
    );
  }

  const workerHeaders = {
    Authorization: `Bearer ${signToken({ id: proMax.id, email: proMax.email, role: proMax.role })}`,
  };
  const viewResponse = await fetch(`${BASE_URL}/api/alert-sessions/${serviceId}/view`, {
    method: "PATCH",
    headers: workerHeaders,
  });
  assert.equal(viewResponse.status, 200, `Pro Max could not engage the first alert: ${await viewResponse.text()}`);

  const queuedServiceIds: number[] = [];
  const queuedSessions = new Map<number, typeof alertSessionsTable.$inferSelect>();
  for (let index = 1; index <= 3; index++) {
    const title = `${PREFIX}: solicitud en cola ${index}`;
    const queuedResponse = await fetch(`${BASE_URL}/api/services`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
      },
      body: JSON.stringify({
        title,
        description: `Solicitud temporal número ${index} para verificar el orden de la cola.`,
        categoryId: category.id,
        address: "Dirección de prueba",
        paymentMethod: "cash",
        budgetNote: `Presupuesto de la solicitud ${index}`,
      }),
    });
    const queuedResponseText = await queuedResponse.text();
    assert.equal(
      queuedResponse.status,
      201,
      `queued service ${index} creation failed: ${queuedResponse.status} ${queuedResponseText}`,
    );
    const queuedCreated = JSON.parse(queuedResponseText) as { id?: number; service?: { id?: number } };
    const queuedServiceId = queuedCreated.id ?? queuedCreated.service?.id;
    assert.ok(queuedServiceId, `queued service ${index} response must include its ID`);
    queuedServiceIds.push(queuedServiceId);
    serviceIds.push(queuedServiceId);

    let queuedSession: typeof alertSessionsTable.$inferSelect | undefined;
    const queueDeadline = Date.now() + 6_000;
    while (Date.now() < queueDeadline && !queuedSession) {
      [queuedSession] = await db.select().from(alertSessionsTable).where(and(
        eq(alertSessionsTable.serviceId, queuedServiceId),
        eq(alertSessionsTable.workerId, proMax.id),
      )).limit(1);
      if (!queuedSession) await sleep(50);
    }
    assert.ok(queuedSession, `queued request ${index} was not recorded for Pro Max`);
    assert.equal(queuedSession.response, "pending", `queued request ${index} must remain pending`);
    assert.equal(queuedSession.deliveredAt, null, `queued request ${index} must not be delivered yet`);
    assert.equal(
      eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === queuedServiceId) ?? false,
      false,
      `queued request ${index} must not interrupt the engaged alert`,
    );
    queuedSessions.set(queuedServiceId, queuedSession);
  }

  const tiedQueueTimestamp = new Date(Date.now() - 1_000);
  await db.update(alertSessionsTable)
    .set({ availableAt: tiedQueueTimestamp, sentAt: tiedQueueTimestamp })
    .where(and(
      eq(alertSessionsTable.workerId, proMax.id),
      inArray(alertSessionsTable.serviceId, queuedServiceIds),
    ));
  const queuedSessionIds = queuedServiceIds.map((queuedId) => queuedSessions.get(queuedId)!.id);
  assert.deepEqual(
    queuedSessionIds,
    [...queuedSessionIds].sort((left, right) => left - right),
    "queue session IDs must reflect the requests' arrival order for the timestamp-tie check",
  );
  const expiredQueuedServiceId = queuedServiceIds[1]!;
  const [expiredQueuedSession] = await db.update(alertSessionsTable)
    .set({ expiresAt: new Date(Date.now() - 1) })
    .where(and(
      eq(alertSessionsTable.serviceId, expiredQueuedServiceId),
      eq(alertSessionsTable.workerId, proMax.id),
      eq(alertSessionsTable.response, "pending"),
      isNull(alertSessionsTable.deliveredAt),
    ))
    .returning({ id: alertSessionsTable.id });
  assert.ok(expiredQueuedSession, "the middle queued request must be pending and undelivered when it expires");
  const deliverableQueueServiceIds = queuedServiceIds.filter(
    (queuedId) => queuedId !== expiredQueuedServiceId,
  );

  const firstSlots = await db.select()
    .from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, proMax.id));
  assert.equal(firstSlots.length, 1, "only one alert slot may be occupied while requests are queued");
  const firstSlot = firstSlots[0];
  assert.equal(firstSlot?.serviceId, serviceId, "the first alert must retain Pro Max's exclusive slot");
  assert.equal(firstSlot?.state, "engaged", "the first alert must remain engaged while requests are queued");

  let currentServiceId = serviceId;
  const deliveredInOrder: number[] = [];
  for (const [index, expectedServiceId] of deliverableQueueServiceIds.entries()) {
    const releaseResponse = await fetch(`${BASE_URL}/api/alert-sessions/${currentServiceId}/release`, {
      method: "PATCH",
      headers: workerHeaders,
    });
    assert.equal(
      releaseResponse.status,
      200,
      `Pro Max could not release alert ${currentServiceId}: ${await releaseResponse.text()}`,
    );

    await waitUntil(
      () => eventsByWorker.get(proMax.id)!.filter((event) =>
        deliverableQueueServiceIds.includes(event.serviceId)
      ).length > index,
      6_000,
      `Pro Max did not receive a queued alert after releasing ${currentServiceId}`,
    );
    if (index === 0) {
      const [skippedExpiredSession] = await db.select()
        .from(alertSessionsTable)
        .where(eq(alertSessionsTable.id, expiredQueuedSession.id))
        .limit(1);
      assert.equal(
        skippedExpiredSession?.response,
        "skipped",
        "advancing the queue must immediately discard the expired undelivered session",
      );
      assert.ok(
        skippedExpiredSession?.respondedAt,
        "the expired queued session must record when it was discarded",
      );
      assert.equal(
        skippedExpiredSession?.deliveredAt,
        null,
        "the expired queued session must remain undelivered",
      );
    }
    const queuedEvents = eventsByWorker.get(proMax.id)!.filter((event) =>
      deliverableQueueServiceIds.includes(event.serviceId)
    );
    const latestQueuedEvent = queuedEvents.at(-1)!;
    assert.equal(
      latestQueuedEvent.serviceId,
      expectedServiceId,
      `valid queued request ${index + 1} must be delivered in arrival order, skipping the expired request`,
    );
    deliveredInOrder.push(latestQueuedEvent.serviceId);
    assert.equal(
      latestQueuedEvent.title,
      `${PREFIX}: solicitud en cola ${queuedServiceIds.indexOf(expectedServiceId) + 1}`,
    );
    assert.equal(
      eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === expiredQueuedServiceId) ?? false,
      false,
      "the expired queued request must never be shown to Pro Max",
    );

    const occupiedSlots = await db.select()
      .from(workerAlertSlotsTable)
      .where(eq(workerAlertSlotsTable.workerId, proMax.id));
    assert.equal(occupiedSlots.length, 1, "only one alert may occupy Pro Max's slot at a time");
    assert.equal(occupiedSlots[0]?.serviceId, expectedServiceId, "the next FIFO alert must take the exclusive slot");
    assert.equal(occupiedSlots[0]?.state, "pending");

    const deliveredSession = queuedSessions.get(expectedServiceId)!;
    const [currentSession] = await db.select().from(alertSessionsTable)
      .where(eq(alertSessionsTable.id, deliveredSession.id))
      .limit(1);
    assert.ok(currentSession?.deliveredAt, "the delivered queue entry must have a delivery timestamp");
    for (const laterServiceId of deliverableQueueServiceIds.slice(index + 1)) {
      assert.equal(
        eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === laterServiceId) ?? false,
        false,
        "a later queued alert must not be delivered before its predecessors",
      );
    }

    const viewResponse = await fetch(`${BASE_URL}/api/alert-sessions/${expectedServiceId}/view`, {
      method: "PATCH",
      headers: workerHeaders,
    });
    assert.equal(
      viewResponse.status,
      200,
      `Pro Max could not engage queued alert ${expectedServiceId}: ${await viewResponse.text()}`,
    );
    const engagedSlots = await db.select()
      .from(workerAlertSlotsTable)
      .where(eq(workerAlertSlotsTable.workerId, proMax.id));
    assert.equal(engagedSlots.length, 1, "engaging a queued alert must not create a second occupied slot");
    assert.equal(engagedSlots[0]?.serviceId, expectedServiceId);
    assert.equal(engagedSlots[0]?.state, "engaged");
    currentServiceId = expectedServiceId;
  }

  assert.deepEqual(
    deliveredInOrder,
    deliverableQueueServiceIds,
    "valid queued alerts must be delivered in arrival order while the expired request is skipped",
  );
  assert.equal(
    eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === expiredQueuedServiceId) ?? false,
    false,
    "the expired queued request must not be delivered while advancing to the next valid request",
  );
  const finalReleaseResponse = await fetch(`${BASE_URL}/api/alert-sessions/${currentServiceId}/release`, {
    method: "PATCH",
    headers: workerHeaders,
  });
  assert.equal(
    finalReleaseResponse.status,
    200,
    `Pro Max could not release the last alert: ${await finalReleaseResponse.text()}`,
  );
  const remainingSlots = await db.select()
    .from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, proMax.id));
  assert.equal(remainingSlots.length, 0, "releasing the final queued alert must free Pro Max's slot");

  const timeoutActiveTitle = `${PREFIX}: alerta activa sin respuesta`;
  const timeoutActiveResponse = await fetch(`${BASE_URL}/api/services`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
    body: JSON.stringify({
      title: timeoutActiveTitle,
      description: "Solicitud temporal para verificar el vencimiento real de una alerta activa.",
      categoryId: category.id,
      address: "Dirección de prueba",
      paymentMethod: "cash",
    }),
  });
  const timeoutActiveResponseText = await timeoutActiveResponse.text();
  assert.equal(
    timeoutActiveResponse.status,
    201,
    `timeout active service creation failed: ${timeoutActiveResponse.status} ${timeoutActiveResponseText}`,
  );
  const timeoutActiveCreated = JSON.parse(timeoutActiveResponseText) as { id?: number; service?: { id?: number } };
  const timeoutActiveServiceId = timeoutActiveCreated.id ?? timeoutActiveCreated.service?.id;
  assert.ok(timeoutActiveServiceId, "the timeout active service response must include its ID");
  serviceIds.push(timeoutActiveServiceId);

  await waitUntil(
    () => eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === timeoutActiveServiceId) ?? false,
    6_000,
    "Pro Max did not receive the active alert that should expire",
  );
  const [timeoutActiveSession] = await db.select().from(alertSessionsTable).where(and(
    eq(alertSessionsTable.serviceId, timeoutActiveServiceId),
    eq(alertSessionsTable.workerId, proMax.id),
  )).limit(1);
  assert.equal(timeoutActiveSession?.response, "pending", "the active alert must remain unanswered until timeout");
  assert.ok(timeoutActiveSession?.expiresAt, "the active alert must have a real timeout deadline");
  assert.ok(timeoutActiveSession.expiresAt.getTime() > Date.now(), "the active alert must not be expired before queueing");
  assert.equal(
    eventsByWorker.get(proMax.id)!.filter((event) => event.serviceId === timeoutActiveServiceId).length,
    1,
    "Pro Max must receive the unanswered active alert only once",
  );

  const timeoutQueuedTitle = `${PREFIX}: solicitud válida tras el timeout`;
  const timeoutQueuedResponse = await fetch(`${BASE_URL}/api/services`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
    body: JSON.stringify({
      title: timeoutQueuedTitle,
      description: "Solicitud temporal válida que debe ocupar el cupo al vencer la alerta anterior.",
      categoryId: category.id,
      address: "Dirección de prueba",
      paymentMethod: "cash",
    }),
  });
  const timeoutQueuedResponseText = await timeoutQueuedResponse.text();
  assert.equal(
    timeoutQueuedResponse.status,
    201,
    `timeout queued service creation failed: ${timeoutQueuedResponse.status} ${timeoutQueuedResponseText}`,
  );
  const timeoutQueuedCreated = JSON.parse(timeoutQueuedResponseText) as { id?: number; service?: { id?: number } };
  const timeoutQueuedServiceId = timeoutQueuedCreated.id ?? timeoutQueuedCreated.service?.id;
  assert.ok(timeoutQueuedServiceId, "the timeout queued service response must include its ID");
  serviceIds.push(timeoutQueuedServiceId);

  let timeoutQueuedSession: typeof alertSessionsTable.$inferSelect | undefined;
  const timeoutQueueDeadline = Date.now() + 6_000;
  while (Date.now() < timeoutQueueDeadline && !timeoutQueuedSession) {
    [timeoutQueuedSession] = await db.select().from(alertSessionsTable).where(and(
      eq(alertSessionsTable.serviceId, timeoutQueuedServiceId),
      eq(alertSessionsTable.workerId, proMax.id),
    )).limit(1);
    if (!timeoutQueuedSession) await sleep(50);
  }
  assert.ok(timeoutQueuedSession, "the valid waiting request must be recorded for Pro Max");
  // Keep this queue entry valid beyond the active alert's deadline so this
  // scenario isolates releasing the active slot from queue-item expiration.
  const [extendedTimeoutQueuedSession] = await db.update(alertSessionsTable)
    .set({ expiresAt: new Date(timeoutActiveSession.expiresAt.getTime() + 30_000) })
    .where(and(
      eq(alertSessionsTable.id, timeoutQueuedSession.id),
      eq(alertSessionsTable.response, "pending"),
      isNull(alertSessionsTable.deliveredAt),
    ))
    .returning();
  assert.ok(extendedTimeoutQueuedSession, "the waiting request must remain valid past the active alert timeout");
  timeoutQueuedSession = extendedTimeoutQueuedSession;
  assert.equal(timeoutQueuedSession.response, "pending", "the waiting request must remain valid and pending");
  assert.equal(timeoutQueuedSession.deliveredAt, null, "the waiting request must not be delivered before timeout");
  assert.equal(
    eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === timeoutQueuedServiceId) ?? false,
    false,
    "the waiting request must not interrupt the unanswered active alert",
  );

  const timeoutActiveSlots = await db.select().from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, proMax.id));
  assert.equal(timeoutActiveSlots.length, 1, "the unanswered active alert must retain the sole alert slot");
  assert.equal(timeoutActiveSlots[0]?.serviceId, timeoutActiveServiceId);
  assert.equal(timeoutActiveSlots[0]?.state, "pending");

  await waitUntil(
    () => expiredEventsByWorker.get(proMax.id)?.some((event) => event.serviceId === timeoutActiveServiceId) ?? false,
    Math.max(6_000, timeoutActiveSession.expiresAt.getTime() - Date.now() + 6_000),
    "Pro Max did not receive the active alert expiration event",
  );
  await waitUntil(
    () => eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === timeoutQueuedServiceId) ?? false,
    6_000,
    "the valid waiting request was not delivered after the active alert expired",
  );
  await sleep(500);

  const timeoutExpiredEventCount = expiredEventsByWorker.get(proMax.id)!
    .filter((event) => event.serviceId === timeoutActiveServiceId).length;
  assert.equal(timeoutExpiredEventCount, 1, "the unanswered active alert must expire only once");
  const [expiredActiveSession] = await db.select().from(alertSessionsTable).where(eq(
    alertSessionsTable.id,
    timeoutActiveSession.id,
  )).limit(1);
  assert.equal(expiredActiveSession?.response, "skipped", "the unanswered active session must be marked skipped");
  assert.ok(expiredActiveSession?.respondedAt, "the expired active session must record its timeout");
  assert.equal(
    eventsByWorker.get(proMax.id)!.filter((event) => event.serviceId === timeoutQueuedServiceId).length,
    1,
    "the next valid request must be delivered exactly once",
  );
  const [deliveredTimeoutQueueSession] = await db.select().from(alertSessionsTable).where(eq(
    alertSessionsTable.id,
    timeoutQueuedSession.id,
  )).limit(1);
  assert.equal(deliveredTimeoutQueueSession?.response, "pending");
  assert.ok(deliveredTimeoutQueueSession?.deliveredAt, "the next valid request must record its delivery");
  const timeoutQueuedSlots = await db.select().from(workerAlertSlotsTable)
    .where(eq(workerAlertSlotsTable.workerId, proMax.id));
  assert.equal(timeoutQueuedSlots.length, 1, "the next request must occupy the single alert slot");
  assert.equal(timeoutQueuedSlots[0]?.serviceId, timeoutQueuedServiceId);
  assert.equal(timeoutQueuedSlots[0]?.state, "pending");

  console.log("Service alert real-time flow passed: tier timing and recovery, FIFO queue behavior, and single delivery after an unanswered alert times out.");
}

main()
  .catch((error) => {
    console.error("Service alert real-time flow failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    sockets.forEach((socket) => socket.disconnect());
    try {
      await cleanup();
    } catch (error) {
      console.error("Service alert test cleanup failed:", error);
      process.exitCode = 1;
    }
    const { pool } = await import("../server/db");
    await pool.end();
  });
