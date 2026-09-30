/**
 * Test e2e del bug: mensajes enviados después de aceptar propuesta
 * se guardaban con worker_id NULL y desaparecían del historial.
 */
import { db, usersTable, servicesTable, messagesTable, categoriesTable } from "../server/db";
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
  let pendingServiceId = 0, cancelledServiceId = 0;
  let createdCategory = false;

  try {
    // ── Setup ──────────────────────────────────────────────────────
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
    if (existingCat.length) {
      categoryId = existingCat[0].id;
    } else {
      const [cat] = await db.insert(categoriesTable).values({ name: `TestCat${stamp}` } as any)
        .returning({ id: categoriesTable.id });
      categoryId = cat.id; createdCategory = true;
    }

    // Servicio YA ASIGNADO (post-aceptación de propuesta)
    const [svc] = await db.insert(servicesTable).values({
      title: "Test servicio", description: "test", status: "in_progress",
      clientId, workerId, categoryId,
    } as any).returning({ id: servicesTable.id });
    serviceId = svc.id;

    const clientToken = signToken({ id: clientId, email: `test-cli-${stamp}@test.local`, role: "client" });
    const workerToken = signToken({ id: workerId, email: `test-wrk-${stamp}@test.local`, role: "worker" });

    // ── 1. Cliente envía mensaje post-aceptación (SIN workerId en body) ──
    const send1 = await api(`/api/services/${serviceId}/messages`, clientToken, {
      method: "POST", body: JSON.stringify({ content: "hola post-aceptacion (cliente)" }),
    });
    console.log("POST cliente:", send1.status, "worker_id guardado =", send1.body?.workerId);

    // ── 2. Experto envía mensaje post-aceptación ──
    const send2 = await api(`/api/services/${serviceId}/messages`, workerToken, {
      method: "POST", body: JSON.stringify({ content: "hola post-aceptacion (experto)" }),
    });
    console.log("POST experto:", send2.status, "worker_id guardado =", send2.body?.workerId);

    // ── 3. Historial visto por el CLIENTE ──
    const histClient = await api(`/api/services/${serviceId}/messages`, clientToken);
    const clientMsgs = ((histClient.body?.messages) || []).map((m: any) => m.content);
    console.log("Historial CLIENTE:", histClient.status, clientMsgs);

    // ── 4. Historial visto por el EXPERTO ──
    const histWorker = await api(`/api/services/${serviceId}/messages`, workerToken);
    const workerMsgs = ((histWorker.body?.messages) || []).map((m: any) => m.content);
    console.log("Historial EXPERTO:", histWorker.status, workerMsgs);

    // ── 4b. Cliente completa el trabajo → mensaje de sistema en el hilo ──
    const completeRes = await api(`/api/services/${serviceId}/complete`, clientToken, { method: "POST" });
    const histAfterComplete = await api(`/api/services/${serviceId}/messages`, workerToken);
    const afterMsgs = ((histAfterComplete.body?.messages) || []);
    const sysMsg = afterMsgs.find((m: any) => m.messageType === "system" && String(m.content).includes("completado"));
    console.log("POST complete:", completeRes.status, "| sistema en hilo:", sysMsg ? `workerId=${sysMsg.workerId}` : "NO ENCONTRADO");

    // ── 5. Servicio PENDIENTE: cliente sin workerId debe recibir 400 ──
    const [svcPend] = await db.insert(servicesTable).values({
      title: "Test pendiente", description: "test", status: "pending",
      clientId, categoryId,
    } as any).returning({ id: servicesTable.id });
    pendingServiceId = svcPend.id;

    const sendNoWorker = await api(`/api/services/${pendingServiceId}/messages`, clientToken, {
      method: "POST", body: JSON.stringify({ content: "sin workerId" }),
    });
    console.log("POST pendiente sin workerId:", sendNoWorker.status, sendNoWorker.body?.error ?? "");

    // ── 6. Servicio PENDIENTE: cliente con workerId → 201 y el experto lo ve ──
    const sendPend = await api(`/api/services/${pendingServiceId}/messages`, clientToken, {
      method: "POST", body: JSON.stringify({ content: "hola fase pendiente", workerId }),
    });
    const histPendWorker = await api(`/api/services/${pendingServiceId}/messages`, workerToken);
    const pendMsgs = ((histPendWorker.body?.messages) || []).map((m: any) => m.content);
    console.log("POST pendiente con workerId:", sendPend.status, "| historial experto:", pendMsgs);

    // ── 7. Servicio cancelado SIN asignar: envío debe recibir 409 ──
    const [svcCancel] = await db.insert(servicesTable).values({
      title: "Test cancelado", description: "test", status: "cancelled",
      clientId, categoryId,
    } as any).returning({ id: servicesTable.id });
    cancelledServiceId = svcCancel.id;
    const sendCancel = await api(`/api/services/${cancelledServiceId}/messages`, clientToken, {
      method: "POST", body: JSON.stringify({ content: "no deberia guardarse" }),
    });
    console.log("POST cancelado sin experto:", sendCancel.status, sendCancel.body?.error ?? "");

    // ── Verificación ──
    const okDb = send1.body?.workerId === workerId && send2.body?.workerId === workerId;
    const okClient = clientMsgs.length === 2;
    const okWorker = workerMsgs.length === 2;
    const okComplete = completeRes.status === 200 && !!sysMsg && sysMsg.workerId === workerId;
    const okPendValidation = sendNoWorker.status === 400;
    const okPendFlow = sendPend.status === 201 && pendMsgs.includes("hola fase pendiente");
    const okCancelBlock = sendCancel.status === 409;
    console.log("\n=== RESULTADO ===");
    console.log(okDb ? "✅ worker_id persistido correctamente en ambos mensajes" : "❌ worker_id NO persistido");
    console.log(okClient ? "✅ Cliente ve los 2 mensajes en historial" : `❌ Cliente ve ${clientMsgs.length}/2`);
    console.log(okWorker ? "✅ Experto ve los 2 mensajes en historial" : `❌ Experto ve ${workerMsgs.length}/2`);
    console.log(okComplete ? "✅ Al completar: mensaje de sistema en el hilo del experto" : "❌ Falta mensaje de sistema al completar");
    console.log(okPendValidation ? "✅ Pendiente sin workerId → 400" : `❌ Pendiente sin workerId → ${sendNoWorker.status}`);
    console.log(okPendFlow ? "✅ Flujo pendiente intacto (201 + visible para experto)" : `❌ Flujo pendiente roto (${sendPend.status})`);
    console.log(okCancelBlock ? "✅ Cancelado sin experto → 409" : `❌ Cancelado sin experto → ${sendCancel.status}`);
    if (!okDb || !okClient || !okWorker || !okComplete || !okPendValidation || !okPendFlow || !okCancelBlock) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR durante el test:", e);
    process.exitCode = 1;
  } finally {
    // ── Cleanup ──
    try {
      for (const sid of [serviceId, pendingServiceId, cancelledServiceId].filter(Boolean)) {
        await db.delete(messagesTable).where(eq(messagesTable.serviceId, sid));
        await db.delete(servicesTable).where(eq(servicesTable.id, sid));
      }
      const uids = [clientId, workerId].filter(Boolean);
      if (uids.length) {
        try {
          const mod: any = await import("../server/db");
          if (mod.notificationsTable) {
            await db.delete(mod.notificationsTable).where(inArray(mod.notificationsTable.userId, uids));
          }
        } catch { /* tabla puede no existir */ }
        await db.delete(usersTable).where(inArray(usersTable.id, uids));
      }
      if (createdCategory && categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
    } catch (e) {
      console.error("ERROR en cleanup:", e);
    }
    process.exit(process.exitCode || 0);
  }
}

main().catch((e) => { console.error("Test falló:", e); process.exit(1); });
