import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import express from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "../zod";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  PersistentUploadStorageUnavailableError,
} from "../lib/objectStorage";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
import { db, securitySelfiesTable } from "../db";
import { eq, or } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/");

    if (!isImage && !isVideo) {
      res.status(400).json({ error: "Only image or video uploads are allowed" });
      return;
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (size > maxSize) {
      res.status(400).json({ error: isVideo ? "Video size exceeds 50MB limit" : "File size exceeds 10MB limit" });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    if (error instanceof PersistentUploadStorageUnavailableError) {
      req.log.warn({ err: error }, "Persistent upload storage is unavailable");
      res.status(503).json({ error: error.message, code: "PERSISTENT_STORAGE_UNAVAILABLE" });
      return;
    }
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.put(
  "/storage/uploads/:id",
  authenticate,
  express.raw({ type: "*/*", limit: "55mb" }),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ error: "Invalid upload ID" });
      return;
    }

    try {
      const contentType = (req.headers["content-type"] || "application/octet-stream").split(";")[0].trim();
      const data = req.body as Buffer;

      if (!data || data.length === 0) {
        res.status(400).json({ error: "Empty file" });
        return;
      }

      await objectStorageService.saveUploadedFile(id, data, contentType);
      res.status(200).json({ success: true });
    } catch (error) {
      if (error instanceof PersistentUploadStorageUnavailableError) {
        logger.warn({ err: error }, "Persistent upload storage is unavailable");
        res.status(503).json({ error: error.message, code: "PERSISTENT_STORAGE_UNAVAILABLE" });
        return;
      }
      logger.error({ err: error }, "Error saving uploaded file");
      res.status(500).json({ error: "Failed to save file" });
    }
  }
);

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const normalizedPath = wildcardPath.startsWith("uploads/")
      ? wildcardPath
      : `uploads/${wildcardPath.replace(/^uploads\//, "")}`;
    const [securitySelfie] = await db.select({ id: securitySelfiesTable.id })
      .from(securitySelfiesTable)
      .where(or(
        eq(securitySelfiesTable.objectPath, normalizedPath),
        eq(securitySelfiesTable.originalObjectPath, normalizedPath),
      ))
      .limit(1);
    if (securitySelfie) {
      res.status(403).json({ error: "Este archivo requiere autorización" });
      return;
    }
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "private, max-age=3600");

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof PersistentUploadStorageUnavailableError) {
      logger.warn({ err: error }, "Persistent upload storage is unavailable");
      res.status(503).json({ error: error.message, code: "PERSISTENT_STORAGE_UNAVAILABLE" });
      return;
    }
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    logger.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
