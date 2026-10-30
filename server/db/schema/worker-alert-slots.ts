import { pgTable, integer, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";

/**
 * A worker may have concurrent request reservations, one per service. Each
 * row is retained while reviewing/negotiating and removed on resolution.
 */
export const workerAlertSlotsTable = pgTable("worker_alert_slots", {
  workerId: integer("worker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("pending"),
  deliveryId: text("delivery_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.workerId, table.serviceId] }),
  index("idx_worker_alert_slots_service_id").on(table.serviceId),
]);