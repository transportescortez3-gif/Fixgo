import { pgTable, serial, integer, real, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { paymentsTable } from "./payments";

export const payoutStatusEnum = pgEnum("payout_status", ["pending", "sent", "failed"]);
export const payoutMethodDbEnum = pgEnum("payout_method_db", ["bank_transfer"]);

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => paymentsTable.id),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  method: text("method").notNull(),
  status: payoutStatusEnum("status").notNull().default("pending"),
  transactionId: text("transaction_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export type Payout = typeof payoutsTable.$inferSelect;
