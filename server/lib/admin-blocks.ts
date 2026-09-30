import { db, adminUserBlocksTable, usersTable } from "../db";
import { and, asc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { invalidateUserCache } from "../middlewares/authenticate";
import { logger } from "./logger";
import { emitToUser } from "./socketio";

export const ADMIN_BLOCK_DURATIONS = ["24h", "7d", "30d", "indefinite"] as const;
export type AdminBlockDuration = typeof ADMIN_BLOCK_DURATIONS[number];

const DURATION_MS: Record<Exclude<AdminBlockDuration, "indefinite">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function isAdminBlockDuration(value: unknown): value is AdminBlockDuration {
  return typeof value === "string" &&
    (ADMIN_BLOCK_DURATIONS as readonly string[]).includes(value);
}

export function getAdminBlockUntil(duration: AdminBlockDuration, blockedAt: Date): Date | null {
  if (duration === "indefinite") return null;
  return new Date(blockedAt.getTime() + DURATION_MS[duration]);
}

/**
 * Closes due admin blocks and reactivates their accounts. The update is
 * conditional on ended_at so a manual unlock always wins a race.
 */
export async function expireDueAdminBlocks(): Promise<number> {
  const now = new Date();
  const reactivatedUserIds = await db.transaction(async (tx) => {
    const rows = await tx.update(adminUserBlocksTable)
      .set({
        endedAt: now,
        endReason: "expired",
      })
      .where(and(
        isNull(adminUserBlocksTable.endedAt),
        isNotNull(adminUserBlocksTable.blockedUntil),
        lte(adminUserBlocksTable.blockedUntil, now),
      ))
      .returning({
        userId: adminUserBlocksTable.userId,
      });

    const reactivatedIds: number[] = [];
    for (const row of rows) {
      const [updated] = await tx.update(usersTable)
        .set({ status: "active", isAvailable: false, updatedAt: now })
        .where(and(
          eq(usersTable.id, row.userId),
          eq(usersTable.status, "blocked"),
        ))
        .returning({ id: usersTable.id });
      if (updated) reactivatedIds.push(updated.id);
    }
    return reactivatedIds;
  });

  for (const userId of reactivatedUserIds) {
    invalidateUserCache(userId);
    emitToUser(userId, "account_status_updated", {
      status: "active",
      blockedUntil: null,
      reason: "expired",
    });
  }

  if (reactivatedUserIds.length > 0) {
    logger.info({ count: reactivatedUserIds.length }, "Admin account blocks expired automatically");
  }
  return reactivatedUserIds.length;
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let expirySchedulerStarted = false;

export async function refreshAdminBlockExpiryTimer(): Promise<void> {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }

  const now = new Date();
  const [next] = await db.select({ blockedUntil: adminUserBlocksTable.blockedUntil })
    .from(adminUserBlocksTable)
    .where(and(
      isNull(adminUserBlocksTable.endedAt),
      isNotNull(adminUserBlocksTable.blockedUntil),
      gt(adminUserBlocksTable.blockedUntil, now),
    ))
    .orderBy(asc(adminUserBlocksTable.blockedUntil))
    .limit(1);

  if (!next?.blockedUntil) return;

  const delay = Math.max(0, Math.min(
    next.blockedUntil.getTime() - Date.now(),
    2_147_000_000,
  ));
  expiryTimer = setTimeout(async () => {
    try {
      await expireDueAdminBlocks();
    } catch (error) {
      logger.error({ err: error }, "Admin block expiry error");
    } finally {
      await refreshAdminBlockExpiryTimer();
    }
  }, delay);
}

export function startAdminBlockExpiryScheduler(): void {
  if (expirySchedulerStarted) return;
  expirySchedulerStarted = true;
  void expireDueAdminBlocks()
    .catch((error) => logger.error({ err: error }, "Initial admin block expiry error"))
    .finally(() => refreshAdminBlockExpiryTimer().catch((error) => {
      logger.error({ err: error }, "Admin block expiry timer setup error");
    }));
  logger.info("Admin block expiry scheduler started");
}

export function stopAdminBlockExpiryScheduler(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  expirySchedulerStarted = false;
}