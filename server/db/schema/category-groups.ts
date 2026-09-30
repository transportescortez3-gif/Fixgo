import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoryGroupsTable = pgTable("category_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("layers"),
  color: text("color").notNull().default("#5b7fff"),
  sortOrder: integer("sort_order").notNull().default(99),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("uq_category_groups_name").on(table.name),
]);

export const insertCategoryGroupSchema = createInsertSchema(categoryGroupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCategoryGroup = z.infer<typeof insertCategoryGroupSchema>;
export type CategoryGroup = typeof categoryGroupsTable.$inferSelect;