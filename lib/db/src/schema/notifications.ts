import { pgTable, text, serial, timestamp, integer, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationTypeEnum = pgEnum("notification_type", [
  "service_request",
  "service_accepted",
  "worker_arrived",
  "service_completed",
  "new_message",
  "payment",
  "review",
  "proposal_received",
  "proposal_accepted",
  "proposal_rejected",
  "counter_offer",
  "subscription_expiry",
  "kyc_approved",
  "kyc_rejected",
  "new_review",
  "direct_rejected",
  "cancellation_charge",
  "work_done_confirm",
  "account_suspension",
  "account_warning",
  "service_cancelled",
]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: notificationTypeEnum("type").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  relatedId: integer("related_id"),
  targetRole: text("target_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_notifications_user_id").on(table.userId),
  index("idx_notifications_is_read").on(table.isRead),
  index("idx_notifications_created_at").on(table.createdAt),
]);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
