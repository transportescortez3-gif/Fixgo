/**
 * Repro de 3 bugs reportados (jul-2026):
 *  A. Aceptar propuesta → agreement/ubicación debe persistir en historial de ambos.
 *  B. Cancelar servicio → el POST de mensajes debería rechazarse (hoy NO se rechaza).
 *  C. Flags/estado del historial tras cancelación.
 */
import { db, usersTable, servicesTable, messagesTable, categoriesTable, proposalsTable } from "../server/db";
import { signToken, hashPassword } from "../server/lib/auth";
import { eq, inArray } from "drizzle-orm";

const BASE = "http://127.0.0.1:5000";

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  const stamp = Date.now();
  let clientId = 0, workerId = 0, serviceId = 0, categoryId = 0;
  let createdCategory = false;

  try {
    const [client] = await db.insert(usersTable).values({
      name: "TestCliente", email: `test-cli-${stamp}@test.local`,
      password: hashPassword("test1234"), role: "client", emailVerified: true,
    } as any).returning({ id: usersTable.id });
    const [worker] = await db.insert(usersTable).values({
      name: "TestExperto", email: `test-wrk-${stamp}@test.local`,
      password: hashPassword("test1234"), role: "worker", emailVerified: true,
    } as any).returning({ id: usersTable.id });
    clientId = client.id; workerId = worker.id;

    const existingCat = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
    if (existingCat.length) { categoryId = existingCat[0].id; }
    else {
      const [cat] = await db.insert(categoriesTable).values({ name: `TestCat${stamp}` } as any)
        .returning({ id: categoriesTable.id });
      categoryId = cat.id; createdCategory = true;
    }

    // Servicio PENDIENTE + propuesta del experto
    const [svc] = await db.insert(servicesTable).values({
      title: "Test bugs", description: "test", status: "pending",
      clientId, categoryId,
    } as any).returning({ id: servicesTable.id });
    serviceId = svc.id;
    const [prop] = await db.insert(proposalsTable).values({
      serviceId, workerId, status: "pending", proposedPrice: null,
    } as any).returning({ id: proposalsTable.id });

    const clientToken = signToken({ id: clientId, email: `test-cli-${stamp}@test.local`, role: "client" });
    const workerToken = signToken({ id: workerId, email: `test-wrk-${stamp}@test.local`, role: "worker" });

    // ── A. Cliente acepta propuesta y envía agreement (como hace handleClientAccept) ──
    const accept = await api(`/api/proposals/${prop.id}/accept`, clientToken, { method: "POST" });
    console.log("A1) accept propuesta:", accept.status);

    const agreementContent = `__AGREEMENT__${JSON.stringify({ address: "Av. Test 123", lat: -33.4, lng: -70.6 })}`;
    const sendAgr = await api(`/api/services/${serviceId}/messages`, clientToken, {
      method: "POST",
      body: JSON.stringify({ content: agreementContent, messageType: "agreement", workerId }),
    });
    console.log("A2) POST agreement:", sendAgr.status, "worker_id =", sendAgr.body?.workerId, "messageType =", sendAgr.body?.messageType);

    const histC = await api(`/api/services/${serviceId}/messages`, clientToken);
    const histW = await api(`/api/services/${serviceId}/messages`, workerToken);
    const agrInClient = (histC.body?.messages || []).some((m: any) => String(m.content).startsWith("__AGREEMENT__"));
    const agrInWorker = (histW.body?.messages || []).some((m: any) => String(m.content).startsWith("__AGREEMENT__"));
    console.log("A3) agreement en historial CLIENTE:", agrInClient, "| EXPERTO:", agrInWorker);
    console.log("A3b) historial experto:", (histW.body?.messages || []).map((m: any) => `${m.messageType}:${String(m.content).slice(0, 30)}`));

    // ── B. Cliente cancela el servicio ──
    const cancel = await api(`/api/services/${serviceId}/cancel`, clientToken, { method: "POST" });
    console.log("B1) cancel:", cancel.status, "status =", cancel.body?.status);

    // Experto intenta seguir escribiendo (BUG: hoy se acepta)
    const postCancelMsg = await api(`/api/services/${serviceId}/messages`, workerToken, {
      method: "POST", body: JSON.stringify({ content: "hola despues de cancelado" }),
    });
    console.log("B2) POST experto tras cancelación:", postCancelMsg.status, postCancelMsg.body?.error ?? "(aceptado)");

    // Cliente también
    const postCancelMsg2 = await api(`/api/services/${serviceId}/messages`, clientToken, {
      method: "POST", body: JSON.stringify({ content: "cliente despues de cancelado" }),
    });
    console.log("B3) POST cliente tras cancelación:", postCancelMsg2.status, postCancelMsg2.body?.error ?? "(aceptado)");

    // Historial sigue legible tras cancelar
    const histW2 = await api(`/api/services/${serviceId}/messages`, workerToken);
    console.log("B4) GET historial experto tras cancelar:", histW2.status, "msgs =", (histW2.body?.messages || []).length);
  } finally {
    // Limpieza
    if (serviceId) {
      await db.delete(messagesTable).where(eq(messagesTable.serviceId, serviceId));
      await db.delete(proposalsTable).where(eq(proposalsTable.serviceId, serviceId));
      await db.delete(servicesTable).where(eq(servicesTable.id, serviceId));
    }
    if (clientId || workerId) {
      const { notificationsTable } = await import("../server/db") as any;
      try { if (notificationsTable) await db.delete(notificationsTable).where(inArray(notificationsTable.userId, [clientId, workerId].filter(Boolean))); } catch {}
      await db.delete(usersTable).where(inArray(usersTable.id, [clientId, workerId].filter(Boolean)));
    }
    if (createdCategory && categoryId) {
      await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
