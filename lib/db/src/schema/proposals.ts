import { pgTable, text, serial, timestamp, integer, real, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { servicesTable } from "./services";

export const proposalStatusEnum = pgEnum("proposal_status", ["pending", "open_chat", "worker_accepted", "accepted", "rejected", "countered"]);

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  proposedPrice: real("proposed_price"),
  message: text("message"),
  status: proposalStatusEnum("status").notNull().default("pending"),
  counterPrice: real("counter_price"),
  counterMessage: text("counter_message"),
  lastCounterBy: text("last_counter_by"),
  estimatedTime: text("estimated_time"),
  workerSelfieUrl: text("worker_selfie_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_proposals_service_id").on(table.serviceId),
  index("idx_proposals_worker_id").on(table.workerId),
  index("idx_proposals_status").on(table.status),
]);

export const insertProposalSchema = createInsertSchema(proposalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposalsTable.$inferSelect;
