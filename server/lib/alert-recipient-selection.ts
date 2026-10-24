export const NEARBY_DELAY_MS = 10_000;

export function splitAlertRecipients<T extends { isProMax: boolean }>(
  qualifiedWorkers: T[],
): { proMaxWorkers: T[]; nearbyWorkers: T[] } {
  return {
    proMaxWorkers: qualifiedWorkers.filter((worker) => worker.isProMax),
    nearbyWorkers: qualifiedWorkers.filter((worker) => !worker.isProMax),
  };
}
