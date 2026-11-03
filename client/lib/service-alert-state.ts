export interface ServiceAlertPayload {
  serviceId: number;
  deliveryId?: string;
  title: string;
  clientName: string;
  convivenciaScore: number | null;
  distanceKm: number | null;
  phase?: "promax" | "nearby";
  totalSeconds?: number;
  modalSeconds?: number;
  budgetNote?: string | null;
}

export interface QueuedServiceAlert extends ServiceAlertPayload {
  expiresAt: number;
  modalExpiresAt: number;
}

export function mergeIncomingServiceAlert(
  queue: QueuedServiceAlert[],
  payload: ServiceAlertPayload,
  now = Date.now(),
): { queue: QueuedServiceAlert[]; resetHandled: boolean } {
  const expiresAt = now + (payload.totalSeconds ?? 60) * 1000;
  const modalExpiresAt = now + Math.min(payload.modalSeconds ?? 60, payload.totalSeconds ?? 60) * 1000;
  const existingIndex = queue.findIndex((alert) => alert.serviceId === payload.serviceId);

  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    if (existing.expiresAt > now) {
      if (payload.deliveryId && existing.deliveryId === payload.deliveryId &&
          existing.budgetNote !== payload.budgetNote) {
        const updated = [...queue];
        updated[existingIndex] = {
          ...existing,
          budgetNote: payload.budgetNote,
        };
        return { queue: updated, resetHandled: false };
      }

      // A replay or retry for this still-active service is the same alert,
      // even if it carries a newly generated delivery id. Never restart its
      // timer or create a second modal for the same worker/service.
      return { queue, resetHandled: false };
    }

    if (payload.deliveryId && existing.deliveryId === payload.deliveryId) {
      return { queue, resetHandled: false };
    }

    const updated = [...queue];
    updated[existingIndex] = { ...payload, expiresAt, modalExpiresAt };
    return { queue: updated, resetHandled: true };
  }

  return {
    queue: [...queue, { ...payload, expiresAt, modalExpiresAt }],
    resetHandled: true,
  };
}
