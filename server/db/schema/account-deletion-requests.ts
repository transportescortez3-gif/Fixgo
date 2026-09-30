import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  phone: text("phone"),
  name: text("name"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  requestType: text("request_type").notNull().default("full"),
  dataCategories: text("data_categories").array().notNull().default([]),
  status: text("status").notNull().default("pending"),
  message: text("message"),
  adminNotes: text("admin_notes"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_account_deletion_requests_status").on(table.status),
  index("idx_account_deletion_requests_email").on(table.email),
  index("idx_account_deletion_requests_created_at").on(table.createdAt),
]);

export type AccountDeletionRequest = typeof accountDeletionRequestsTable.$inferSelect;