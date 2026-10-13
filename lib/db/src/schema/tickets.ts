import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const supportTicketsTable = pgTable("support_tickets", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id),
  subject:   text("subject").notNull(),
  message:   text("message").notNull(),
  category:  text("category").notNull().default("general"),
  status:    text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketResponsesTable = pgTable("ticket_responses", {
  id:        serial("id").primaryKey(),
  ticketId:  integer("ticket_id").notNull().references(() => supportTicketsTable.id),
  adminId:   integer("admin_id").notNull().references(() => usersTable.id),
  message:   text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type TicketResponse = typeof ticketResponsesTable.$inferSelect;
