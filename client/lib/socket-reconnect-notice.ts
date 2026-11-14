import type { SocketAuthStatus } from "@/hooks/use-socket";

type TimerHandle = ReturnType<typeof setTimeout>;

interface SocketReconnectNoticeOptions {
  delayMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (timer: TimerHandle) => void;
}

export function createSocketReconnectNoticeController(
  onVisibilityChange: (visible: boolean) => void,
  options: SocketReconnectNoticeOptions = {},
) {
  const delayMs = options.delayMs ?? 3_000;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer));

  let disconnectedAt: number | null = null;
  let timer: TimerHandle | null = null;
  let visible = false;
  let disposed = false;

  const setVisible = (next: boolean) => {
    if (visible === next || disposed) return;
    visible = next;
    onVisibilityChange(next);
  };

  const clearTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  const scheduleWarning = () => {
    if (disconnectedAt === null || disposed) return;
    clearTimer();
    const remaining = Math.max(0, delayMs - (now() - disconnectedAt));
    timer = schedule(() => {
      timer = null;
      if (disconnectedAt !== null) setVisible(true);
    }, remaining);
  };

  return {
    update(status: SocketAuthStatus) {
      if (disposed) return;
      if (status === "disconnected") {
        disconnectedAt ??= now();
        scheduleWarning();
        return;
      }
      if (status === "checking" && disconnectedAt !== null) {
        scheduleWarning();
        return;
      }
      if (status === "authenticated" || status === "unauthenticated") {
        disconnectedAt = null;
        clearTimer();
        setVisible(false);
      }
    },
    dispose() {
      disposed = true;
      disconnectedAt = null;
      clearTimer();
    },
  };
}
