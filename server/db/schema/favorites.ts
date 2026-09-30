import { pgTable, text, serial, timestamp, integer, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userFavoritesTable = pgTable("user_favorites", {
  id: serial("id").primaryKey(),
  vinculadorId: integer("vinculador_id").notNull().references(() => usersTable.id),
  vinculadoId: integer("vinculado_id").notNull().references(() => usersTable.id),
  tipoRelacion: text("tipo_relacion").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_favorites_vinculador").on(table.vinculadorId),
  index("idx_favorites_vinculado").on(table.vinculadoId),
  unique("uq_favorite").on(table.vinculadorId, table.vinculadoId, table.tipoRelacion),
]);

export const insertFavoriteSchema = createInsertSchema(userFavoritesTable).omit({ id: true, createdAt: true });
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type UserFavorite = typeof userFavoritesTable.$inferSelect;
