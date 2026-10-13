import { pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const planIntervalEnum = pgEnum("plan_interval", ["monthly", "annual"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "cancelled", "expired"]);
export const couponDiscountTypeEnum = pgEnum("coupon_discount_type", ["percent", "fixed"]);

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id:         serial("id").primaryKey(),
  code:       text("code").unique().notNull(),
  name:       text("name").notNull(),
  role:       text("role").notNull(),
  interval:   planIntervalEnum("interval").notNull(),
  priceClp:   integer("price_clp").notNull(),
  features:   jsonb("features").notNull().default({}),
  isActive:   boolean("is_active").notNull().default(true),
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSubscriptionsTable = pgTable("user_subscriptions", {
  id:                   serial("id").primaryKey(),
  userId:               integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planCode:             text("plan_code").notNull(),
  status:               subscriptionStatusEnum("status").notNull().default("active"),
  interval:             planIntervalEnum("interval").notNull(),
  pricePaidClp:         integer("price_paid_clp").notNull().default(0),
  couponCode:           text("coupon_code"),
  discountClp:          integer("discount_clp").notNull().default(0),
  trialEndsAt:          timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart:   timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd:     timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelledAt:          timestamp("cancelled_at", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_user_subscriptions_user_id").on(table.userId),
]);

export const subscriptionPaymentsTable = pgTable("subscription_payments", {
  id:             serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => userSubscriptionsTable.id, { onDelete: "cascade" }),
  userId:         integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amountClp:      integer("amount_clp").notNull(),
  tbkToken:       text("tbk_token"),
  tbkBuyOrder:    text("tbk_buy_order"),
  tbkSessionId:   text("tbk_session_id"),
  tbkAuthCode:    text("tbk_auth_code"),
  tbkCardNumber:  text("tbk_card_number"),
  status:         text("status").notNull().default("pending"),
  periodStart:    timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd:      timestamp("period_end", { withTimezone: true }).notNull(),
  paidAt:         timestamp("paid_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const couponsTable = pgTable("coupons", {
  id:             serial("id").primaryKey(),
  code:           text("code").unique().notNull(),
  discountType:   couponDiscountTypeEnum("discount_type").notNull(),
  discountValue:  integer("discount_value").notNull(),
  maxUses:        integer("max_uses"),
  usedCount:      integer("used_count").notNull().default(0),
  validPlans:     text("valid_plans").array(),
  validIntervals: text("valid_intervals").array(),
  expiresAt:      timestamp("expires_at", { withTimezone: true }),
  isActive:       boolean("is_active").notNull().default(true),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const couponUsesTable = pgTable("coupon_uses", {
  id:        serial("id").primaryKey(),
  couponId:  integer("coupon_id").notNull().references(() => couponsTable.id),
  userId:    integer("user_id").notNull().references(() => usersTable.id),
  usedAt:    timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});
