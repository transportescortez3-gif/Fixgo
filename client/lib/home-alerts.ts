export interface HomeAlertRecord {
  id: number;
  relatedId?: number | null;
  createdAt?: string | Date | null;
  [key: string]: unknown;
}

function getAlertTime(alert: HomeAlertRecord): number {
  if (!alert.createdAt) return 0;
  const timestamp = new Date(alert.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareAlerts(a: HomeAlertRecord, b: HomeAlertRecord): number {
  const timeDifference = getAlertTime(a) - getAlertTime(b);
  return timeDifference !== 0 ? timeDifference : a.id - b.id;
}

export function getHomeAlertKey(alert: HomeAlertRecord): string {
  return alert.relatedId == null
    ? `notification:${alert.id}`
    : `service:${alert.relatedId}`;
}

/**
 * Reduce las notificaciones que Home puede mostrar a una sola por trabajo.
 * El historial de notificaciones no se modifica: solo se reduce la vista.
 */
export function selectCurrentHomeAlerts<T extends HomeAlertRecord>(alerts: T[]): T[] {
  const latestByWork = new Map<string, T>();

  for (const alert of alerts) {
    const key = getHomeAlertKey(alert);
    const current = latestByWork.get(key);
    if (!current || compareAlerts(alert, current) > 0) {
      latestByWork.set(key, alert);
    }
  }

  return Array.from(latestByWork.values()).sort((a, b) => compareAlerts(b, a));
}