import { pgTable, text, serial, timestamp, integer, real, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";
import { subcategoriesTable } from "./subcategories";

export const serviceStatusEnum = pgEnum("service_status", ["pending", "alerting", "open", "accepted", "in_progress", "completed", "cancelled"]);

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: serviceStatusEnum("status").notNull().default("pending"),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").references(() => usersTable.id),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  subcategoryId: integer("subcategory_id").references(() => subcategoriesTable.id),
  estimatedPrice: real("estimated_price"),
  finalPrice: real("final_price"),
  address: text("address"),
  originAddress: text("origin_address"),
  destinationAddress: text("destination_address"),
  lat: real("lat"),
  lng: real("lng"),
  imageUrls: text("image_urls").array().default([]),
  isUrgent: boolean("is_urgent").notNull().default(false),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // El experto marcó "Trabajo realizado": si el cliente no confirma en 24h,
  // el sistema completa el servicio automáticamente.
  workerCompletedAt: timestamp("worker_completed_at", { withTimezone: true }),
  // El cliente marcó "Trabajo completado" primero: el experto debe confirmar.
  // Si no confirma en 24h, el sistema completa automáticamente.
  clientCompletedAt: timestamp("client_completed_at", { withTimezone: true }),
  // Cómo pagará el cliente: "cash" (efectivo) o "transfer" (transferencia).
  // Con "transfer", al completarse el trabajo la app inyecta los datos
  // bancarios oficiales del experto en el chat (nunca se comparten por fuera).
  paymentMethod: text("payment_method"),
  budgetNote: text("budget_note"),
  requestQuote: boolean("request_quote").notNull().default(false),
  clientSelfieUrl: text("client_selfie_url"),
  workerSelfieUrl: text("worker_selfie_url"),
  clientSelfieTakenAt: timestamp("client_selfie_taken_at", { withTimezone: true }),
  workerSelfieTakenAt: timestamp("worker_selfie_taken_at", { withTimezone: true }),
  // Fin de la ventana de cancelación gratis: se fija al confirmar el acuerdo
  // en el chat (ahora + 10 min). La dirección se revela al experto al expirar.
  freeCancelUntil: timestamp("free_cancel_until", { withTimezone: true }),
  freeCancelEndNotifiedAt: timestamp("free_cancel_end_notified_at", { withTimezone: true }),
  // Arrival and actual-work timestamps are separate from negotiation/assignment
  // state. A proposal may already be in_progress before work physically starts.
  workerArrivedAt: timestamp("worker_arrived_at", { withTimezone: true }),
  workStartedAt: timestamp("work_started_at", { withTimezone: true }),
  // Cancelación: quién canceló y el motivo que declaró (visible para admin).
  cancelledBy: integer("cancelled_by").references(() => usersTable.id),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  requotePrice: real("requote_price"),
  requoteStatus: text("requote_status"),
  requoteMessage: text("requote_message"),
  alreadyPaid: real("already_paid"),
  isDirectRequest: boolean("is_direct_request").notNull().default(false),
  directWorkerId: integer("direct_worker_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_services_client_id").on(table.clientId),
  index("idx_services_worker_id").on(table.workerId),
  index("idx_services_category_id").on(table.categoryId),
  index("idx_services_status").on(table.status),
  index("idx_services_scheduled_at").on(table.scheduledAt),
]);

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
