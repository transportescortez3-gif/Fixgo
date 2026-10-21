import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";
import { proposalsTable } from "./proposals";

export const securitySelfiesTable = pgTable("security_selfies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  role: text("role").notNull(),
  serviceId: integer("service_id").references(() => servicesTable.id),
  proposalId: integer("proposal_id").references(() => proposalsTable.id),
  purpose: text("purpose").notNull(),
  // objectPath se anula al purgar; originalObjectPath se conserva únicamente
  // para impedir que la ruta pública vuelva a exponer una selfie purgada.
  objectPath: text("object_path"),
  originalObjectPath: text("original_object_path").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_security_selfies_user_id").on(table.userId),
  index("idx_security_selfies_service_id").on(table.serviceId),
  index("idx_security_selfies_expires_at").on(table.expiresAt),
  index("idx_security_selfies_object_paths").on(table.objectPath, table.originalObjectPath),
]);

export type SecuritySelfie = typeof securitySelfiesTable.$inferSelect;