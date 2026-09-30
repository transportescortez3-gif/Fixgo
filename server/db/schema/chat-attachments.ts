import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { servicesTable } from "./services";
import { messagesTable } from "./messages";
import { usersTable } from "./users";

export const chatAttachmentsTable = pgTable("chat_attachments", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id, { onDelete: "cascade" }),
  workerId: integer("worker_id").references(() => usersTable.id),
  messageId: integer("message_id").references(() => messagesTable.id, { onDelete: "cascade" }),
  uploaderId: integer("uploader_id").notNull().references(() => usersTable.id),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  category: text("category").notNull(),
  size: integer("size").notNull(),
  e2eObjectPath: text("e2e_object_path"),
  supportObjectPath: text("support_object_path"),
  status: text("status").notNull().default("pending"),
  supportExpiresAt: timestamp("support_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  e2eDeletedAt: timestamp("e2e_deleted_at", { withTimezone: true }),
  supportDeletedAt: timestamp("support_deleted_at", { withTimezone: true }),
}, (table) => [
  index("idx_chat_attachments_service_id").on(table.serviceId),
  index("idx_chat_attachments_worker_id").on(table.workerId),
  index("idx_chat_attachments_message_id").on(table.messageId),
  index("idx_chat_attachments_support_expires_at").on(table.supportExpiresAt),
]);

export type ChatAttachment = typeof chatAttachmentsTable.$inferSelect;