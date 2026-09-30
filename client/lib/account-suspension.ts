export interface AccountSuspensionEvent {
  suspendedUntil?: string | null;
  level?: number;
}

export function applyAccountSuspension<T extends Record<string, unknown>>(
  current: T | undefined,
  event: AccountSuspensionEvent,
): T | undefined {
  if (!current || !event.suspendedUntil) return current;
  return {
    ...current,
    isAvailable: false,
    suspendedUntil: event.suspendedUntil,
  };
}