import { pgTable, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";

/**
 * A worker may have one active request reservation at a time. The row is
 * retained while reviewing/negotiating and removed only on skip, leaving the
 * request, assignment, or terminal service transition.
 */
export const workerAlertSlotsTable = pgTable("worker_alert_slots", {
  workerId: integer("worker_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("pending"),
  deliveryId: text("delivery_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_worker_alert_slots_service_id").on(table.serviceId),
]);