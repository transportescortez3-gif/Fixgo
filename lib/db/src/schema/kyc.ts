import { pgTable, text, serial, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const kycStatusEnum = pgEnum("kyc_status", ["not_submitted", "pending", "approved", "rejected"]);
export const kycDocumentTypeEnum = pgEnum("kyc_document_type", ["cedula", "licencia", "pasaporte"]);

export const kycDocumentsTable = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  documentType: kycDocumentTypeEnum("document_type").notNull().default("cedula"),
  rut: text("rut").notNull(),
  fullName: text("full_name").notNull(),
  cedulaFrontPath: text("cedula_front_path").notNull(),
  cedulaBackPath: text("cedula_back_path").notNull(),
  selfiePath: text("selfie_path").notNull(),
  antecedentesPath: text("antecedentes_path").notNull().default(""),
  status: kycStatusEnum("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KycDocument = typeof kycDocumentsTable.$inferSelect;
