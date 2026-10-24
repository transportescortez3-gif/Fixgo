import { Router } from "express";
import { db, notificationsTable, usersTable } from "../db";
import { eq, and, desc, or, isNull, ne } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { ListNotificationsQueryParams, MarkNotificationReadParams } from "../zod";
import { getFirebaseApp } from "../lib/firebase";
import { emitToUser } from "../lib/socketio";

const router = Router();

router.get("/notifications", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const query = ListNotificationsQueryParams.safeParse(req.query);
  const unreadOnly = query.success ? query.data.unreadOnly : undefined;

  const userRole = req.userRole ?? "client";

  const conditions = [
    eq(notificationsTable.userId, req.userId!),
    or(isNull(notificationsTable.targetRole), eq(notificationsTable.targetRole, userRole)),
  ];
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

  const notifications = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications);
});

router.post("/notifications/mark-all-read", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const userRole = req.userRole ?? "client";
  await db.update(notificationsTable).set({ isRead: true })
    .where(and(
      eq(notificationsTable.userId, req.userId!),
      eq(notificationsTable.isRead, false),
      ne(notificationsTable.type, "work_done_confirm"),
      or(isNull(notificationsTable.targetRole), eq(notificationsTable.targetRole, userRole)),
    ));
  emitToUser(req.userId!, "notifications_updated", { action: "mark_all_read" });
  res.json({ ok: true });
});

router.patch("/notifications/:id/read", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [updated] = await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, req.userId!)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  emitToUser(req.userId!, "notifications_updated", { action: "mark_read", id: params.data.id });
  res.json(updated);
});

router.post("/notifications/fcm-token", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { token, platform } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token requerido" });
    return;
  }
  if (token.length > 500) {
    res.status(400).json({ error: "token inválido" });
    return;
  }

  await db.update(usersTable)
    .set(platform === "web" ? { fcmTokenWeb: token } : { fcmToken: token })
    .where(eq(usersTable.id, req.userId!));

  const firebaseConfigured = Boolean(getFirebaseApp());

  res.json({ ok: true, firebaseConfigured });
});

router.delete("/notifications/fcm-token", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { platform } = req.query;
  await db.update(usersTable)
    .set(platform === "web" ? { fcmTokenWeb: null } : { fcmToken: null })
    .where(eq(usersTable.id, req.userId!));
  res.json({ ok: true });
});

router.post("/notifications/voip-token", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token requerido" });
    return;
  }
  if (token.length > 500) {
    res.status(400).json({ error: "token inválido" });
    return;
  }

  await db.update(usersTable)
    .set({ voipToken: token })
    .where(eq(usersTable.id, req.userId!));

  res.json({ ok: true });
});

router.delete("/notifications/voip-token", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await db.update(usersTable)
    .set({ voipToken: null })
    .where(eq(usersTable.id, req.userId!));
  res.json({ ok: true });
});

export default router;
