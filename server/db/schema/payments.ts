import { pgTable, text, serial, timestamp, integer, real, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { servicesTable } from "./services";
import { usersTable } from "./users";

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "refunded"]);
export const paymentMethodEnum = pgEnum("payment_method", ["card", "cash", "transfer"]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  commissionAmount: real("commission_amount").notNull(),
  workerAmount: real("worker_amount").notNull(),
  commissionRate: real("commission_rate").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  method: paymentMethodEnum("method"),
  transactionId: text("transaction_id"),
  comprobanteUrl: text("comprobante_url"),
  confirmedByWorkerAt: timestamp("confirmed_by_worker_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_payments_service_id").on(table.serviceId),
  index("idx_payments_client_id").on(table.clientId),
  index("idx_payments_worker_id").on(table.workerId),
  index("idx_payments_status").on(table.status),
  uniqueIndex("idx_payments_transaction_id").on(table.transactionId),
]);

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
