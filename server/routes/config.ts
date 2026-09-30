import { Router, type Response } from "express";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";

const router = Router();

// Caché en memoria — la clave de Maps no cambia en runtime
let mapsKeyCache: string | null = null;

router.get("/config/maps", authenticate, (_req: AuthRequest, res: Response) => {
  if (mapsKeyCache === null) {
    mapsKeyCache = process.env.GOOGLE_MAPS_API_KEY || "";
  }
  // Cache en Cloudflare 1 hora (la clave casi nunca cambia)
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=300");
  res.json({ apiKey: mapsKeyCache });
});

export default router;
