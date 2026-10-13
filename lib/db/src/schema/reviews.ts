import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { servicesTable } from "./services";
import { usersTable } from "./users";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  workerRating: integer("worker_rating"),
  workerComment: text("worker_comment"),
  reviewedByWorker: boolean("reviewed_by_worker").notNull().default(false),
  recommends: boolean("recommends"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Una sola fila por (servicio, cliente): la reseña del cliente y la
  // calificación del experto comparten fila (migración 0049).
  uniqueIndex("uq_reviews_service_client").on(table.serviceId, table.clientId),
]);

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;
