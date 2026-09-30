export interface SuspensionLevelInput {
  suspensionCount: number | null | undefined;
  currentMonthCancellations: number;
  previousMonthCancellations: number;
}

export type LateCancellationAction = "warning" | "suspension";

export function getLateCancellationAction(currentMonthCancellations: number): LateCancellationAction {
  return currentMonthCancellations >= 3 ? "suspension" : "warning";
}

/**
 * Returns the temporary suspension length for the current month's late
 * cancellation count.
 *
 * The first two late cancellations are warnings. The third is 24 hours, the
 * fourth is 7 days, and the fifth and later are 30 days. The suspension count
 * is retained for history and reporting, but the monthly count drives the
 * current escalation.
 */
export function getSuspensionDurationHours(input: SuspensionLevelInput): number {
  if (input.currentMonthCancellations >= 5) return 30 * 24;
  if (input.currentMonthCancellations === 4) return 7 * 24;
  if (input.currentMonthCancellations === 3) return 24;
  return 0;
}

export function getSuspensionUntil(
  now: Date,
  input: SuspensionLevelInput,
): Date {
  return new Date(
    now.getTime() + getSuspensionDurationHours(input) * 60 * 60 * 1000,
  );
}