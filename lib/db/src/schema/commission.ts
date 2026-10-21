import { pgTable, serial, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionConfigTable = pgTable("commission_config", {
  id: serial("id").primaryKey(),
  rate: real("rate").notNull().default(0.15),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCommissionConfigSchema = createInsertSchema(commissionConfigTable).omit({ id: true });
export type InsertCommissionConfig = z.infer<typeof insertCommissionConfigSchema>;
export type CommissionConfig = typeof commissionConfigTable.$inferSelect;
