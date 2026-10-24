export interface ServiceAlertPayload {
  serviceId: number;
  deliveryId?: string;
  title: string;
  clientName: string;
  convivenciaScore: number | null;
  distanceKm: number | null;
  phase?: "promax" | "nearby";
  totalSeconds?: number;
  budgetNote?: string | null;
}

export interface QueuedServiceAlert extends ServiceAlertPayload {
  expiresAt: number;
}

export function mergeIncomingServiceAlert(
  queue: QueuedServiceAlert[],
  payload: ServiceAlertPayload,
  now = Date.now(),
): { queue: QueuedServiceAlert[]; resetHandled: boolean } {
  const expiresAt = now + (payload.totalSeconds ?? 60) * 1000;
  const existingIndex = queue.findIndex((alert) => alert.serviceId === payload.serviceId);

  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    if (payload.deliveryId && existing.deliveryId === payload.deliveryId) {
      if (existing.budgetNote === payload.budgetNote) {
        return { queue, resetHandled: false };
      }

      const updated = [...queue];
      updated[existingIndex] = {
        ...existing,
        ...payload,
        totalSeconds: existing.totalSeconds,
        expiresAt: existing.expiresAt,
      };
      return { queue: updated, resetHandled: false };
    }

    if (payload.deliveryId && existing.deliveryId !== payload.deliveryId) {
      const updated = [...queue];
      updated[existingIndex] = { ...payload, expiresAt };
      return { queue: updated, resetHandled: true };
    }

    if (existing.expiresAt > now) {
      return { queue, resetHandled: false };
    }

    const updated = [...queue];
    updated[existingIndex] = { ...payload, expiresAt };
    return { queue: updated, resetHandled: true };
  }

  return {
    queue: [...queue, { ...payload, expiresAt }],
    resetHandled: true,
  };
}
