export const MAX_ACTIVE_WORKERS_PER_PHASE = 8;

export function splitAlertRecipients<T extends { isProMax: boolean }>(
  qualifiedWorkers: T[],
  perPhaseLimit = MAX_ACTIVE_WORKERS_PER_PHASE,
): { proMaxWorkers: T[]; nearbyWorkers: T[] } {
  return {
    proMaxWorkers: qualifiedWorkers.filter((worker) => worker.isProMax).slice(0, perPhaseLimit),
    nearbyWorkers: qualifiedWorkers.filter((worker) => !worker.isProMax).slice(0, perPhaseLimit),
  };
}
