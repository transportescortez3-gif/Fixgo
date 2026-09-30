import { Router, type Response } from "express";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { db, securitySelfiesTable, servicesTable, proposalsTable, usersTable } from "../db";
import { authenticate, requireRole, invalidateUserCache } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { recordSecuritySelfie } from "../lib/security-selfies";
import { Readable } from "stream";

const router = Router();
const objectStorage = new ObjectStorageService();

function normalizeUploadedObjectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = objectStorage.normalizeObjectEntityPath(value).replace(/^\/+/, "");
  return /^uploads\/[0-9a-f-]{36}$/.test(normalized) ? normalized : null;
}

router.post("/security-selfies", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userRole !== "client" && req.userRole !== "worker") {
    res.status(403).json({ error: "Rol no autorizado" });
    return;
  }

  const objectPath = normalizeUploadedObjectPath(req.body?.objectPath);
  if (!objectPath) {
    res.status(400).json({ error: "Ruta de selfie inválida" });
    return;
  }

  const serviceId = req.body?.serviceId == null ? null : Number(req.body.serviceId);
  const proposalId = req.body?.proposalId == null ? null : Number(req.body.proposalId);
  if (serviceId !== null && (!Number.isInteger(serviceId) || serviceId <= 0)) {
    res.status(400).json({ error: "Servicio inválido" });
    return;
  }
  if (proposalId !== null && (!Number.isInteger(proposalId) || proposalId <= 0)) {
    res.status(400).json({ error: "Propuesta inválida" });
    return;
  }

  if (serviceId !== null) {
    const [service] = await db.select({
      clientId: servicesTable.clientId,
      workerId: servicesTable.workerId,
    }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
    if (!service) {
      res.status(404).json({ error: "Servicio no encontrado" });
      return;
    }

    const directlyBelongs = req.userRole === "client"
      ? service.clientId === req.userId
      : service.workerId === req.userId;
    let belongsThroughProposal = false;
    if (req.userRole === "worker" && proposalId !== null) {
      const [proposal] = await db.select({ workerId: proposalsTable.workerId })
        .from(proposalsTable)
        .where(and(eq(proposalsTable.id, proposalId), eq(proposalsTable.serviceId, serviceId)))
        .limit(1);
      belongsThroughProposal = proposal?.workerId === req.userId;
    }
    if (!directlyBelongs && !belongsThroughProposal) {
      res.status(403).json({ error: "No puedes asociar esta selfie al servicio" });
      return;
    }
  }

  if (proposalId !== null) {
    const [proposal] = await db.select({
      workerId: proposalsTable.workerId,
      serviceId: proposalsTable.serviceId,
    }).from(proposalsTable).where(eq(proposalsTable.id, proposalId)).limit(1);
    if (!proposal || proposal.workerId !== req.userId || (serviceId !== null && proposal.serviceId !== serviceId)) {
      res.status(403).json({ error: "No puedes asociar esta selfie a la propuesta" });
      return;
    }
  }

  const record = await recordSecuritySelfie({
    userId: req.userId!,
    role: req.userRole,
    objectPath,
    purpose: proposalId !== null ? "proposal" : serviceId !== null ? "service" : "manual",
    serviceId,
    proposalId,
  });
  invalidateUserCache(req.userId!);

  res.status(201).json(record);
});

router.get(
  "/admin/security-selfies",
  authenticate,
  requireRole("admin"),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    const rows = await db.select({
      id: securitySelfiesTable.id,
      role: securitySelfiesTable.role,
      purpose: securitySelfiesTable.purpose,
      serviceId: securitySelfiesTable.serviceId,
      proposalId: securitySelfiesTable.proposalId,
      takenAt: securitySelfiesTable.takenAt,
      expiresAt: securitySelfiesTable.expiresAt,
      deletedAt: securitySelfiesTable.deletedAt,
      hasImage: isNotNull(securitySelfiesTable.objectPath),
      userId: usersTable.id,
      userName: usersTable.name,
      userEmail: usersTable.email,
      serviceTitle: servicesTable.title,
    })
      .from(securitySelfiesTable)
      .innerJoin(usersTable, eq(usersTable.id, securitySelfiesTable.userId))
      .leftJoin(servicesTable, eq(servicesTable.id, securitySelfiesTable.serviceId))
      .orderBy(desc(securitySelfiesTable.takenAt))
      .limit(500);

    res.json(rows.map((row) => ({
      ...row,
      imageUrl: row.hasImage ? `/api/admin/security-selfies/${row.id}/file` : null,
      status: row.deletedAt ? "purged" : "available",
    })));
  },
);

router.get(
  "/admin/security-selfies/:id/file",
  authenticate,
  requireRole("admin"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Selfie inválida" });
      return;
    }

    const [selfie] = await db.select({ objectPath: securitySelfiesTable.objectPath })
      .from(securitySelfiesTable)
      .where(eq(securitySelfiesTable.id, id))
      .limit(1);
    if (!selfie?.objectPath) {
      res.status(410).json({ error: "La selfie ya fue purgada" });
      return;
    }

    try {
      const objectFile = await objectStorage.getObjectEntityFile(`/objects/${selfie.objectPath}`);
      const response = await objectStorage.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("Cache-Control", "private, no-store");
      if (response.body) Readable.fromWeb(response.body as any).pipe(res);
      else res.end();
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Archivo no encontrado" });
        return;
      }
      throw error;
    }
  },
);

export default router;