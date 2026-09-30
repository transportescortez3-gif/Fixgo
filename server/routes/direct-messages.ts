import { Router } from "express";
import { db } from "../db";
import { directConversationsTable, directMessagesTable, usersTable } from "../db/schema";
import { eq, and, ne } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { emitToDirect, emitToUser } from "../lib/socketio";
import { createNotification } from "../lib/createNotification";

const router = Router();

const otherUserSelect = {
  id: usersTable.id,
  name: usersTable.name,
  avatarUrl: usersTable.avatarUrl,
  rating: usersTable.rating,
  totalReviews: usersTable.totalReviews,
  bio: usersTable.bio,
};

// Obtener o crear conversación directa con otro usuario
router.get("/direct/conversation/:otherUserId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const myId = req.userId!;
  const otherId = parseInt(String(req.params.otherUserId), 10);
  if (isNaN(otherId) || otherId === myId) { res.status(400).json({ error: "Invalid userId" }); return; }

  const userA = Math.min(myId, otherId);
  const userB = Math.max(myId, otherId);

  let [conv] = await db.select().from(directConversationsTable)
    .where(and(eq(directConversationsTable.userAId, userA), eq(directConversationsTable.userBId, userB)))
    .limit(1);

  if (!conv) {
    [conv] = await db.insert(directConversationsTable)
      .values({ userAId: userA, userBId: userB })
      .returning();
  }

  const [otherUser] = await db.select(otherUserSelect).from(usersTable)
    .where(eq(usersTable.id, otherId)).limit(1);

  res.json({ ...conv, otherUser });
});

// Listar mensajes de una conversación directa
router.get("/direct/conversation/:id/messages", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const myId = req.userId!;
  const convId = parseInt(String(req.params.id), 10);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid conversationId" }); return; }

  const [conv] = await db.select().from(directConversationsTable)
    .where(eq(directConversationsTable.id, convId)).limit(1);
  if (!conv || (conv.userAId !== myId && conv.userBId !== myId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const messages = await db
    .select({
      id:             directMessagesTable.id,
      conversationId: directMessagesTable.conversationId,
      senderId:       directMessagesTable.senderId,
      content:        directMessagesTable.content,
      encrypted:      directMessagesTable.encrypted,
      isRead:         directMessagesTable.isRead,
      createdAt:      directMessagesTable.createdAt,
      sender: {
        id:        usersTable.id,
        name:      usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      },
    })
    .from(directMessagesTable)
    .innerJoin(usersTable, eq(directMessagesTable.senderId, usersTable.id))
    .where(eq(directMessagesTable.conversationId, convId))
    .orderBy(directMessagesTable.createdAt)
    .limit(200);

  res.json({ messages });
});

// Enviar mensaje directo
router.post("/direct/conversation/:id/messages", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const myId = req.userId!;
  const convId = parseInt(String(req.params.id), 10);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid conversationId" }); return; }

  const { content, encrypted } = req.body;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content requerido" }); return;
  }

  const [conv] = await db.select().from(directConversationsTable)
    .where(eq(directConversationsTable.id, convId)).limit(1);
  if (!conv || (conv.userAId !== myId && conv.userBId !== myId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [msg] = await db.insert(directMessagesTable)
    .values({ conversationId: convId, senderId: myId, content: content.trim(), encrypted: !!encrypted })
    .returning();

  const [sender] = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(eq(usersTable.id, myId)).limit(1);

  const fullMsg = { ...msg, sender };
  const otherId = conv.userAId === myId ? conv.userBId : conv.userAId;

  emitToDirect(convId, "direct_message", fullMsg);
  emitToUser(otherId, "direct_message", fullMsg);

  createNotification({
    userId: otherId,
    type: "new_message" as any,
    title: `Mensaje de ${sender?.name ?? "un contacto"}`,
    message: encrypted ? "Nuevo mensaje cifrado" : content.trim().slice(0, 100),
  }).catch(() => {});

  res.status(201).json(fullMsg);
});

// Marcar mensajes como leídos
router.patch("/direct/conversation/:id/messages/read", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const myId = req.userId!;
  const convId = parseInt(String(req.params.id), 10);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid conversationId" }); return; }

  const [conv] = await db.select().from(directConversationsTable)
    .where(eq(directConversationsTable.id, convId)).limit(1);
  if (!conv || (conv.userAId !== myId && conv.userBId !== myId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.update(directMessagesTable)
    .set({ isRead: true })
    .where(and(eq(directMessagesTable.conversationId, convId), eq(directMessagesTable.isRead, false), ne(directMessagesTable.senderId, myId)));

  emitToDirect(convId, "direct_messages_read", { userId: myId });
  res.json({ ok: true });
});

export default router;
