import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminUserBlocksTable = pgTable("admin_user_blocks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  blockedByAdminId: integer("blocked_by_admin_id").references(() => usersTable.id, { onDelete: "set null" }),
  duration: text("duration").notNull(),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason"),
  unblockedByAdminId: integer("unblocked_by_admin_id").references(() => usersTable.id, { onDelete: "set null" }),
}, (table) => [
  index("idx_admin_user_blocks_user_id").on(table.userId),
  index("idx_admin_user_blocks_active_until").on(table.endedAt, table.blockedUntil),
]);

export type AdminUserBlock = typeof adminUserBlocksTable.$inferSelect;