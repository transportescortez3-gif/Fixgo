import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { servicesTable } from "./services";
import { usersTable } from "./users";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").references(() => usersTable.id),
  content: text("content").notNull(),
  messageType: text("message_type").notNull().default("text"),
  imageUrl: text("image_url"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_messages_service_id").on(table.serviceId),
  index("idx_messages_sender_id").on(table.senderId),
  index("idx_messages_worker_id").on(table.workerId),
]);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
