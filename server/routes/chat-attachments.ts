import { Router } from "express";
import express from "express";
import { Readable } from "stream";
import { stat } from "fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { db, chatAttachmentsTable, proposalsTable, servicesTable } from "../db";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  CHAT_ATTACHMENT_LIMITS,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  SUPPORT_RETENTION_DAYS,
  toPublicChatAttachment,
  validateAttachmentMeta,
} from "../lib/chat-attachments";
import { logger } from "../lib/logger";
import { featureEnabled, getActivePlanForUser } from "../lib/subscription-access";
import { isWorkerPayoutComplete, PROFILE_INCOMPLETE_MESSAGE } from "../lib/worker-eligibility";
import {
  attachmentAccessError,
  PENDING_SERVICE_STATUSES,
} from "../lib/chat-attachment-access";

const router = Router();
const storage = new ObjectStorageService();
const OPEN_PROPOSAL_STATUSES = ["pending", "countered", "worker_accepted", "open_chat"] as const;

async function getService(id: number) {
  const [service] = await db.select({
    id: servicesTable.id,
    clientId: servicesTable.clientId,
    workerId: servicesTable.workerId,
    status: servicesTable.status,
    freeCancelUntil: servicesTable.freeCancelUntil,
  }).from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  return service;
}

type AttachmentThreadResult =
  | { threadWorkerId: number }
  | { error: { status: number; error: string } };

async function resolveAttachmentThread(
  service: Awaited<ReturnType<typeof getService>>,
  userId: number,
  userRole: string | undefined,
  requestedWorkerId: unknown,
): Promise<AttachmentThreadResult> {
  const accessError = attachmentAccessError(service, userId, userRole);
  if (accessError) return { error: accessError };
  if (!service) return { error: { status: 404, error: "Conversación no encontrada" } };

  if (PENDING_SERVICE_STATUSES.includes(service.status ?? "")) {
    if (userRole === "worker") {
      if (!(await isWorkerPayoutComplete(userId))) {
        return { error: { status: 403, error: PROFILE_INCOMPLETE_MESSAGE } };
      }
      return { threadWorkerId: userId };
    }

    if (service.clientId !== userId) {
      return { error: { status: 403, error: "No tienes acceso a este chat" } };
    }
    const threadWorkerId = Number(requestedWorkerId);
    if (!Number.isInteger(threadWorkerId) || threadWorkerId <= 0) {
      return { error: { status: 400, error: "Falta el trabajador del hilo (workerId)" } };
    }
    const [proposal] = await db.select({ workerId: proposalsTable.workerId })
      .from(proposalsTable)
      .where(and(
        eq(proposalsTable.serviceId, service.id),
        eq(proposalsTable.workerId, threadWorkerId),
        inArray(proposalsTable.status, OPEN_PROPOSAL_STATUSES),
      ))
      .limit(1);
    if (!proposal) {
      return { error: { status: 403, error: "No tienes acceso a este hilo" } };
    }
    return { threadWorkerId };
  }

  if (!service.workerId) {
    return { error: { status: 409, error: "Esta conversación no tiene un experto asignado" } };
  }
  return { threadWorkerId: service.workerId };
}

function parseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))];
}

async function attachmentPlanError(userId: number): Promise<{ status: number; error: string } | null> {
  const plan = await getActivePlanForUser(userId);
  return featureEnabled(plan, "image_attachments")
    ? null
    : { status: 403, error: "Los adjuntos de imágenes requieren un plan Pro o superior." };
}

router.post("/services/:serviceId/attachments/init", authenticate, async (req: AuthRequest, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    res.status(400).json({ error: "ID de servicio inválido" });
    return;
  }
  const service = await getService(serviceId);
  const thread = await resolveAttachmentThread(service, req.userId!, req.userRole, req.body?.workerId);
  if ("error" in thread) {
    res.status(thread.error.status).json({ error: thread.error.error });
    return;
  }
  const planError = await attachmentPlanError(req.userId!);
  if (planError) {
    res.status(planError.status).json({ error: planError.error, code: "ATTACHMENTS_NOT_INCLUDED" });
    return;
  }

  const existing = parseIds(req.body?.existingAttachmentIds);
  const requestedCount = Number(req.body?.batchCount ?? 1);
  const requestedBytes = Number(req.body?.batchBytes ?? req.body?.size ?? 0);
  if (existing.length + requestedCount > MAX_CHAT_ATTACHMENTS || requestedBytes > MAX_CHAT_ATTACHMENT_BYTES) {
    res.status(400).json({ error: "Máximo 5 archivos y 100 MB por mensaje" });
    return;
  }
  const parsed = validateAttachmentMeta(req.body?.name, req.body?.size, req.body?.contentType);
  if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

  const now = Date.now();
  const [attachment] = await db.insert(chatAttachmentsTable).values({
    serviceId,
    workerId: thread.threadWorkerId,
    uploaderId: req.userId!,
    originalName: parsed.name,
    contentType: parsed.contentType,
    category: parsed.category,
    size: parsed.size,
    supportExpiresAt: new Date(now + SUPPORT_RETENTION_DAYS * 86400000),
  }).returning();

  const e2eUploadUrl = await storage.getObjectEntityUploadURL();
  const supportUploadUrl = await storage.getObjectEntityUploadURL();
  const e2ePath = storage.normalizeObjectEntityPath(e2eUploadUrl);
  const supportPath = storage.normalizeObjectEntityPath(supportUploadUrl);
  await db.update(chatAttachmentsTable).set({
    e2eObjectPath: e2ePath,
    supportObjectPath: supportPath,
  }).where(eq(chatAttachmentsTable.id, attachment.id));

  res.status(201).json({
    attachment: toPublicChatAttachment({ ...attachment, e2eObjectPath: e2ePath, supportObjectPath: supportPath }),
    e2eUploadUrl: `/api/services/${serviceId}/attachments/${attachment.id}/e2e`,
    supportUploadUrl: `/api/services/${serviceId}/attachments/${attachment.id}/support`,
  });
});

async function saveSide(req: AuthRequest, res: any, side: "e2e" | "support") {
  const serviceId = Number(req.params.serviceId);
  const attachmentId = Number(req.params.attachmentId);
  const service = await getService(serviceId);
  const planError = await attachmentPlanError(req.userId!);
  if (planError) {
    res.status(planError.status).json({ error: planError.error, code: "ATTACHMENTS_NOT_INCLUDED" });
    return;
  }
  const [row] = await db.select().from(chatAttachmentsTable).where(and(
    eq(chatAttachmentsTable.id, attachmentId),
    eq(chatAttachmentsTable.serviceId, serviceId),
    eq(chatAttachmentsTable.uploaderId, req.userId!),
  )).limit(1);
  if (!row) { res.status(404).json({ error: "Adjunto no encontrado" }); return; }
  const thread = await resolveAttachmentThread(service, req.userId!, req.userRole, row.workerId);
  if ("error" in thread || row.workerId !== thread.threadWorkerId) {
    const error = "error" in thread
      ? thread.error
      : { status: 403, error: "No tienes acceso a este hilo" };
    res.status(error.status).json({ error: error.error });
    return;
  }
  const data = req.body as Buffer;
  if (!data?.length) { res.status(400).json({ error: "Archivo vacío" }); return; }
  const maxBytes = side === "e2e" ? Math.min(MAX_CHAT_ATTACHMENT_BYTES, row.size + 1024 * 1024) : row.size;
  if (data.length > maxBytes) { res.status(413).json({ error: "El archivo supera el límite permitido" }); return; }
  const objectPath = side === "e2e" ? row.e2eObjectPath : row.supportObjectPath;
  if (!objectPath) { res.status(409).json({ error: "Carga no disponible" }); return; }
  const objectId = objectPath.slice("uploads/".length);
  await storage.saveUploadedFile(objectId, data, side === "e2e" ? "application/octet-stream" : row.contentType);
  res.json({ ok: true, bytes: data.length });
}

router.put("/services/:serviceId/attachments/:attachmentId/e2e", authenticate, express.raw({ type: "*/*", limit: "101mb" }), (req, res) => {
  void saveSide(req as AuthRequest, res, "e2e");
});
router.put("/services/:serviceId/attachments/:attachmentId/support", authenticate, express.raw({ type: "*/*", limit: "51mb" }), (req, res) => {
  void saveSide(req as AuthRequest, res, "support");
});

router.post("/services/:serviceId/attachments/:attachmentId/complete", authenticate, async (req: AuthRequest, res) => {
  const serviceId = Number(req.params.serviceId);
  const attachmentId = Number(req.params.attachmentId);
  const service = await getService(serviceId);
  const planError = await attachmentPlanError(req.userId!);
  if (planError) {
    res.status(planError.status).json({ error: planError.error, code: "ATTACHMENTS_NOT_INCLUDED" });
    return;
  }
  const [row] = await db.select().from(chatAttachmentsTable).where(and(
    eq(chatAttachmentsTable.id, attachmentId),
    eq(chatAttachmentsTable.serviceId, serviceId),
    eq(chatAttachmentsTable.uploaderId, req.userId!),
  )).limit(1);
  if (!row || !row.e2eObjectPath || !row.supportObjectPath) { res.status(404).json({ error: "Adjunto no encontrado" }); return; }
  const thread = await resolveAttachmentThread(service, req.userId!, req.userRole, row.workerId);
  if ("error" in thread || row.workerId !== thread.threadWorkerId) {
    const error = "error" in thread
      ? thread.error
      : { status: 403, error: "No tienes acceso a este hilo" };
    res.status(error.status).json({ error: error.error });
    return;
  }
  try {
    const e2eFile = await storage.getObjectEntityFile(`/objects/${row.e2eObjectPath}`);
    const supportFile = await storage.getObjectEntityFile(`/objects/${row.supportObjectPath}`);
    const [e2eStat, supportStat] = await Promise.all([stat(e2eFile.filePath), stat(supportFile.filePath)]);
    if (!e2eStat.size || !supportStat.size) throw new Error("empty");
  } catch {
    res.status(409).json({ error: "La carga del adjunto está incompleta; puedes reintentarlo" });
    return;
  }
  const [updated] = await db.update(chatAttachmentsTable).set({ status: "ready" }).where(and(
    eq(chatAttachmentsTable.id, attachmentId),
    eq(chatAttachmentsTable.status, "pending"),
  )).returning();
  const completedRow = updated ?? { ...row, status: "ready" };
  res.json({ attachment: toPublicChatAttachment(completedRow) });
});

router.get("/services/:serviceId/attachments/:attachmentId/content", authenticate, async (req: AuthRequest, res) => {
  const serviceId = Number(req.params.serviceId);
  const attachmentId = Number(req.params.attachmentId);
  const service = await getService(serviceId);
  const [row] = await db.select().from(chatAttachmentsTable).where(and(
    eq(chatAttachmentsTable.id, attachmentId),
    eq(chatAttachmentsTable.serviceId, serviceId),
    eq(chatAttachmentsTable.status, "ready"),
  )).limit(1);
  if (!row) { res.status(404).json({ error: "Adjunto no encontrado" }); return; }
  if (!service) { res.status(404).json({ error: "Conversación no encontrada" }); return; }
  const requestedWorkerId = Number(req.query.workerId);
  const threadWorkerId = row.workerId ?? service.workerId;
  const canRead = service.clientId === req.userId
    ? Number.isInteger(requestedWorkerId) && requestedWorkerId > 0 && requestedWorkerId === threadWorkerId
    : req.userRole === "worker" && req.userId === threadWorkerId;
  if (!canRead) {
    res.status(403).json({ error: "No tienes acceso a este archivo" });
    return;
  }
  if (!row.e2eObjectPath || row.e2eDeletedAt) {
    res.status(410).json({ error: "Adjunto eliminado al cerrar el trabajo", code: "ATTACHMENT_PURGED" });
    return;
  }
  try {
    const objectFile = await storage.getObjectEntityFile(`/objects/${row.e2eObjectPath}`);
    const response = await storage.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `inline; filename="encrypted-${row.id}.bin"`);
    if (response.body) Readable.fromWeb(response.body as any).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Archivo no encontrado" }); return; }
    logger.error({ err: error, serviceId, attachmentId }, "Error serving encrypted chat attachment");
    res.status(500).json({ error: "No se pudo leer el adjunto" });
  }
});

// Acceso excepcional de soporte: nunca devuelve la ruta física. La razón queda
// en logs para que una revisión por reclamo sea trazable.
router.get("/admin/chat-attachments/:attachmentId/support", authenticate, async (req: AuthRequest, res) => {
  if (req.userRole !== "admin") { res.status(403).json({ error: "Solo soporte autorizado" }); return; }
  const reason = typeof req.query.reason === "string" ? req.query.reason.trim().slice(0, 300) : "";
  if (reason.length < 10) { res.status(400).json({ error: "Indica una razón de revisión de al menos 10 caracteres" }); return; }
  const attachmentId = Number(req.params.attachmentId);
  const [row] = await db.select().from(chatAttachmentsTable).where(and(
    eq(chatAttachmentsTable.id, attachmentId),
    eq(chatAttachmentsTable.status, "ready"),
  )).limit(1);
  if (!row?.supportObjectPath || row.supportDeletedAt || (row.supportExpiresAt && row.supportExpiresAt <= new Date())) {
    res.status(404).json({ error: "Copia de soporte no disponible" });
    return;
  }
  logger.warn({ adminId: req.userId, attachmentId, serviceId: row.serviceId, reason }, "Authorized support review of chat attachment");
  try {
    const objectFile = await storage.getObjectEntityFile(`/objects/${row.supportObjectPath}`);
    const response = await storage.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `attachment; filename="${row.originalName.replace(/["\r\n]/g, "_")}"`);
    if (response.body) Readable.fromWeb(response.body as any).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Archivo no encontrado" }); return; }
    logger.error({ err: error, attachmentId }, "Error serving support chat attachment");
    res.status(500).json({ error: "No se pudo leer el adjunto" });
  }
});

export default router;