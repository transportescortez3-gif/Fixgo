import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// Caché simple en memoria para no hacer fetch por IP repetidas veces
// (TTL: 10 minutos)
const cache = new Map<string, { lat: number; lng: number; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
    if (first && first !== "unknown") return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * GET /api/geoip
 *
 * Devuelve la ubicación aproximada del cliente según su IP pública.
 * Precisión: nivel ciudad (~5-50 km). Usado como fallback cuando el
 * GPS del dispositivo no está disponible (desktop sin hardware GPS).
 *
 * Usa ipapi.co (gratuito, sin API key, 1000 req/día).
 * El cliente llama esto solo cuando navigator.geolocation falla repetidamente.
 */
router.get("/geoip", async (req: Request, res: Response) => {
  const ip = getClientIp(req);

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return res.json({ lat: cached.lat, lng: cached.lng, accuracy: 15000, source: "ip-cache" });
  }

  try {
    // ipapi.co: gratuito sin API key, hasta 1000 req/día
    // Devuelve JSON con latitude/longitude
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const ipParam = ip === "unknown" || ip === "::1" || ip === "127.0.0.1" ? "" : `${ip}/`;
    const apiUrl = `https://ipapi.co/${ipParam}json/`;

    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Fixgo/1.0" },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(502).json({ error: "geoip service unavailable" });
    }

    const data = (await resp.json()) as any;

    if (!data.latitude || !data.longitude) {
      return res.status(502).json({ error: "geoip returned no coordinates" });
    }

    const result = { lat: Number(data.latitude), lng: Number(data.longitude) };
    cache.set(ip, { ...result, ts: Date.now() });

    return res.json({ ...result, accuracy: 15000, source: "ip" });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "geoip timeout" });
    }
    return res.status(502).json({ error: "geoip fetch failed" });
  }
});

export default router;
