import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const certificationsTable = pgTable("certifications", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),
  issuer:          text("issuer"),
  imageUrl:        text("image_url").notNull(),
  status:          text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  verifiedBy:      integer("verified_by").references(() => usersTable.id),
  verifiedAt:      timestamp("verified_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Certification = typeof certificationsTable.$inferSelect;
