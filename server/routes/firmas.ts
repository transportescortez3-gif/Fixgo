import { Router } from "express";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { db } from "../db";
import { signaturesTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";

const router = Router();

// Documentos legales disponibles para estampar la firma.
const LEGAL_DOCS: Record<string, { file: string; label: string }> = {
  contrato: { file: "Contrato_P2P_Fixgo_Cliente.pdf",  label: "Contrato P2P Fixgo" },
  orden:    { file: "Orden_Trabajo_Fixgo_Cliente.pdf", label: "Orden de Trabajo Fixgo" },
  acta:     { file: "Acta_Entrega_Fixgo_Cliente.pdf",  label: "Acta de Entrega Fixgo" },
  factura:  { file: "Factura_Fixgo_Cliente.pdf",        label: "Factura Fixgo" },
};

const ASSETS_DIR = path.resolve(process.cwd(), "attached_assets");

function clientIp(req: any): string {
  const xf = (req.headers["x-forwarded-for"] || "") as string;
  return (xf.split(",")[0] || req.socket?.remoteAddress || "").trim();
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

/** Crear nueva firma. No requiere auth: la URL es la barrera. */
router.post("/firmas", async (req, res): Promise<void> => {
  const { ownerKey, ownerName, imageDataUrl, method, styleId } = req.body || {};
  if (!ownerKey || typeof ownerKey !== "string" || ownerKey.length > 60) {
    res.status(400).json({ error: "ownerKey requerido" });
    return;
  }
  if (!ownerName || typeof ownerName !== "string" || ownerName.length > 120) {
    res.status(400).json({ error: "ownerName requerido" });
    return;
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string" || !/^data:image\/(png|jpe?g);base64,/.test(imageDataUrl)) {
    res.status(400).json({ error: "imageDataUrl debe ser data:image/png;base64,..." });
    return;
  }
  if (imageDataUrl.length > 1_500_000) {
    res.status(413).json({ error: "Imagen demasiado grande" });
    return;
  }
  if (method !== "drawn" && method !== "typed") {
    res.status(400).json({ error: "method debe ser 'drawn' o 'typed'" });
    return;
  }

  const createdAtIso = new Date().toISOString();
  const hash = createHash("sha256")
    .update(imageDataUrl)
    .update("|")
    .update(ownerName)
    .update("|")
    .update(createdAtIso)
    .digest("hex");

  const [row] = await db.insert(signaturesTable).values({
    ownerKey: ownerKey.trim().toLowerCase(),
    ownerName: ownerName.trim(),
    imageDataUrl,
    method,
    styleId: typeof styleId === "string" ? styleId.slice(0, 60) : null,
    hash,
    ipAddress: clientIp(req).slice(0, 60) || null,
    userAgent: ((req.headers["user-agent"] as string) || "").slice(0, 300) || null,
  }).returning();

  res.status(201).json(row);
});

/** Listar firmas del ownerKey dado (más nueva primero). Requiere auth. */
router.get("/firmas", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const ownerKey = typeof req.query.ownerKey === "string" ? req.query.ownerKey.trim().toLowerCase() : null;
  if (!ownerKey) {
    res.status(400).json({ error: "ownerKey es requerido" });
    return;
  }
  const rows = await db
    .select({
      id: signaturesTable.id,
      ownerKey: signaturesTable.ownerKey,
      ownerName: signaturesTable.ownerName,
      method: signaturesTable.method,
      styleId: signaturesTable.styleId,
      hash: signaturesTable.hash,
      ipAddress: signaturesTable.ipAddress,
      createdAt: signaturesTable.createdAt,
    })
    .from(signaturesTable)
    .where(eq(signaturesTable.ownerKey, ownerKey))
    .orderBy(desc(signaturesTable.createdAt))
    .limit(50);
  res.json(rows);
});

/** Obtener una firma específica. Requiere auth. */
router.get("/firmas/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [row] = await db.select().from(signaturesTable).where(eq(signaturesTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "no encontrada" }); return; }
  res.json(row);
});

/** Devuelve solo el PNG raw de una firma. Requiere auth. */
router.get("/firmas/:id/png", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).end(); return; }
  const [row] = await db.select().from(signaturesTable).where(eq(signaturesTable.id, id)).limit(1);
  if (!row) { res.status(404).end(); return; }
  const buf = dataUrlToBuffer(row.imageDataUrl);
  if (!buf) { res.status(500).end(); return; }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename="firma-${row.ownerKey}-${row.id}.png"`);
  res.send(buf);
});

/** Lista de documentos legales que se pueden estampar. */
router.get("/firmas/docs/list", (_req, res) => {
  res.json(Object.entries(LEGAL_DOCS).map(([key, v]) => ({ key, label: v.label, file: v.file })));
});

/**
 * Estampa la firma en el PDF y devuelve el archivo firmado.
 * GET /api/firmas/:id/sign-doc?doc=contrato
 */
router.get("/firmas/:id/sign-doc", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const docKey = String(req.query.doc || "").toLowerCase();
  if (!Number.isFinite(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const docMeta = LEGAL_DOCS[docKey];
  if (!docMeta) { res.status(400).json({ error: "doc inválido" }); return; }

  const [row] = await db.select().from(signaturesTable).where(eq(signaturesTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "firma no encontrada" }); return; }

  const pdfPath = path.join(ASSETS_DIR, docMeta.file);
  let basePdfBytes: Buffer;
  try {
    basePdfBytes = await fs.readFile(pdfPath);
  } catch {
    res.status(404).json({ error: "documento base no encontrado" });
    return;
  }

  const sigBuf = dataUrlToBuffer(row.imageDataUrl);
  if (!sigBuf) { res.status(500).json({ error: "firma corrupta" }); return; }

  try {
    const pdfDoc = await PDFDocument.load(basePdfBytes);
    const sigImage = await pdfDoc.embedPng(sigBuf);
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();
    const last = pages[pages.length - 1];
    const { width, height } = last.getSize();

    // Caja de firma: 220x80 px, abajo a la derecha con margen 50.
    const boxW = 220, boxH = 80;
    const margin = 50;
    const x = width - boxW - margin;
    const y = margin + 20;

    // Fondo blanco semi-transparente para que se lea sobre cualquier base
    last.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), opacity: 0.85 });
    last.drawRectangle({ x, y, width: boxW, height: boxH, borderColor: rgb(0.85, 0.7, 0), borderWidth: 1 });

    // La imagen escalada para que entre en 200x50
    const maxW = boxW - 20;
    const maxH = 46;
    const ratio = Math.min(maxW / sigImage.width, maxH / sigImage.height);
    const drawW = sigImage.width * ratio;
    const drawH = sigImage.height * ratio;
    last.drawImage(sigImage, {
      x: x + (boxW - drawW) / 2,
      y: y + boxH - drawH - 6,
      width: drawW,
      height: drawH,
    });

    // Texto de pie: nombre + fecha + hash corto
    const fechaStr = new Date(row.createdAt).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
    });
    last.drawText(row.ownerName, {
      x: x + 8, y: y + 18, size: 8, font: helvBold, color: rgb(0.1, 0.1, 0.1),
    });
    last.drawText(`Firma electronica simple - ${fechaStr}`, {
      x: x + 8, y: y + 9, size: 6.5, font: helv, color: rgb(0.3, 0.3, 0.3),
    });
    last.drawText(`Hash: ${row.hash.slice(0, 32)}...`, {
      x: x + 8, y: y + 2, size: 6, font: helv, color: rgb(0.4, 0.4, 0.4),
    });

    const out = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${docKey}-firmado-${row.ownerKey}-${row.id}.pdf"`
    );
    res.send(Buffer.from(out));
  } catch (err: any) {
    res.status(500).json({ error: "Error al estampar la firma", detail: String(err?.message || err) });
  }
});

export default router;
