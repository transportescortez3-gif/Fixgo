import { pgTable, serial, integer, timestamp, text, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";

export const alertSessionsTable = pgTable("alert_sessions", {
  id:          serial("id").primaryKey(),
  serviceId:   integer("service_id").notNull().references(() => servicesTable.id, { onDelete: "cascade" }),
  workerId:    integer("worker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sentAt:      timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deliveryId:  text("delivery_id"),
  phase:       text("phase"),
  distanceKm:  real("distance_km"),
  response:    text("response").notNull().default("pending"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("uq_alert_session").on(table.serviceId, table.workerId),
  uniqueIndex("uq_alert_session_delivery_id").on(table.deliveryId),
  index("idx_alert_sessions_service_id").on(table.serviceId),
  index("idx_alert_sessions_worker_id").on(table.workerId),
  index("idx_alert_sessions_dispatch").on(table.workerId, table.response, table.availableAt, table.expiresAt),
]);

export type AlertSession = typeof alertSessionsTable.$inferSelect;
