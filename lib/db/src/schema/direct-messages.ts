import { pgTable, serial, integer, text, boolean, timestamp, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const directConversationsTable = pgTable("direct_conversations", {
  id:        serial("id").primaryKey(),
  userAId:   integer("user_a_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  userBId:   integer("user_b_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("uq_direct_conv").on(t.userAId, t.userBId),
  index("idx_direct_conv_a").on(t.userAId),
  index("idx_direct_conv_b").on(t.userBId),
]);

export const directMessagesTable = pgTable("direct_messages", {
  id:             serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => directConversationsTable.id, { onDelete: "cascade" }),
  senderId:       integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content:        text("content").notNull(),
  encrypted:      boolean("encrypted").default(false),
  isRead:         boolean("is_read").default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_direct_msgs_conv").on(t.conversationId),
  index("idx_direct_msgs_sndr").on(t.senderId),
]);
