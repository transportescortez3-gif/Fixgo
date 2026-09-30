import { pgTable, serial, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const workerCategoriesTable = pgTable("worker_categories", {
  id:         serial("id").primaryKey(),
  workerId:   integer("worker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id, { onDelete: "cascade" }),
  isPrimary:  boolean("is_primary").notNull().default(false),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_worker_category").on(table.workerId, table.categoryId),
  index("idx_worker_categories_worker_id").on(table.workerId),
  index("idx_worker_categories_category_id").on(table.categoryId),
]);
