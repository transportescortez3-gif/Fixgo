import { db, notificationsTable, usersTable } from "../db";
import { eq, inArray } from "drizzle-orm";
import { sendPushNotification } from "./firebase";
import { emitToUser } from "./socketio";
import type { InsertNotification } from "../db";
import { logger } from "./logger";

export async function createNotification(data: InsertNotification & {
  highPriority?: boolean;
  deliveryId?: string;
  alertExpiresAt?: Date | string;
}): Promise<void> {
  const { highPriority, deliveryId, alertExpiresAt, ...dbData } = data;
  await db.insert(notificationsTable).values(dbData);

  emitToUser(data.userId, "new_notification", {
    type: data.type,
    relatedId: data.relatedId ?? null,
    targetRole: data.targetRole ?? null,
    ...(deliveryId ? { deliveryId } : {}),
  });

  try {
    const [user] = await db
      .select({ fcmToken: usersTable.fcmToken, fcmTokenWeb: usersTable.fcmTokenWeb })
      .from(usersTable)
      .where(eq(usersTable.id, data.userId))
      .limit(1);

    const tokens = [user?.fcmToken, user?.fcmTokenWeb].filter((t): t is string => !!t);

    if (tokens.length === 0) {
      logger.warn({ userId: data.userId, type: data.type, highPriority }, "push: no FCM token — skipped");
      return;
    }

    const pushData = {
      ...(data.relatedId ? { relatedId: String(data.relatedId) } : {}),
      type: data.type,
      ...(data.targetRole ? { targetRole: data.targetRole } : {}),
      ...(deliveryId ? { deliveryId } : {}),
    };
    const androidData = data.type === "service_request" && alertExpiresAt
      ? { ...pushData, alertExpiresAt: typeof alertExpiresAt === "string" ? alertExpiresAt : alertExpiresAt.toISOString() }
      : pushData;

    await Promise.all(tokens.map(token =>
      sendPushNotification(token, data.title, data.message, pushData, highPriority ?? false, androidData)
    ));
    logger.info({ userId: data.userId, type: data.type, highPriority }, "push: sent ok");
  } catch (err) {
    logger.error({ err, userId: data.userId, type: data.type }, "push: FCM send error");
  }
}

export async function createNotifications(items: (InsertNotification & { highPriority?: boolean })[]): Promise<void> {
  if (items.length === 0) return;
  const dbItems = items.map(({ highPriority, ...rest }) => rest);
  await db.insert(notificationsTable).values(dbItems);

  for (const item of items) {
    emitToUser(item.userId, "new_notification", {
      type: item.type,
      relatedId: item.relatedId ?? null,
      targetRole: item.targetRole ?? null,
    });
  }

  try {
    const userIds = [...new Set(items.map(i => i.userId))];
    const users = await db
      .select({ id: usersTable.id, fcmToken: usersTable.fcmToken, fcmTokenWeb: usersTable.fcmTokenWeb })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));

    const tokenMap = new Map(users.map(u => [u.id, [u.fcmToken, u.fcmTokenWeb].filter((t): t is string => !!t)]));

    await Promise.all(items.map(async (data) => {
      const tokens = tokenMap.get(data.userId) ?? [];
      if (tokens.length === 0) {
        logger.warn({ userId: data.userId, type: data.type }, "push(bulk): no FCM token — skipped");
        return;
      }
      try {
        const pushData = {
          ...(data.relatedId ? { relatedId: String(data.relatedId) } : {}),
          type: data.type,
          ...(data.targetRole ? { targetRole: data.targetRole } : {}),
        };
        await Promise.all(tokens.map(token =>
          sendPushNotification(token, data.title, data.message, pushData, data.highPriority ?? false)
        ));
        logger.info({ userId: data.userId, type: data.type }, "push(bulk): sent ok");
      } catch (err) {
        logger.error({ err, userId: data.userId, type: data.type }, "push(bulk): FCM send error");
      }
    }));
  } catch (err) {
    logger.error({ err }, "push(bulk): outer error");
  }
}
