import { Router, type IRouter, type Response } from "express";
import { db } from "../db";
import { certificationsTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/certifications/:userId", async (req, res: Response) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const certs = await db
    .select()
    .from(certificationsTable)
    .where(eq(certificationsTable.userId, userId))
    .orderBy(desc(certificationsTable.createdAt));
  res.json(certs);
});

router.post("/certifications", authenticate, async (req: AuthRequest, res: Response) => {
  const { name, issuer, imageUrl } = req.body;
  if (!name || !imageUrl) {
    res.status(400).json({ error: "name e imageUrl son requeridos" });
    return;
  }

  const [cert] = await db
    .insert(certificationsTable)
    .values({ userId: req.userId!, name, issuer: issuer || null, imageUrl, status: "pending" })
    .returning();

  res.status(201).json(cert);
});

router.delete("/certifications/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  const [cert] = await db
    .select()
    .from(certificationsTable)
    .where(eq(certificationsTable.id, id));

  if (!cert || cert.userId !== req.userId!) {
    res.status(404).json({ error: "Certificación no encontrada" });
    return;
  }

  await db.delete(certificationsTable).where(eq(certificationsTable.id, id));
  res.json({ success: true });
});

router.get("/admin/certifications", authenticate, requireRole("admin"), async (_req: AuthRequest, res: Response) => {
  const certs = await db
    .select()
    .from(certificationsTable)
    .orderBy(desc(certificationsTable.createdAt));

  res.json(certs);
});

router.patch("/admin/certifications/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  const { status, rejectionReason } = req.body;

  if (!["verified", "rejected"].includes(status)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  const [updated] = await db
    .update(certificationsTable)
    .set({
      status,
      rejectionReason: rejectionReason || null,
      verifiedBy: req.userId!,
      verifiedAt: new Date(),
    })
    .where(eq(certificationsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Certificación no encontrada" });
    return;
  }

  res.json(updated);
});

export default router;
