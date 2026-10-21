import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminPhoneVerificationsTable = pgTable("admin_phone_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  adminId: integer("admin_id").references(() => usersTable.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  reason: text("reason").notNull(),
  method: text("method").notNull().default("manual_admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_admin_phone_verifications_user_id").on(table.userId),
  index("idx_admin_phone_verifications_created_at").on(table.createdAt),
]);

export type AdminPhoneVerification = typeof adminPhoneVerificationsTable.$inferSelect;