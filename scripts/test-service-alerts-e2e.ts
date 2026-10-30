import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  alertSessionsTable,
  categoriesTable,
  messagesTable,
  notificationsTable,
  proposalsTable,
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
const FREE_PLAN = "pro_free";
const NEARBY_DELAY_MS = 10_000;
const MAX_ALERT_WAIT_MS = 18_000;

interface AlertEvent {
  serviceId: number;
  deliveryId?: string;
  title: string;
  phase?: "promax" | "nearby";
  distanceKm?: number | null;
  totalSeconds?: number;
  budgetNote?: string | null;
}

interface ExpiredAlertEvent {
  serviceId: number;
}

interface TakenAlertEvent {
  serviceId: number;
}

interface TestAccount {
  id: number;
  email: string;
  role: "client" | "worker" | "admin";
  name: string;
}

const accounts: TestAccount[] = [];
const serviceIds: number[] = [];
const categoryIds: number[] = [];
const sockets: Socket[] = [];
const eventsByWorker = new Map<number, AlertEvent[]>();
const acceptedReceiptsByWorker = new Map<number, string[]>();
const socketsByWorker = new Map<number, Socket>();
const expiredEventsByWorker = new Map<number, ExpiredAlertEvent[]>();
const takenEventsByWorker = new Map<number, TakenAlertEvent[]>();

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
    kycStatus: role === "client" ? "not_submitted" : "approved",
    isAvailable: role !== "client",
  }).returning({ id: usersTable.id });

  const result = { id: account.id, email, role, name };
  accounts.push(result);
  eventsByWorker.set(account.id, []);
  acceptedReceiptsByWorker.set(account.id, []);
  expiredEventsByWorker.set(account.id, []);
  takenEventsByWorker.set(account.id, []);
  return result;
}

async function createServiceRequest(
  client: TestAccount,
  categoryId: number,
  title: string,
  location?: { lat: number; lng: number },
): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/services`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
    body: JSON.stringify({
      title,
      description: "Solicitud temporal para verificar alertas simultáneas.",
      categoryId,
      address: "Dirección de prueba",
      paymentMethod: "cash",
      ...(location ?? {}),
    }),
  });
  const responseText = await response.text();
  assert.equal(response.status, 201, `service creation failed: ${response.status} ${responseText}`);
  const created = JSON.parse(responseText) as { id?: number; service?: { id?: number } };
  const serviceId = created.id ?? created.service?.id;
  assert.ok(serviceId, "the service creation response must include its ID");
  serviceIds.push(serviceId);
  return serviceId;
}

async function connectWorker(
  worker: TestAccount,
  activeRole: "client" | "worker" | "admin" = worker.role,
  originalRole?: "admin",
): Promise<Socket> {
  const socket = io(BASE_URL, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: false,
    auth: {
      token: signToken({
        id: worker.id,
        email: worker.email,
        role: activeRole,
        ...(originalRole ? { originalRole } : {}),
      }),
    },
  });
  sockets.push(socket);
  socket.on("service:active_alert", (event: AlertEvent) => {
    eventsByWorker.get(worker.id)?.push(event);
    if (event.deliveryId) {
      socket.emit(
        "service:alert_received",
        { serviceId: event.serviceId, deliveryId: event.deliveryId },
        (result: { accepted: boolean }) => {
          if (result?.accepted) acceptedReceiptsByWorker.get(worker.id)?.push(event.deliveryId!);
        },
      );
    }
  });
  socket.on("service:alert_expired", (event: ExpiredAlertEvent) => {
    expiredEventsByWorker.get(worker.id)?.push(event);
  });
  socket.on("service:taken", (event: TakenAlertEvent) => {
    takenEventsByWorker.get(worker.id)?.push(event);
  });

  const authStatusPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Socket auth status timed out for ${worker.name}`)), 8_000);
    socket.once("socket:auth_status", (status: { authenticated?: boolean }) => {
      clearTimeout(timeout);
      if (!status?.authenticated) {
        reject(new Error(`Socket failed authentication for ${worker.name}`));
        return;
      }
      resolve();
    });
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
  await authStatusPromise;
  socket.emit("service:replay_active_alerts");
  return socket;
}

async function verifyUnauthenticatedSocketStatus(): Promise<void> {
  const socket = io(BASE_URL, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: false,
    auth: { token: "" },
  });
  sockets.push(socket);

  const statusPromise = new Promise<{ authenticated?: boolean }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Unauthenticated socket status timed out")), 8_000);
    socket.once("socket:auth_status", (status: { authenticated?: boolean }) => {
      clearTimeout(timeout);
      resolve(status);
    });
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Unauthenticated socket connection timed out")), 8_000);
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
  assert.equal((await statusPromise).authenticated, false);

  const replayError = new Promise<{ reason?: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Unauthenticated replay was not rejected")), 8_000);
    socket.once("service:alert_error", (error: { reason?: string }) => {
      clearTimeout(timeout);
      resolve(error);
    });
  });
  socket.emit("service:replay_active_alerts");
  assert.equal((await replayError).reason, "authentication_required");
  socket.disconnect();
}

async function cleanup(): Promise<void> {
  const workerIds = accounts.filter((account) => account.role !== "client").map((account) => account.id);
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
    await db.delete(messagesTable).where(inArray(messagesTable.serviceId, allServiceIds));
    await db.delete(proposalsTable).where(inArray(proposalsTable.serviceId, allServiceIds));
    await db.delete(alertSessionsTable).where(inArray(alertSessionsTable.serviceId, allServiceIds));
    await db.delete(workerAlertSlotsTable).where(inArray(workerAlertSlotsTable.serviceId, allServiceIds));
    await db.delete(servicesTable).where(inArray(servicesTable.id, allServiceIds));
  }
  if (categoryIds.length) {
    await db.delete(categoriesTable).where(inArray(categoriesTable.id, categoryIds));
  }
  if (accountIds.length) {
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, accountIds));
    await db.delete(usersTable).where(inArray(usersTable.id, accountIds));
  }
}

async function createServiceFixture(
  client: TestAccount,
  categoryId: number,
  title: string,
  status: "pending" | "alerting" = "alerting",
): Promise<number> {
  const [service] = await db.insert(servicesTable).values({
    title,
    description: "Solicitud temporal de regresión de asignación.",
    status,
    clientId: client.id,
    categoryId,
    address: "Dirección de prueba",
    paymentMethod: "cash",
  }).returning({ id: servicesTable.id });
  serviceIds.push(service.id);
  return service.id;
}

async function createActiveAlertFixture(
  client: TestAccount,
  worker: TestAccount,
  categoryId: number,
  title: string,
): Promise<number> {
  const serviceId = await createServiceFixture(client, categoryId, title, "alerting");
  const now = new Date();
  const deliveryId = randomUUID();
  await db.insert(alertSessionsTable).values({
    serviceId,
    workerId: worker.id,
    sentAt: now,
    availableAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    deliveredAt: now,
    deliveryId,
    phase: "promax",
    response: "pending",
  });
  await db.insert(workerAlertSlotsTable).values({
    workerId: worker.id,
    serviceId,
    state: "pending",
    deliveryId,
  });
  return serviceId;
}

async function assertAssignmentClosesOtherAlerts(
  client: TestAccount,
  worker: TestAccount,
  categoryId: number,
  assignedServiceId: number,
  alertServiceIds: number[],
): Promise<void> {
  const [assignedService] = await db.select({
    status: servicesTable.status,
    workerId: servicesTable.workerId,
  }).from(servicesTable).where(eq(servicesTable.id, assignedServiceId)).limit(1);
  assert.equal(assignedService?.workerId, worker.id, "the accepted service must belong to the expected expert");
  assert.ok(
    assignedService?.status === "accepted" || assignedService?.status === "in_progress",
    "the accepted service must block further alert dispatch",
  );

  await waitUntil(
    () => alertServiceIds.every((serviceId) =>
      takenEventsByWorker.get(worker.id)?.some((event) => event.serviceId === serviceId)
    ),
    3_000,
    `${worker.name} did not receive service:taken for every other active card`,
  );
  for (const serviceId of alertServiceIds) {
    const [session] = await db.select().from(alertSessionsTable).where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.workerId, worker.id),
    )).limit(1);
    assert.equal(session?.response, "skipped", "every other active alert session must be closed");
    assert.ok(session?.respondedAt, "a closed alert session must record when it was closed");
  }
  const leftoverSlots = await db.select({ serviceId: workerAlertSlotsTable.serviceId })
    .from(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, worker.id));
  assert.deepEqual(leftoverSlots, [], "assignment must release every other alert reservation");

  const lateAlertServiceId = await createActiveAlertFixture(
    client,
    worker,
    categoryId,
    `${PREFIX}: alerta creada después de asignar`,
  );
  const beforeReplayCount = eventsByWorker.get(worker.id)?.length ?? 0;
  socketsByWorker.get(worker.id)?.emit("service:replay_active_alerts");
  await sleep(500);
  assert.equal(
    (eventsByWorker.get(worker.id)?.length ?? 0) - beforeReplayCount,
    0,
    "an expert with an active job must not receive alerts after replay",
  );
  const [lateSession] = await db.select().from(alertSessionsTable).where(and(
    eq(alertSessionsTable.serviceId, lateAlertServiceId),
    eq(alertSessionsTable.workerId, worker.id),
  )).limit(1);
  assert.equal(lateSession?.response, "skipped", "replay must invalidate stale sessions while the worker is busy");
  assert.equal(
    (await db.select({ serviceId: workerAlertSlotsTable.serviceId })
      .from(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, worker.id))).length,
    0,
    "a busy worker must not retain a reservation after alert replay",
  );
}

async function main(): Promise<void> {
  await verifyUnauthenticatedSocketStatus();

  const [category] = await db.select({
    id: categoriesTable.id,
  }).from(categoriesTable).where(and(
    eq(categoriesTable.isActive, true),
    eq(categoriesTable.platform, "expertos"),
  )).limit(1);
  assert.ok(category, "an active Expertos category is needed for the test");
  const [parallelCategory] = await db.insert(categoriesTable).values({
    name: `${PREFIX}: categoría de alertas simultáneas`,
    platform: "expertos",
  }).returning({ id: categoriesTable.id });
  const [otherCategory] = await db.insert(categoriesTable).values({
    name: `${PREFIX}: categoría distinta`,
    platform: "expertos",
  }).returning({ id: categoriesTable.id });
  categoryIds.push(parallelCategory.id, otherCategory.id);

  const planRows = await db.select({
    code: subscriptionPlansTable.code,
  }).from(subscriptionPlansTable).where(inArray(subscriptionPlansTable.code, [PROMAX_PLAN, PRO_PLAN, FREE_PLAN]));
  const availablePlans = new Set(planRows.map((row) => row.code));
  assert.ok(availablePlans.has(PROMAX_PLAN), `subscription plan ${PROMAX_PLAN} is missing`);
  assert.ok(availablePlans.has(PRO_PLAN), `subscription plan ${PRO_PLAN} is missing`);
  assert.ok(availablePlans.has(FREE_PLAN), `subscription plan ${FREE_PLAN} is missing`);

  const client = await createAccount("Cliente de prueba de alertas", "client", 0);
  const proMax = await createAccount("Experto Pro Max de prueba", "worker", 1);
  const pro = await createAccount("Experto Pro de prueba", "worker", 2);
  const free = await createAccount("Experto Gratis de prueba", "worker", 3);
  const workers = [proMax, pro, free];
  const simultaneousProMax = await createAccount("Experto Pro Max simultáneo", "worker", 7);
  const outsideRadiusProMax = await createAccount("Experto Pro Max fuera del radio", "worker", 8);
  const missingLocationProMax = await createAccount("Experto Pro Max sin coordenadas", "worker", 9);
  const otherCategoryProMax = await createAccount("Experto Pro Max de otra categoría", "worker", 10);

  for (const worker of workers) {
    await db.insert(workerCategoriesTable).values({
      workerId: worker.id,
      categoryId: category.id,
      isPrimary: true,
    });
  }
  for (const worker of [simultaneousProMax, outsideRadiusProMax, missingLocationProMax]) {
    await db.insert(workerCategoriesTable).values({
      workerId: worker.id,
      categoryId: parallelCategory.id,
      isPrimary: true,
    });
  }
  await db.insert(workerCategoriesTable).values({
    workerId: otherCategoryProMax.id,
    categoryId: otherCategory.id,
    isPrimary: true,
  });
  await db.update(usersTable).set({
    lat: 0,
    lng: 0,
    alertRadiusKm: 20,
  }).where(eq(usersTable.id, simultaneousProMax.id));
  await db.update(usersTable).set({
    lat: 1,
    lng: 0,
    alertRadiusKm: 5,
  }).where(eq(usersTable.id, outsideRadiusProMax.id));
  await db.update(usersTable).set({
    lat: null,
    lng: null,
    alertRadiusKm: 5,
  }).where(eq(usersTable.id, missingLocationProMax.id));
  await db.update(usersTable).set({
    lat: 0,
    lng: 0,
    alertRadiusKm: 20,
  }).where(eq(usersTable.id, otherCategoryProMax.id));

  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const olderPeriodStart = new Date(periodStart.getTime() - 60_000);
  const olderPeriodEnd = new Date(periodEnd.getTime() - 60_000);
  await db.insert(userSubscriptionsTable).values([
    {
      userId: proMax.id,
      planCode: PROMAX_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      createdAt: periodStart,
    },
    {
      userId: proMax.id,
      planCode: FREE_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: olderPeriodStart,
      currentPeriodEnd: olderPeriodEnd,
      createdAt: olderPeriodStart,
    },
    {
      userId: pro.id,
      planCode: PRO_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    ...[
      simultaneousProMax,
      outsideRadiusProMax,
      missingLocationProMax,
      otherCategoryProMax,
    ].map((worker) => ({
      userId: worker.id,
      planCode: PROMAX_PLAN,
      status: "active" as const,
      interval: "monthly" as const,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })),
  ]);

  for (const worker of workers) {
    socketsByWorker.set(worker.id, await connectWorker(worker));
  }
  for (const worker of [
    simultaneousProMax,
    outsideRadiusProMax,
    missingLocationProMax,
    otherCategoryProMax,
  ]) {
    socketsByWorker.set(worker.id, await connectWorker(worker));
  }

  const simultaneousServiceIds = await Promise.all([
    createServiceRequest(client, parallelCategory.id, `${PREFIX}: radio cercano uno`, { lat: 0.1, lng: 0 }),
    createServiceRequest(client, parallelCategory.id, `${PREFIX}: radio cercano dos`, { lat: 0.12, lng: 0 }),
    createServiceRequest(client, parallelCategory.id, `${PREFIX}: solicitud sin coordenadas`),
  ]);
  await waitUntil(
    () => simultaneousServiceIds.every((serviceId) =>
      eventsByWorker.get(simultaneousProMax.id)?.some((event) => event.serviceId === serviceId)
    ),
    8_000,
    "Pro Max did not receive all eligible requests at the same time",
  );
  await waitUntil(
    () => simultaneousServiceIds.every((serviceId) =>
      eventsByWorker.get(missingLocationProMax.id)?.some((event) => event.serviceId === serviceId)
    ),
    8_000,
    "Pro Max without coordinates did not receive all eligible requests",
  );
  await waitUntil(
    () => eventsByWorker.get(outsideRadiusProMax.id)?.some(
      (event) => event.serviceId === simultaneousServiceIds[2],
    ) ?? false,
    8_000,
    "a Pro Max expert must still receive a request without service coordinates",
  );
  const simultaneousEvents = eventsByWorker.get(simultaneousProMax.id)!
    .filter((event) => simultaneousServiceIds.includes(event.serviceId));
  assert.equal(simultaneousEvents.length, simultaneousServiceIds.length);
  assert.ok(simultaneousEvents.every((event) => event.phase === "promax"));
  assert.ok(
    simultaneousEvents.every((event) => Number.isInteger(event.totalSeconds) && event.totalSeconds! > 0),
    "each active card must include its own remaining timer",
  );
  assert.equal(
    eventsByWorker.get(missingLocationProMax.id)?.filter((event) =>
      simultaneousServiceIds.includes(event.serviceId)
    ).length,
    simultaneousServiceIds.length,
    "a Pro Max expert without coordinates must still receive eligible requests",
  );
  assert.equal(
    eventsByWorker.get(missingLocationProMax.id)?.find(
      (event) => event.serviceId === simultaneousServiceIds[0],
    )?.distanceKm,
    null,
    "an alert for an expert without coordinates must not invent a distance",
  );
  assert.equal(
    eventsByWorker.get(outsideRadiusProMax.id)?.some((event) =>
      simultaneousServiceIds.slice(0, 2).includes(event.serviceId)
    ),
    false,
    "a Pro Max expert outside the profile radius must not receive located requests",
  );
  assert.equal(
    eventsByWorker.get(otherCategoryProMax.id)?.some((event) =>
      simultaneousServiceIds.includes(event.serviceId)
    ),
    false,
    "a Pro Max expert in another category must not receive these requests",
  );
  const [outsideRadiusSessions, otherCategorySessions, activeParallelSlots] = await Promise.all([
    db.select({ id: alertSessionsTable.id }).from(alertSessionsTable).where(and(
      eq(alertSessionsTable.workerId, outsideRadiusProMax.id),
      inArray(alertSessionsTable.serviceId, simultaneousServiceIds.slice(0, 2)),
    )),
    db.select({ id: alertSessionsTable.id }).from(alertSessionsTable).where(and(
      eq(alertSessionsTable.workerId, otherCategoryProMax.id),
      inArray(alertSessionsTable.serviceId, simultaneousServiceIds),
    )),
    db.select({ serviceId: workerAlertSlotsTable.serviceId }).from(workerAlertSlotsTable).where(and(
      eq(workerAlertSlotsTable.workerId, simultaneousProMax.id),
      inArray(workerAlertSlotsTable.serviceId, simultaneousServiceIds),
    )),
  ]);
  assert.equal(outsideRadiusSessions.length, 0, "outside-radius requests must not create alert sessions");
  assert.equal(otherCategorySessions.length, 0, "ineligible categories must not create alert sessions");
  assert.deepEqual(
    activeParallelSlots.map((slot) => slot.serviceId).sort((a, b) => a - b),
    [...simultaneousServiceIds].sort((a, b) => a - b),
    "each simultaneous request must hold its own alert reservation",
  );

  const simultaneousHeaders = {
    Authorization: `Bearer ${signToken({
      id: simultaneousProMax.id,
      email: simultaneousProMax.email,
      role: simultaneousProMax.role,
    })}`,
  };
  const omittedServiceId = simultaneousServiceIds[0];
  const omitResponse = await fetch(`${BASE_URL}/api/alert-sessions/${omittedServiceId}/skip`, {
    method: "PATCH",
    headers: simultaneousHeaders,
  });
  assert.equal(omitResponse.status, 200, `Pro Max could not omit one alert: ${await omitResponse.text()}`);
  const [omittedSession] = await db.select().from(alertSessionsTable).where(and(
    eq(alertSessionsTable.serviceId, omittedServiceId),
    eq(alertSessionsTable.workerId, simultaneousProMax.id),
  )).limit(1);
  assert.equal(omittedSession?.response, "skipped");
  const remainingParallelSlots = await db.select({ serviceId: workerAlertSlotsTable.serviceId })
    .from(workerAlertSlotsTable).where(and(
      eq(workerAlertSlotsTable.workerId, simultaneousProMax.id),
      inArray(workerAlertSlotsTable.serviceId, simultaneousServiceIds),
    ));
  assert.deepEqual(
    remainingParallelSlots.map((slot) => slot.serviceId).sort((a, b) => a - b),
    simultaneousServiceIds.slice(1).sort((a, b) => a - b),
    "omitting one request must leave the other active alert reservations untouched",
  );
  for (const serviceId of simultaneousServiceIds.slice(1)) {
    const releaseResponse = await fetch(`${BASE_URL}/api/alert-sessions/${serviceId}/skip`, {
      method: "PATCH",
      headers: simultaneousHeaders,
    });
    assert.equal(releaseResponse.status, 200, `Pro Max could not clear test alert ${serviceId}`);
  }
  const clearedParallelSlots = await db.select({ serviceId: workerAlertSlotsTable.serviceId })
    .from(workerAlertSlotsTable).where(eq(workerAlertSlotsTable.workerId, simultaneousProMax.id));
  assert.equal(clearedParallelSlots.length, 0, "clearing test alerts must release their reservations");

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
  assert.ok(proMaxEvent.deliveryId, "the active alert must have a delivery ID");
  await waitUntil(
    () => acceptedReceiptsByWorker.get(proMax.id)?.includes(proMaxEvent.deliveryId!) ?? false,
    3_000,
    "the server did not confirm the authenticated recipient's alert receipt",
  );

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

  /*
   * Legacy FIFO-only coverage below assumed Pro Max could hold only one
   * simultaneous alert. The active multi-alert behavior is covered above.
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

  */

  const releaseReviewedAlert = await fetch(`${BASE_URL}/api/alert-sessions/${serviceId}/release`, {
    method: "PATCH",
    headers: workerHeaders,
  });
  assert.equal(
    releaseReviewedAlert.status,
    200,
    `Pro Max could not release the reviewed alert: ${await releaseReviewedAlert.text()}`,
  );

  const firstTimeoutServiceId = await createServiceRequest(
    client,
    category.id,
    `${PREFIX}: alerta simultánea que vence primero`,
  );
  await waitUntil(
    () => eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === firstTimeoutServiceId) ?? false,
    6_000,
    "Pro Max did not receive the first independent timeout alert",
  );
  const [firstTimeoutSession] = await db.select().from(alertSessionsTable).where(and(
    eq(alertSessionsTable.serviceId, firstTimeoutServiceId),
    eq(alertSessionsTable.workerId, proMax.id),
  )).limit(1);
  assert.ok(firstTimeoutSession?.expiresAt, "the first active alert must have its own expiry deadline");

  await sleep(2_500);
  const secondTimeoutServiceId = await createServiceRequest(
    client,
    category.id,
    `${PREFIX}: alerta simultánea que vence después`,
  );
  await waitUntil(
    () => eventsByWorker.get(proMax.id)?.some((event) => event.serviceId === secondTimeoutServiceId) ?? false,
    6_000,
    "Pro Max did not receive a second alert before the first one expired",
  );
  const [secondTimeoutSession] = await db.select().from(alertSessionsTable).where(and(
    eq(alertSessionsTable.serviceId, secondTimeoutServiceId),
    eq(alertSessionsTable.workerId, proMax.id),
  )).limit(1);
  assert.ok(secondTimeoutSession?.expiresAt, "the second active alert must have its own expiry deadline");
  assert.ok(
    secondTimeoutSession.expiresAt.getTime() > firstTimeoutSession.expiresAt.getTime(),
    "alerts created at different times must keep independent expiry deadlines",
  );

  const timeoutSlots = await db.select({ serviceId: workerAlertSlotsTable.serviceId })
    .from(workerAlertSlotsTable).where(and(
      eq(workerAlertSlotsTable.workerId, proMax.id),
      inArray(workerAlertSlotsTable.serviceId, [firstTimeoutServiceId, secondTimeoutServiceId]),
    ));
  assert.deepEqual(
    timeoutSlots.map((slot) => slot.serviceId).sort((a, b) => a - b),
    [firstTimeoutServiceId, secondTimeoutServiceId].sort((a, b) => a - b),
    "both timeout alerts must hold independent reservations",
  );

  await waitUntil(
    () => expiredEventsByWorker.get(proMax.id)?.some(
      (event) => event.serviceId === firstTimeoutServiceId,
    ) ?? false,
    Math.max(6_000, firstTimeoutSession.expiresAt.getTime() - Date.now() + 6_000),
    "Pro Max did not receive the first alert's expiration event",
  );
  const [expiredFirstTimeoutSession, stillActiveTimeoutSession] = await Promise.all([
    db.select().from(alertSessionsTable).where(and(
      eq(alertSessionsTable.serviceId, firstTimeoutServiceId),
      eq(alertSessionsTable.workerId, proMax.id),
    )).limit(1).then((rows) => rows[0]),
    db.select().from(alertSessionsTable).where(and(
      eq(alertSessionsTable.serviceId, secondTimeoutServiceId),
      eq(alertSessionsTable.workerId, proMax.id),
    )).limit(1).then((rows) => rows[0]),
  ]);
  assert.equal(expiredFirstTimeoutSession?.response, "skipped");
  assert.equal(stillActiveTimeoutSession?.response, "pending");
  assert.equal(
    expiredEventsByWorker.get(proMax.id)?.some((event) => event.serviceId === secondTimeoutServiceId),
    false,
    "expiring one card must not expire another card early",
  );
  assert.ok(
    (await db.select({ serviceId: workerAlertSlotsTable.serviceId })
      .from(workerAlertSlotsTable).where(and(
        eq(workerAlertSlotsTable.workerId, proMax.id),
        eq(workerAlertSlotsTable.serviceId, secondTimeoutServiceId),
      ))).length,
    "the second alert reservation must remain active after the first expires",
  );
  await waitUntil(
    () => expiredEventsByWorker.get(proMax.id)?.some(
      (event) => event.serviceId === secondTimeoutServiceId,
    ) ?? false,
    Math.max(6_000, secondTimeoutSession.expiresAt.getTime() - Date.now() + 6_000),
    "Pro Max did not receive the second alert's independent expiration event",
  );

  const switchedAdmin = await createAccount("Admin en modo experto de prueba", "admin", 4);
  const adminModeOff = await createAccount("Admin fuera del modo experto de prueba", "admin", 5);
  const unavailableAdmin = await createAccount("Admin experto no disponible de prueba", "admin", 6);
  for (const admin of [switchedAdmin, adminModeOff, unavailableAdmin]) {
    await db.insert(workerCategoriesTable).values({
      workerId: admin.id,
      categoryId: category.id,
      isPrimary: true,
    });
    await db.insert(userSubscriptionsTable).values({
      userId: admin.id,
      planCode: PROMAX_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
  }
  await db.update(usersTable).set({ isAvailable: false }).where(eq(usersTable.id, unavailableAdmin.id));

  socketsByWorker.set(switchedAdmin.id, await connectWorker(switchedAdmin, "worker", "admin"));
  socketsByWorker.set(adminModeOff.id, await connectWorker(adminModeOff, "admin"));
  socketsByWorker.set(unavailableAdmin.id, await connectWorker(unavailableAdmin, "worker", "admin"));
  const adminModeResponse = await fetch(`${BASE_URL}/api/services`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
    body: JSON.stringify({
      title: `${PREFIX}: alerta a administrador en modo experto`,
      description: "Solicitud temporal para verificar el rol activo de un administrador.",
      categoryId: category.id,
      address: "Dirección de prueba",
      paymentMethod: "cash",
      budgetNote: "Presupuesto visible para el experto activo",
    }),
  });
  const adminModeText = await adminModeResponse.text();
  assert.equal(
    adminModeResponse.status,
    201,
    `admin-mode service creation failed: ${adminModeResponse.status} ${adminModeText}`,
  );
  const adminModeCreated = JSON.parse(adminModeText) as { id?: number; service?: { id?: number } };
  const adminModeServiceId = adminModeCreated.id ?? adminModeCreated.service?.id;
  assert.ok(adminModeServiceId, "admin-mode service response must include its ID");
  serviceIds.push(adminModeServiceId);

  await waitUntil(
    () => eventsByWorker.get(switchedAdmin.id)?.some((event) => event.serviceId === adminModeServiceId) ?? false,
    6_000,
    "admin switched to worker mode did not receive the active alert",
  );
  const switchedAdminEvent = eventsByWorker.get(switchedAdmin.id)!
    .find((event) => event.serviceId === adminModeServiceId)!;
  assert.equal(switchedAdminEvent.phase, "promax");
  assert.equal(
    eventsByWorker.get(adminModeOff.id)?.some((event) => event.serviceId === adminModeServiceId) ?? false,
    false,
    "an admin outside worker mode must not receive the active alert",
  );
  assert.equal(
    eventsByWorker.get(unavailableAdmin.id)?.some((event) => event.serviceId === adminModeServiceId) ?? false,
    false,
    "an admin in worker mode but unavailable must not receive the active alert",
  );

  const adminViewResponse = await fetch(`${BASE_URL}/api/alert-sessions/${adminModeServiceId}/view`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${signToken({
        id: switchedAdmin.id,
        email: switchedAdmin.email,
        role: "worker",
        originalRole: "admin",
      })}`,
    },
  });
  assert.equal(
    adminViewResponse.status,
    200,
    `admin in worker mode could not engage the received alert: ${await adminViewResponse.text()}`,
  );

  const acceptanceWorkers = [
    await createAccount("Experto aceptación directa", "worker", 11),
    await createAccount("Experto aceptación de propuesta", "worker", 12),
    await createAccount("Experto aceptación de contraoferta", "worker", 13),
  ];
  const acceptanceCategories: number[] = [];
  for (const [index, worker] of acceptanceWorkers.entries()) {
    const [acceptanceCategory] = await db.insert(categoriesTable).values({
      name: `${PREFIX}: categoría de aceptación ${index + 1}`,
      platform: "expertos",
    }).returning({ id: categoriesTable.id });
    acceptanceCategories.push(acceptanceCategory.id);
    categoryIds.push(acceptanceCategory.id);
    await db.insert(workerCategoriesTable).values({
      workerId: worker.id,
      categoryId: acceptanceCategory.id,
      isPrimary: true,
    });
    await db.insert(userSubscriptionsTable).values({
      userId: worker.id,
      planCode: PROMAX_PLAN,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
    await db.update(usersTable).set({
      visitFee: 100,
      payoutBankName: "Banco de prueba",
      payoutBankAccountType: "checking",
      payoutBankAccountNumber: `test-${worker.id}`,
      payoutBankRut: `test-${worker.id}`,
    }).where(eq(usersTable.id, worker.id));
    socketsByWorker.set(worker.id, await connectWorker(worker));
  }

  const directAlertIds = await Promise.all([
    createServiceRequest(client, acceptanceCategories[0], `${PREFIX}: alerta directa uno`),
    createServiceRequest(client, acceptanceCategories[0], `${PREFIX}: alerta directa dos`),
  ]);
  await waitUntil(
    () => directAlertIds.every((serviceId) =>
      eventsByWorker.get(acceptanceWorkers[0].id)?.some((event) => event.serviceId === serviceId)
    ),
    8_000,
    "the direct-acceptance expert did not receive both active alert cards",
  );
  const directAssignmentId = await createServiceFixture(
    client,
    acceptanceCategories[0],
    `${PREFIX}: trabajo de aceptación directa`,
    "pending",
  );
  const directAcceptResponse = await fetch(`${BASE_URL}/api/services/${directAssignmentId}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signToken({
        id: acceptanceWorkers[0].id,
        email: acceptanceWorkers[0].email,
        role: acceptanceWorkers[0].role,
      })}`,
    },
  });
  assert.equal(
    directAcceptResponse.status,
    200,
    `direct acceptance failed: ${await directAcceptResponse.text()}`,
  );
  await assertAssignmentClosesOtherAlerts(
    client,
    acceptanceWorkers[0],
    acceptanceCategories[0],
    directAssignmentId,
    directAlertIds,
  );

  const proposalAlertIds = await Promise.all([
    createServiceRequest(client, acceptanceCategories[1], `${PREFIX}: alerta de propuesta uno`),
    createServiceRequest(client, acceptanceCategories[1], `${PREFIX}: alerta de propuesta dos`),
  ]);
  await waitUntil(
    () => proposalAlertIds.every((serviceId) =>
      eventsByWorker.get(acceptanceWorkers[1].id)?.some((event) => event.serviceId === serviceId)
    ),
    8_000,
    "the proposal-acceptance expert did not receive both active alert cards",
  );
  const proposalAssignmentId = await createServiceFixture(
    client,
    acceptanceCategories[1],
    `${PREFIX}: trabajo aceptado desde propuesta`,
  );
  const [proposal] = await db.insert(proposalsTable).values({
    serviceId: proposalAssignmentId,
    workerId: acceptanceWorkers[1].id,
    status: "worker_accepted",
    message: "Propuesta temporal de regresión.",
  }).returning({ id: proposalsTable.id });
  const proposalAcceptResponse = await fetch(`${BASE_URL}/api/proposals/${proposal.id}/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
  });
  assert.equal(
    proposalAcceptResponse.status,
    200,
    `proposal acceptance failed: ${await proposalAcceptResponse.text()}`,
  );
  await assertAssignmentClosesOtherAlerts(
    client,
    acceptanceWorkers[1],
    acceptanceCategories[1],
    proposalAssignmentId,
    proposalAlertIds,
  );

  const counterAlertIds = await Promise.all([
    createServiceRequest(client, acceptanceCategories[2], `${PREFIX}: alerta de contraoferta uno`),
    createServiceRequest(client, acceptanceCategories[2], `${PREFIX}: alerta de contraoferta dos`),
  ]);
  await waitUntil(
    () => counterAlertIds.every((serviceId) =>
      eventsByWorker.get(acceptanceWorkers[2].id)?.some((event) => event.serviceId === serviceId)
    ),
    8_000,
    "the counter-acceptance expert did not receive both active alert cards",
  );
  const counterAssignmentId = await createServiceFixture(
    client,
    acceptanceCategories[2],
    `${PREFIX}: trabajo aceptado desde contraoferta`,
  );
  const [counterProposal] = await db.insert(proposalsTable).values({
    serviceId: counterAssignmentId,
    workerId: acceptanceWorkers[2].id,
    status: "countered",
    lastCounterBy: "worker",
    message: "Contraoferta temporal de regresión.",
  }).returning({ id: proposalsTable.id });
  const counterAcceptResponse = await fetch(`${BASE_URL}/api/proposals/${counterProposal.id}/accept-counter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signToken({ id: client.id, email: client.email, role: client.role })}`,
    },
  });
  assert.equal(
    counterAcceptResponse.status,
    200,
    `counter-offer acceptance failed: ${await counterAcceptResponse.text()}`,
  );
  await assertAssignmentClosesOtherAlerts(
    client,
    acceptanceWorkers[2],
    acceptanceCategories[2],
    counterAssignmentId,
    counterAlertIds,
  );

  console.log("Service alert real-time flow passed: alert eligibility, concurrent alerts and timers, role gating, replay, and direct/proposal assignment cleanup.");
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
