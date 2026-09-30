import { Router, type IRouter, type Response } from "express";
import { db } from "../db";
import { portfolioImagesTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/portfolio/:userId", async (req, res: Response) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const images = await db
    .select()
    .from(portfolioImagesTable)
    .where(eq(portfolioImagesTable.userId, userId))
    .orderBy(desc(portfolioImagesTable.createdAt));
  res.json(images);
});

router.post("/portfolio", authenticate, async (req: AuthRequest, res: Response) => {
  const { imageUrl, caption } = req.body;
  if (!imageUrl) {
    res.status(400).json({ error: "imageUrl es requerido" });
    return;
  }

  const images = await db
    .select()
    .from(portfolioImagesTable)
    .where(eq(portfolioImagesTable.userId, req.userId!));

  if (images.length >= 20) {
    res.status(400).json({ error: "Máximo 20 imágenes en el portfolio" });
    return;
  }

  const [image] = await db
    .insert(portfolioImagesTable)
    .values({ userId: req.userId!, imageUrl, caption: caption || null })
    .returning();

  res.status(201).json(image);
});

router.delete("/portfolio/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  const [image] = await db
    .select()
    .from(portfolioImagesTable)
    .where(eq(portfolioImagesTable.id, id));

  if (!image || image.userId !== req.userId!) {
    res.status(404).json({ error: "Imagen no encontrada" });
    return;
  }

  await db.delete(portfolioImagesTable).where(eq(portfolioImagesTable.id, id));
  res.json({ success: true });
});

export default router;
