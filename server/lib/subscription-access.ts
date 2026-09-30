import { and, desc, eq, sql } from "drizzle-orm";
import { db, subscriptionPlansTable, userSubscriptionsTable } from "../db";

export type ActiveSubscriptionPlan = {
  planCode: string;
  features: Record<string, unknown>;
};

export async function getActivePlanForUser(userId: number): Promise<ActiveSubscriptionPlan | null> {
  const [row] = await db
    .select({
      planCode: userSubscriptionsTable.planCode,
      features: subscriptionPlansTable.features,
    })
    .from(userSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(userSubscriptionsTable.planCode, subscriptionPlansTable.code))
    .where(and(
      eq(userSubscriptionsTable.userId, userId),
      sql`${userSubscriptionsTable.status} IN ('active', 'trialing')`,
    ))
    .orderBy(desc(userSubscriptionsTable.createdAt))
    .limit(1);

  return row
    ? { planCode: row.planCode, features: (row.features ?? {}) as Record<string, unknown> }
    : null;
}

export function featureValue(
  plan: ActiveSubscriptionPlan | null | undefined,
  key: string,
): unknown {
  return plan?.features?.[key];
}

export function featureEnabled(
  plan: ActiveSubscriptionPlan | null | undefined,
  key: string,
): boolean {
  const value = featureValue(plan, key);
  return value === true || (typeof value === "number" && value !== 0) || value === "advanced" || value === "basic";
}

export function featureLimit(
  plan: ActiveSubscriptionPlan | null | undefined,
  key: string,
  fallback: number,
): number {
  const value = featureValue(plan, key);
  return typeof value === "number" ? value : fallback;
}