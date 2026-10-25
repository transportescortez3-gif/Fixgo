export const NEARBY_DELAY_MS = 10_000;

export interface ActiveWorkerPlanRow {
  userId: number;
  id: number;
  planCode: string;
  features: Record<string, unknown> | null;
  createdAt: Date;
}

/** Resolve overlapping active/trial subscriptions the same way as /subscriptions/me. */
export function resolveLatestWorkerPlans(
  rows: readonly ActiveWorkerPlanRow[],
): Map<number, { planCode: string; features: Record<string, unknown> }> {
  const latest = new Map<number, ActiveWorkerPlanRow>();
  for (const row of rows) {
    const current = latest.get(row.userId);
    if (
      !current ||
      row.createdAt.getTime() > current.createdAt.getTime() ||
      (row.createdAt.getTime() === current.createdAt.getTime() && row.id > current.id)
    ) {
      latest.set(row.userId, row);
    }
  }
  return new Map([...latest].map(([userId, row]) => [
    userId,
    { planCode: row.planCode, features: row.features ?? {} },
  ]));
}

export function splitAlertRecipients<T extends { isProMax: boolean }>(
  qualifiedWorkers: T[],
): { proMaxWorkers: T[]; nearbyWorkers: T[] } {
  return {
    proMaxWorkers: qualifiedWorkers.filter((worker) => worker.isProMax),
    nearbyWorkers: qualifiedWorkers.filter((worker) => !worker.isProMax),
  };
}
