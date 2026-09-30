import { Router } from "express";
import { db, cancellationChargesTable, servicesTable, usersTable, notificationsTable } from "../db";
import { categoriesTable } from "../db/schema";
import { eq, and, ne, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { createNotification } from "../lib/createNotification";
import { emitToUser } from "../lib/socketio";

/**
 * Cargos por cancelación tardía (visita técnica).
 *
 * IMPORTANTE (legal): Fixgo NO procesa ni verifica estos pagos. La app solo
 * muestra los datos de transferencia del experto (snapshot guardado al momento
 * de cancelar) y almacena el comprobante que sube el cliente como imagen.
 */
const router = Router();

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

// La nota interna de soporte y quién resolvió son SOLO para admins:
// nunca deben salir hacia cliente ni experto.
function stripAdminFields<T extends { adminNote?: unknown; resolvedByAdminId?: unknown }>(charge: T) {
  const { adminNote: _an, resolvedByAdminId: _ra, ...rest } = charge;
  return rest;
}

// Lista de cargos pendientes/en curso del usuario actual (como cliente o experto)
router.get("/cancellation-charges/my", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;

  const clientAlias = alias(usersTable, "counterpart_client");
  const workerAlias = alias(usersTable, "counterpart_worker");

  const asClient = await db.select({
    charge: cancellationChargesTable,
    serviceTitle: servicesTable.title,
    categoryName: categoriesTable.name,
    counterpartName: workerAlias.name,
  })
    .from(cancellationChargesTable)
    .innerJoin(servicesTable, eq(cancellationChargesTable.serviceId, servicesTable.id))
    .leftJoin(categoriesTable, eq(servicesTable.categoryId, categoriesTable.id))
    .innerJoin(workerAlias, eq(cancellationChargesTable.workerId, workerAlias.id))
    .where(and(eq(cancellationChargesTable.clientId, userId), ne(cancellationChargesTable.status, "settled"), ne(cancellationChargesTable.status, "voided")))
    .orderBy(desc(cancellationChargesTable.createdAt));

  const asWorker = await db.select({
    charge: cancellationChargesTable,
    serviceTitle: servicesTable.title,
    categoryName: categoriesTable.name,
    counterpartName: clientAlias.name,
  })
    .from(cancellationChargesTable)
    .innerJoin(servicesTable, eq(cancellationChargesTable.serviceId, servicesTable.id))
    .leftJoin(categoriesTable, eq(servicesTable.categoryId, categoriesTable.id))
    .innerJoin(clientAlias, eq(cancellationChargesTable.clientId, clientAlias.id))
    .where(and(eq(cancellationChargesTable.workerId, userId), ne(cancellationChargesTable.status, "settled"), ne(cancellationChargesTable.status, "voided")))
    .orderBy(desc(cancellationChargesTable.createdAt));

  res.json({
    asClient: asClient.map(r => {
      const { bankName, bankAccountType, bankAccountNumber, bankRut, ...rest } = stripAdminFields(r.charge);
      // El cliente SÍ necesita los datos de transferencia (es quien paga)
      return { ...rest, bankName, bankAccountType, bankAccountNumber, bankRut, serviceTitle: r.serviceTitle, categoryName: r.categoryName, counterpartName: r.counterpartName };
    }),
    asWorker: asWorker.map(r => {
      // El experto no necesita ver su propio snapshot bancario aquí
      const { bankName: _b, bankAccountType: _t, bankAccountNumber: _n, bankRut: _r, ...rest } = stripAdminFields(r.charge);
      return { ...rest, serviceTitle: r.serviceTitle, categoryName: r.categoryName, counterpartName: r.counterpartName };
    }),
  });
});

// Cargo de un servicio específico (solo participantes o admin)
router.get("/services/:id/cancellation-charge", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseId(req.params.id);
  const [charge] = await db.select().from(cancellationChargesTable)
    .where(eq(cancellationChargesTable.serviceId, serviceId)).limit(1);

  if (!charge) { res.status(404).json({ error: "No hay cargo para este servicio" }); return; }

  const isParticipant = charge.clientId === req.userId || charge.workerId === req.userId;
  if (!isParticipant && req.userRole !== "admin") {
    res.status(403).json({ error: "No tienes acceso a este cargo" });
    return;
  }

  // Admin ve la fila completa (incluida la nota interna)
  if (req.userRole === "admin") {
    res.json(charge);
    return;
  }
  // Los datos bancarios solo se exponen al cliente (quien debe transferir);
  // la nota interna de soporte no se expone a ningún participante.
  if (charge.workerId === req.userId) {
    const { bankName: _b, bankAccountType: _t, bankAccountNumber: _n, bankRut: _r, ...rest } = stripAdminFields(charge);
    res.json(rest);
    return;
  }
  res.json(stripAdminFields(charge));
});

// El cliente sube el comprobante de transferencia (imagen ya subida a storage)
router.post("/services/:id/cancellation-charge/receipt", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseId(req.params.id);
  const receiptUrl = typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl.trim() : "";
  // Solo se aceptan objetos subidos al storage propio de la app: nada de URLs
  // externas ("//host/...") ni rutas con "..".
  if (!receiptUrl.startsWith("/api/storage/objects/") || receiptUrl.includes("..")) {
    res.status(400).json({ error: "Comprobante inválido: debe ser una imagen subida a la app" });
    return;
  }

  const [charge] = await db.select().from(cancellationChargesTable)
    .where(eq(cancellationChargesTable.serviceId, serviceId)).limit(1);
  if (!charge) { res.status(404).json({ error: "No hay cargo para este servicio" }); return; }

  if (charge.clientId !== req.userId) {
    res.status(403).json({ error: "Solo el cliente puede subir el comprobante" });
    return;
  }
  if (charge.status === "settled") {
    res.status(400).json({ error: "Este cargo ya fue confirmado por el experto" });
    return;
  }
  if (charge.status === "disputed") {
    res.status(400).json({ error: "Este cargo está en revisión por soporte; contacta a soporte para continuar" });
    return;
  }
  if (charge.status === "voided") {
    res.status(400).json({ error: "Este cargo fue anulado por soporte; no necesitas pagarlo" });
    return;
  }

  // UPDATE condicional: no pisar un estado settled/disputed/voided que llegó en paralelo.
  const [updated] = await db.update(cancellationChargesTable).set({
    receiptUrl,
    receiptUploadedAt: new Date(),
    status: "receipt_uploaded",
  }).where(and(
    eq(cancellationChargesTable.id, charge.id),
    ne(cancellationChargesTable.status, "settled"),
    ne(cancellationChargesTable.status, "disputed"),
    ne(cancellationChargesTable.status, "voided"),
  )).returning();
  if (!updated) {
    res.status(409).json({ error: "El cargo cambió de estado, recarga la página" });
    return;
  }

  await createNotification({
    userId: charge.workerId,
    title: `Te corresponde tu visita técnica: $${charge.amount.toLocaleString("es-CL")}`,
    message: "El cliente subió el comprobante. Presiona aquí para confirmar el pago.",
    type: "cancellation_charge",
    relatedId: charge.serviceId,
    targetRole: "worker",
    highPriority: true,
  });
  emitToUser(charge.clientId, "cancellation_charge", { serviceId, action: "receipt_uploaded" });
  emitToUser(charge.workerId, "cancellation_charge", { serviceId, action: "receipt_uploaded" });

  const sanitized = stripAdminFields(updated);
  const { bankName: _b, bankAccountType: _t, bankAccountNumber: _n, bankRut: _r, ...safe } = sanitized;
  res.json(charge.clientId === req.userId ? sanitized : safe);
});

// El experto reporta que NO recibió el pago → el caso pasa a revisión de soporte.
// No bloquea al experto: puede seguir tomando trabajos mientras soporte revisa.
router.post("/services/:id/cancellation-charge/dispute", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseId(req.params.id);
  const [charge] = await db.select().from(cancellationChargesTable)
    .where(eq(cancellationChargesTable.serviceId, serviceId)).limit(1);
  if (!charge) { res.status(404).json({ error: "No hay cargo para este servicio" }); return; }

  if (charge.workerId !== req.userId) {
    res.status(403).json({ error: "Solo el experto puede reportar este cargo" });
    return;
  }
  if (charge.status === "settled") {
    res.status(400).json({ error: "Este cargo ya fue confirmado como pagado" });
    return;
  }
  if (charge.status === "disputed") { res.json({ ok: true }); return; }
  if (charge.status === "voided") {
    res.status(400).json({ error: "Este cargo fue anulado por soporte" });
    return;
  }
  // Solo se puede reportar si el cliente ya subió comprobante (y no llegó el
  // dinero) o si venció el plazo de 24h sin pago. Antes del plazo, el cliente
  // aún está dentro de su ventana para transferir.
  const deadlineExpired = Date.now() > new Date(charge.deadlineAt).getTime();
  if (charge.status === "pending" && !deadlineExpired) {
    res.status(400).json({ error: "El cliente aún está dentro del plazo de 24 horas para pagar" });
    return;
  }

  // UPDATE condicional: si en paralelo llegó un settle (u otro dispute), no
  // pisar ese estado — solo transiciona desde pending/receipt_uploaded.
  const [disputedRow] = await db.update(cancellationChargesTable).set({
    status: "disputed",
  }).where(and(
    eq(cancellationChargesTable.id, charge.id),
    ne(cancellationChargesTable.status, "settled"),
    ne(cancellationChargesTable.status, "disputed"),
    ne(cancellationChargesTable.status, "voided"),
  )).returning();
  if (!disputedRow) { res.json({ ok: true }); return; }

  await createNotification({
    userId: charge.clientId,
    title: "Caso en revisión por soporte",
    message: "El experto indicó que no recibió el pago de la visita técnica. Soporte está revisando el caso.",
    type: "cancellation_charge",
    relatedId: charge.serviceId,
    targetRole: "client",
    highPriority: true,
  });
  emitToUser(charge.clientId, "cancellation_charge", { serviceId, action: "disputed" });
  emitToUser(charge.workerId, "cancellation_charge", { serviceId, action: "disputed" });

  res.json({ ok: true });
});

// ── ADMIN: listado de cancelaciones con motivo (privado) y participantes ──
router.get("/admin/cancellations", authenticate, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  const clientUser = alias(usersTable, "client_user");
  const workerUser = alias(usersTable, "worker_user");

  const rows = await db.select({
    serviceId: servicesTable.id,
    title: servicesTable.title,
    status: servicesTable.status,
    cancellationReason: servicesTable.cancellationReason,
    cancelledBy: servicesTable.cancelledBy,
    updatedAt: servicesTable.updatedAt,
    createdAt: servicesTable.createdAt,
    clientId: servicesTable.clientId,
    clientName: clientUser.name,
    clientEmail: clientUser.email,
    workerId: servicesTable.workerId,
    workerName: workerUser.name,
    workerEmail: workerUser.email,
    chargeAmount: cancellationChargesTable.amount,
    chargeStatus: cancellationChargesTable.status,
    chargeReceiptUrl: cancellationChargesTable.receiptUrl,
    chargeAdminNote: cancellationChargesTable.adminNote,
  })
    .from(servicesTable)
    .innerJoin(clientUser, eq(servicesTable.clientId, clientUser.id))
    .leftJoin(workerUser, eq(servicesTable.workerId, workerUser.id))
    .leftJoin(cancellationChargesTable, eq(cancellationChargesTable.serviceId, servicesTable.id))
    .where(eq(servicesTable.status, "cancelled"))
    .orderBy(desc(servicesTable.updatedAt))
    .limit(200);

  res.json(rows.map(r => ({
    ...r,
    // ¿Quién canceló? (id → rol legible)
    cancelledByRole: r.cancelledBy == null ? null
      : r.cancelledBy === r.clientId ? "client"
      : r.cancelledBy === r.workerId ? "worker"
      : "admin",
  })));
});

// ── ADMIN: resolver un caso 'disputed' (No recibí el pago) ──
// resolution: "settled" (el pago se verificó/acordó) | "voided" (se anula el cargo)
router.post("/admin/services/:id/cancellation-charge/resolve", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseId(req.params.id);
  const resolution = req.body?.resolution;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

  if (resolution !== "settled" && resolution !== "voided") {
    res.status(400).json({ error: "resolution debe ser 'settled' o 'voided'" });
    return;
  }
  if (note.length > 1000) {
    res.status(400).json({ error: "La nota interna no puede superar 1000 caracteres" });
    return;
  }

  const [charge] = await db.select().from(cancellationChargesTable)
    .where(eq(cancellationChargesTable.serviceId, serviceId)).limit(1);
  if (!charge) { res.status(404).json({ error: "No hay cargo para este servicio" }); return; }

  if (charge.status !== "disputed") {
    res.status(400).json({ error: "Solo se pueden resolver casos en revisión (disputados)" });
    return;
  }

  // UPDATE condicional: solo transiciona desde 'disputed' (si en paralelo el
  // experto confirmó el pago u otro admin resolvió, no pisar ese estado).
  const [resolved] = await db.update(cancellationChargesTable).set({
    status: resolution,
    settledAt: resolution === "settled" ? new Date() : charge.settledAt,
    adminNote: note || null,
    resolvedByAdminId: req.userId!,
  }).where(and(
    eq(cancellationChargesTable.id, charge.id),
    eq(cancellationChargesTable.status, "disputed"),
  )).returning();
  if (!resolved) {
    res.status(409).json({ error: "El cargo cambió de estado, recarga la página" });
    return;
  }

  if (resolution === "settled") {
    await createNotification({
      userId: charge.workerId,
      title: "Caso resuelto por soporte ✅",
      message: "Soporte revisó tu caso de la visita técnica y lo marcó como pagado. El cargo quedó cerrado.",
      type: "cancellation_charge",
      relatedId: charge.serviceId,
      targetRole: "worker",
      highPriority: true,
    });
    await createNotification({
      userId: charge.clientId,
      title: "Pago de visita técnica confirmado ✅",
      message: "Soporte confirmó el pago de la visita técnica. El cargo quedó cerrado.",
      type: "cancellation_charge",
      relatedId: charge.serviceId,
      targetRole: "client",
    });
  } else {
    await createNotification({
      userId: charge.workerId,
      title: "Caso resuelto por soporte",
      message: "Soporte revisó el caso de la visita técnica y anuló el cargo. No se registrará un pago por esta cancelación.",
      type: "cancellation_charge",
      relatedId: charge.serviceId,
      targetRole: "worker",
      highPriority: true,
    });
    await createNotification({
      userId: charge.clientId,
      title: "Cargo de visita técnica anulado",
      message: "Soporte revisó el caso y anuló el cargo de la visita técnica. No necesitas pagarlo.",
      type: "cancellation_charge",
      relatedId: charge.serviceId,
      targetRole: "client",
      highPriority: true,
    });
  }
  emitToUser(charge.clientId, "cancellation_charge", { serviceId, action: resolution });
  emitToUser(charge.workerId, "cancellation_charge", { serviceId, action: resolution });

  res.json({ ok: true, status: resolved.status });
});

// El experto confirma que recibió la transferencia → cierra el cargo
router.post("/services/:id/cancellation-charge/settle", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const serviceId = parseId(req.params.id);
  const [charge] = await db.select().from(cancellationChargesTable)
    .where(eq(cancellationChargesTable.serviceId, serviceId)).limit(1);
  if (!charge) { res.status(404).json({ error: "No hay cargo para este servicio" }); return; }

  if (charge.workerId !== req.userId) {
    res.status(403).json({ error: "Solo el experto puede confirmar el pago recibido" });
    return;
  }
  if (charge.status === "settled") { res.json({ ok: true }); return; }
  if (charge.status === "voided") {
    res.status(400).json({ error: "Este cargo fue anulado por soporte" });
    return;
  }

  // UPDATE condicional (carrera settle vs dispute): el que llegue primero gana.
  // Se permite settled desde disputed: si al final el pago llegó, confirmar lo
  // cierra y resuelve el caso de soporte.
  const [settledRow] = await db.update(cancellationChargesTable).set({
    status: "settled",
    settledAt: new Date(),
  }).where(and(
    eq(cancellationChargesTable.id, charge.id),
    ne(cancellationChargesTable.status, "settled"),
    ne(cancellationChargesTable.status, "voided"),
  )).returning();
  if (!settledRow) { res.json({ ok: true }); return; }

  // El pago ya fue confirmado: limpiar los avisos de transferencia pendientes
  // del mismo trabajo para que no vuelvan a aparecer en Inicio.
  await db.update(notificationsTable).set({ isRead: true }).where(and(
    eq(notificationsTable.userId, charge.clientId),
    eq(notificationsTable.relatedId, charge.serviceId),
    eq(notificationsTable.isRead, false),
    inArray(notificationsTable.type, ["payment", "cancellation_charge"]),
  ));
  emitToUser(charge.clientId, "notifications_updated", { action: "payment_settled", serviceId });
  emitToUser(charge.clientId, "cancellation_charge", { serviceId, action: "settled" });
  emitToUser(charge.workerId, "cancellation_charge", { serviceId, action: "settled" });

  res.json({ ok: true });
});

export default router;
