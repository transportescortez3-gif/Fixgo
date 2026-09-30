import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, accountDeletionRequestsTable, usersTable } from "../db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";

const router = Router();

const statuses = ["pending", "in_review", "completed", "rejected"] as const;
type DeletionRequestStatus = (typeof statuses)[number];
const requestTypes = ["full", "partial"] as const;
const dataCategories = [
  "profile",
  "profile_media",
  "kyc",
  "location",
  "chat_attachments",
  "notifications",
] as const;

const requestSchema = z.object({
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  requestType: z.enum(requestTypes).default("full"),
  dataCategories: z.array(z.enum(dataCategories)).max(dataCategories.length).default([]),
  website: z.string().max(200).optional(),
}).superRefine((value, context) => {
  if (value.requestType === "partial" && value.dataCategories.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["dataCategories"],
      message: "Selecciona al menos una categoría de datos.",
    });
  }
});

const statusSchema = z.object({
  status: z.enum(statuses),
  adminNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const publicRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." },
});

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

router.post("/account-deletion-requests", publicRequestLimiter, async (req, res): Promise<void> => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ingresa un correo válido y revisa los datos del formulario." });
    return;
  }

  // Campo señuelo para reducir envíos automatizados sin exponer detalles de la cuenta.
  if (parsed.data.website?.trim()) {
    res.status(400).json({ error: "No se pudo registrar la solicitud." });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhone(parsed.data.phone);
  const [user] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const [existing] = await db.select({ id: accountDeletionRequestsTable.id })
    .from(accountDeletionRequestsTable)
    .where(and(
      eq(accountDeletionRequestsTable.email, email),
      eq(accountDeletionRequestsTable.requestType, parsed.data.requestType),
      inArray(accountDeletionRequestsTable.status, ["pending", "in_review"]),
    ))
    .limit(1);

  if (!existing) {
    await db.insert(accountDeletionRequestsTable).values({
      email,
      phone,
      name: parsed.data.name?.trim() || null,
      userId: user?.id ?? null,
      requestType: parsed.data.requestType,
      dataCategories: parsed.data.requestType === "partial" ? parsed.data.dataCategories : [],
      message: parsed.data.message?.trim() || null,
      status: "pending",
    });
  }

  // Respuesta deliberadamente genérica: no confirma si un correo tiene una cuenta.
  res.status(202).json({
    ok: true,
    message: "Solicitud recibida. El equipo revisará los datos y te contactará para verificar la identidad.",
  });
});

router.get("/admin/account-deletion-requests", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const requestedStatus = typeof req.query.status === "string" ? req.query.status : "all";
  const statusFilter = requestedStatus !== "all" && statuses.includes(requestedStatus as DeletionRequestStatus)
    ? eq(accountDeletionRequestsTable.status, requestedStatus)
    : undefined;

  const rows = await db.select({
    request: accountDeletionRequestsTable,
    user: {
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      phone: usersTable.phone,
      status: usersTable.status,
    },
  })
    .from(accountDeletionRequestsTable)
    .leftJoin(usersTable, eq(accountDeletionRequestsTable.userId, usersTable.id))
    .where(statusFilter)
    .orderBy(desc(accountDeletionRequestsTable.createdAt));

  res.json(rows.map(({ request, user }) => ({ ...request, user })));
});

router.patch("/admin/account-deletion-requests/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Solicitud inválida" });
    return;
  }

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Estado o nota inválidos" });
    return;
  }

  const [updated] = await db.update(accountDeletionRequestsTable).set({
    status: parsed.data.status,
    adminNotes: parsed.data.adminNotes?.trim() || null,
    reviewedBy: req.userId!,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(accountDeletionRequestsTable.id, id)).returning();

  if (!updated) {
    res.status(404).json({ error: "Solicitud no encontrada" });
    return;
  }

  res.json(updated);
});

export default router;