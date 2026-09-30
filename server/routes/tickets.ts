import { Router } from "express";
import { db } from "../db";
import { supportTicketsTable, ticketResponsesTable, usersTable } from "../db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";

const router = Router();

const CATEGORIES = ["general", "pago", "cuenta", "seguridad", "otro"];

router.post("/tickets", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { subject, message, category } = req.body;
  if (!subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Asunto y mensaje son requeridos" });
    return;
  }
  const cat = CATEGORIES.includes(category) ? category : "general";

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId: req.userId!,
    subject: subject.trim(),
    message: message.trim(),
    category: cat,
    status: "open",
  }).returning();

  res.status(201).json(ticket);
});

router.get("/tickets", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const rows = await db
    .select({
      ticket: supportTicketsTable,
      responses: ticketResponsesTable,
    })
    .from(supportTicketsTable)
    .leftJoin(ticketResponsesTable, eq(ticketResponsesTable.ticketId, supportTicketsTable.id))
    .where(eq(supportTicketsTable.userId, req.userId!))
    .orderBy(desc(supportTicketsTable.createdAt));

  const ticketsMap = new Map<number, any>();
  for (const row of rows) {
    if (!ticketsMap.has(row.ticket.id)) {
      ticketsMap.set(row.ticket.id, { ...row.ticket, responses: [] });
    }
    if (row.responses) {
      ticketsMap.get(row.ticket.id).responses.push(row.responses);
    }
  }

  res.json(Array.from(ticketsMap.values()));
});

router.get("/admin/tickets", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const status = req.query.status as string | undefined;

  const validStatuses = ["open", "answered", "closed"];
  const statusFilter = status && status !== "all" && validStatuses.includes(status)
    ? eq(supportTicketsTable.status, status as "open" | "answered" | "closed")
    : undefined;

  const filtered = await db
    .select({
      ticket: supportTicketsTable,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        avatarUrl: usersTable.avatarUrl,
      },
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .where(statusFilter)
    .orderBy(desc(supportTicketsTable.createdAt));

  const ticketIds = filtered.map(r => r.ticket.id);
  const responses = ticketIds.length > 0
    ? await db.select().from(ticketResponsesTable)
        .where(inArray(ticketResponsesTable.ticketId, ticketIds))
        .orderBy(ticketResponsesTable.createdAt)
    : [];

  const result = filtered.map(row => ({
    ...row.ticket,
    user: row.user,
    responses: responses.filter(r => r.ticketId === row.ticket.id),
  }));

  res.json(result);
});

router.post("/admin/tickets/:id/respond", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { message, status } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "El mensaje es requerido" });
    return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

  const [response] = await db.insert(ticketResponsesTable).values({
    ticketId: id,
    adminId: req.userId!,
    message: message.trim(),
  }).returning();

  const newStatus = ["open", "answered", "closed"].includes(status) ? status : "answered";
  await db.update(supportTicketsTable).set({
    status: newStatus,
    updatedAt: new Date(),
  }).where(eq(supportTicketsTable.id, id));

  res.json({ response, status: newStatus });
});

router.patch("/admin/tickets/:id/status", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { status } = req.body;

  if (!["open", "answered", "closed"].includes(status)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  const [updated] = await db.update(supportTicketsTable).set({
    status,
    updatedAt: new Date(),
  }).where(eq(supportTicketsTable.id, id)).returning();

  if (!updated) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

  res.json(updated);
});

export default router;
