import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoryGroupsTable } from "./category-groups";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  // Rubro para agrupar especialidades en la UI (ej. "Hogar y mantención")
  groupName: text("group_name"),
  groupId: integer("group_id").references(() => categoryGroupsTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(99),
  isActive: boolean("is_active").notNull().default(true),
  platform: text("platform").notNull().default("expertos"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
