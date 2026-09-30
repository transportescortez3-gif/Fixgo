import { Router } from "express";
import { fetchCategories } from "./categories";
import { getSiteSettingsFromDb } from "./admin";

const router = Router();

/**
 * Endpoint de arranque — devuelve en una sola llamada lo que el cliente
 * necesita para renderizar: categorías + configuración del sitio.
 * Antes el cliente hacía 2 llamadas separadas al iniciar; ahora es 1.
 */
router.get("/bootstrap", async (_req, res): Promise<void> => {
  const [categories, siteSettings] = await Promise.all([
    fetchCategories(),
    getSiteSettingsFromDb(),
  ]);
  // Cloudflare cachea 5 min en sus nodos de Sudamérica
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
  res.json({ categories, siteSettings });
});

export default router;
