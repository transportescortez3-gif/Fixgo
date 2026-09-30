import { Router } from "express";
import { db, reviewsTable, usersTable, servicesTable } from "../db";
import { eq, count, and, gte, desc, isNotNull, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { CreateReviewBody, GetWorkerReviewsParams } from "../zod";
import { createNotification } from "../lib/createNotification";
import { emitToUser } from "../lib/socketio";
import { z } from "zod/v4";

const router = Router();

// ── Cálculo de nota (estilo inDriver) ────────────────────────────────────────
// Promedio bayesiano sobre las últimas RATING_WINDOW reseñas con un "prior" de
// RATING_PRIOR_WEIGHT reseñas perfectas (5★). Así una mala reseña baja la nota
// en décimas en lugar de desplomarla — especialmente con pocas reseñas.
// IMPORTANTE: las filas con rating = 0 son placeholders creados cuando el
// experto califica primero al cliente (rate-client) y NUNCA deben contar.
const RATING_PRIOR_WEIGHT = 10;
const RATING_WINDOW = 75;

function smoothedRating(values: number[]): number {
  // Aritmética entera con redondeo half-up para calzar EXACTO con
  // ROUND(numeric, 2) de las migraciones 0048/0049 (sin errores IEEE-754).
  const p = RATING_PRIOR_WEIGHT * 5 + values.reduce((a, b) => a + b, 0);
  const q = RATING_PRIOR_WEIGHT + values.length;
  return Math.floor((200 * p + q) / (2 * q)) / 100;
}

async function updateWorkerRating(workerId: number): Promise<{ newAvg: number; newCount: number }> {
  const recent = await db.select({ rating: reviewsTable.rating })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.workerId, workerId), gte(reviewsTable.rating, 1)))
    // Desempate por id: misma ventana de 75 que ORDER BY created_at DESC, id DESC en SQL
    .orderBy(desc(reviewsTable.createdAt), desc(reviewsTable.id))
    .limit(RATING_WINDOW);
  const [totalRow] = await db.select({ count: count() })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.workerId, workerId), gte(reviewsTable.rating, 1)));
  const newAvg = smoothedRating(recent.map(r => r.rating));
  const newCount = totalRow?.count ?? recent.length;
  await db.update(usersTable).set({ rating: newAvg, totalReviews: newCount }).where(eq(usersTable.id, workerId));
  return { newAvg, newCount };
}

const userSelect = {
  id: usersTable.id, name: usersTable.name, email: usersTable.email,
  role: usersTable.role, status: usersTable.status, phone: usersTable.phone,
  avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, skills: usersTable.skills,
  rating: usersTable.rating, totalReviews: usersTable.totalReviews,
  clientRating: usersTable.clientRating, clientTotalReviews: usersTable.clientTotalReviews,
  isAvailable: usersTable.isAvailable, lat: usersTable.lat, lng: usersTable.lng,
  createdAt: usersTable.createdAt,
};

router.post("/reviews", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, parsed.data.serviceId)).limit(1);
  if (!service || service.status !== "completed") {
    res.status(400).json({ error: "Service must be completed before reviewing" });
    return;
  }

  // Solo el cliente real del servicio puede dejar una reseña
  if (service.clientId !== req.userId) {
    res.status(403).json({ error: "Solo el cliente del servicio puede dejar una reseña" });
    return;
  }

  // El workerId del body debe coincidir con el trabajador real del servicio
  if (parsed.data.workerId !== service.workerId) {
    res.status(400).json({ error: "El profesional indicado no corresponde a este servicio" });
    return;
  }

  // Upsert ATÓMICO sobre el índice único (service_id, client_id) de la
  // migración 0049. Si ya existe la fila placeholder (rating=0, creada cuando
  // el experto calificó primero al cliente) se completa con la reseña real;
  // si ya existe una reseña real, el setWhere la protege y no retorna fila.
  const [review] = await db.insert(reviewsTable).values({
    serviceId: parsed.data.serviceId,
    clientId: req.userId!,
    workerId: parsed.data.workerId,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? undefined,
  }).onConflictDoUpdate({
    target: [reviewsTable.serviceId, reviewsTable.clientId],
    set: {
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? undefined,
    },
    setWhere: sql`${reviewsTable.rating} = 0`,
  }).returning();

  if (!review) {
    res.status(400).json({ error: "Ya calificaste este servicio" });
    return;
  }

  const { newAvg, newCount } = await updateWorkerRating(parsed.data.workerId);

  const [client] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  // Notifica al trabajador y emite un socket event para que actualice su rating en vivo.
  await createNotification({
    userId: parsed.data.workerId,
    title: "Recibiste una nueva reseña ⭐",
    message: `${client?.name ?? "Un cliente"} te calificó con ${parsed.data.rating} estrella${parsed.data.rating === 1 ? "" : "s"}.`,
    type: "new_review",
    relatedId: parsed.data.serviceId,
  });
  emitToUser(parsed.data.workerId, "review_received", {
    serviceId: parsed.data.serviceId,
    workerId: parsed.data.workerId,
    rating: parsed.data.rating,
    newAvg,
    newCount,
  });

  res.status(201).json({ ...review, client });
});

const RateClientBody = z.object({
  serviceId: z.number(),
  clientId: z.number(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional().nullable(),
});

router.post("/reviews/rate-client", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = RateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, parsed.data.serviceId)).limit(1);
  if (!service || service.status !== "completed") {
    res.status(400).json({ error: "El servicio debe estar completado" });
    return;
  }
  if (service.workerId !== req.userId) {
    res.status(403).json({ error: "Solo el profesional puede calificar al cliente" });
    return;
  }

  // Verificar que el clientId del body corresponde al cliente real del servicio
  if (parsed.data.clientId !== service.clientId) {
    res.status(400).json({ error: "El cliente indicado no corresponde a este servicio" });
    return;
  }

  // Upsert ATÓMICO: si no hay fila para (service, client) crea el placeholder
  // (rating=0, aún sin reseña del cliente); si ya hay una fila (placeholder o
  // reseña real) solo completa la calificación del experto SIN tocar rating.
  const [row] = await db.insert(reviewsTable).values({
    serviceId: parsed.data.serviceId,
    clientId: parsed.data.clientId,
    workerId: req.userId!,
    rating: 0,
    workerRating: parsed.data.rating,
    workerComment: parsed.data.comment ?? undefined,
    reviewedByWorker: true,
  }).onConflictDoUpdate({
    target: [reviewsTable.serviceId, reviewsTable.clientId],
    set: {
      workerRating: parsed.data.rating,
      workerComment: parsed.data.comment ?? undefined,
      reviewedByWorker: true,
    },
  }).returning();

  await updateClientRating(parsed.data.clientId);
  await notifyClientRated(parsed.data.clientId, parsed.data.serviceId, parsed.data.rating, req.userId!);
  res.json(row);
});

async function notifyClientRated(clientId: number, serviceId: number, rating: number, workerId: number): Promise<void> {
  const [worker] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);
  await createNotification({
    userId: clientId,
    title: "Recibiste una calificación ⭐",
    message: `${worker?.name ?? "Un profesional"} te calificó con ${rating} estrella${rating === 1 ? "" : "s"}.`,
    type: "new_review",
    relatedId: serviceId,
  });
  emitToUser(clientId, "review_received", { serviceId, clientId, rating });
}

async function updateClientRating(clientId: number): Promise<void> {
  const recent = await db.select({ rating: reviewsTable.workerRating })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.clientId, clientId), isNotNull(reviewsTable.workerRating), gte(reviewsTable.workerRating, 1)))
    .orderBy(desc(reviewsTable.createdAt), desc(reviewsTable.id))
    .limit(RATING_WINDOW);
  const [totalRow] = await db.select({ count: count() })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.clientId, clientId), isNotNull(reviewsTable.workerRating), gte(reviewsTable.workerRating, 1)));

  if (recent.length > 0) {
    await db.update(usersTable).set({
      clientRating: smoothedRating(recent.map(r => r.rating as number)),
      clientTotalReviews: totalRow?.count ?? recent.length,
    }).where(eq(usersTable.id, clientId));
  }
}

// Devuelve el primer serviceId completado y sin reseña del cliente autenticado con este trabajador.
// El cliente puede usar este serviceId para enviar una reseña.
router.get("/reviews/reviewable/:workerId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const workerId = parseInt(String(req.params.workerId), 10);
  if (isNaN(workerId)) { res.status(400).json({ error: "workerId inválido" }); return; }
  const clientId = req.userId!;

  // Servicios completados donde este cliente contrató a este trabajador
  const completed = await db.select({ id: servicesTable.id })
    .from(servicesTable)
    .where(and(eq(servicesTable.clientId, clientId), eq(servicesTable.workerId, workerId), eq(servicesTable.status, "completed")));

  if (completed.length === 0) { res.json({ reviewable: false }); return; }

  // Filtrar los que ya tienen reseña de este cliente
  const reviewedIds = await db.select({ serviceId: reviewsTable.serviceId })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.clientId, clientId), eq(reviewsTable.workerId, workerId)));
  const reviewedSet = new Set(reviewedIds.map(r => r.serviceId));

  const unreviewedService = completed.find(s => !reviewedSet.has(s.id));
  if (!unreviewedService) { res.json({ reviewable: false, alreadyReviewed: true }); return; }

  res.json({ reviewable: true, serviceId: unreviewedService.id });
});

router.get("/reviews/worker/:workerId", authenticate, async (req, res): Promise<void> => {
  const params = GetWorkerReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db.select({
    review: reviewsTable,
    client: userSelect,
  })
  .from(reviewsTable)
  .innerJoin(usersTable, eq(reviewsTable.clientId, usersTable.id))
  // rating >= 1: excluir placeholders (rating=0) de cuando el experto calificó primero
  .where(and(eq(reviewsTable.workerId, params.data.workerId), gte(reviewsTable.rating, 1)))
  .orderBy(desc(reviewsTable.createdAt));

  const withClients = rows.map(r => ({ ...r.review, client: r.client }));

  res.json(withClients);
});

export default router;
