import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";
import { paymentsTable } from "./payments";

export const balanceTransactionsTable = pgTable("balance_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  relatedServiceId: integer("related_service_id").references(() => servicesTable.id, { onDelete: "set null" }),
  relatedPaymentId: integer("related_payment_id").references(() => paymentsTable.id, { onDelete: "set null" }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_balance_tx_user").on(table.userId),
]);

export type BalanceTransaction = typeof balanceTransactionsTable.$inferSelect;
