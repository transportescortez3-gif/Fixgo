import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";

/**
 * Cargo por cancelación tardía (visita técnica).
 *
 * IMPORTANTE (modelo legal): Fixgo NO procesa ni intermedia este pago.
 * Esta tabla solo registra la información necesaria para que el CLIENTE
 * transfiera DIRECTAMENTE al experto (snapshot de sus datos bancarios) y
 * suba el comprobante como imagen. La plataforma no verifica el pago ni
 * mueve dinero.
 */
export const cancellationChargesTable = pgTable("cancellation_charges", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().unique().references(() => servicesTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  // Monto = tarifa de visita técnica del perfil del experto al momento de cancelar
  amount: integer("amount").notNull(),
  // Snapshot de los datos de transferencia del experto (por si los cambia después)
  holderName: text("holder_name").notNull(),
  bankName: text("bank_name"),
  bankAccountType: text("bank_account_type"),
  bankAccountNumber: text("bank_account_number"),
  bankRut: text("bank_rut"),
  // pending → receipt_uploaded → settled | disputed → settled/voided (admin)
  status: text("status").notNull().default("pending"),
  // Resolución de soporte cuando el caso estuvo en disputa
  adminNote: text("admin_note"),
  resolvedByAdminId: integer("resolved_by_admin_id").references(() => usersTable.id),
  receiptUrl: text("receipt_url"),
  receiptUploadedAt: timestamp("receipt_uploaded_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_cancellation_charges_client_id").on(table.clientId),
  index("idx_cancellation_charges_worker_id").on(table.workerId),
  index("idx_cancellation_charges_status").on(table.status),
]);

export type CancellationCharge = typeof cancellationChargesTable.$inferSelect;
