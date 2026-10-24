import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "./use-auth";
import { registerWebPush, isWebPushConfigured } from "@/lib/firebase-messaging";
import { APP_URL } from "@/lib/app-config";

function reportPushSetupIssue(code: string) {
  const message = `[push] ${code}`;
  console.error(message);
  try {
    void fetch(`${Capacitor.isNativePlatform() ? APP_URL : ""}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        url: window.location.pathname,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});
  } catch {}
}

async function registerFcmToken(token: string, platform: "native" | "web" = "native") {
  try {
    const jwt = localStorage.getItem("fixgo_token");
    if (!jwt) {
      reportPushSetupIssue("token-save-skipped-no-session");
      return;
    }
    const response = await fetch(`${Capacitor.isNativePlatform() ? APP_URL : ""}/api/notifications/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token, platform }),
    });
    if (!response.ok) {
      reportPushSetupIssue(`token-save-http-${response.status}`);
      return;
    }
    const result = await response.json().catch(() => null);
    if (result?.firebaseConfigured === false) {
      reportPushSetupIssue("server-firebase-not-configured");
    }
  } catch {
    reportPushSetupIssue("token-save-network-error");
  }
}

const INACTIVE_SERVICE_STATUSES = new Set(["completed", "cancelled"]);

const ALWAYS_NAVIGATE_TYPES = new Set([
  "service_completed",
  "service_cancelled",
  "connection_closed",
  "review",
]);

const ACTIVE_PUSH_TYPES = new Set([
  "service_request",
  "worker_arrived",
  "new_message",
  "proposal_received",
  "proposal_accepted",
  "counter_offer",
  "proposal_rejected",
  "service_accepted",
]);

// No tocar el bridge de permisos durante el primer render nativo. El release
// que produjo el cierre llamaba requestPermissions() desde este hook y el
// plugin Android terminaba en una NullPointerException dentro de Capacitor.
const NATIVE_PUSH_START_DELAY_MS = 1500;

async function navigateFromPushData(data: Record<string, any>) {
  if (!data?.type) return;
  const type = data.type as string;
  const id = data.relatedId as string | undefined;

  if (type === "subscription_expiry") {
    window.location.href = "/mi-plan";
    return;
  }

  if (!id) return;

  if (ALWAYS_NAVIGATE_TYPES.has(type)) {
    window.location.href = `/services/${id}`;
    return;
  }

  if (ACTIVE_PUSH_TYPES.has(type)) {
    try {
      const jwt = localStorage.getItem("fixgo_token");
      const res = await fetch(`${Capacitor.isNativePlatform() ? APP_URL : ""}/api/services/${id}`, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      });
      if (res.ok) {
        const service = await res.json();
        if (!INACTIVE_SERVICE_STATUSES.has(service?.status)) {
          window.location.href = `/services/${id}`;
        }
      }
    } catch {
      window.location.href = `/services/${id}`;
    }
  }
}

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    if (Capacitor.isNativePlatform()) {
      let cleanup: (() => void) | undefined;
      let cancelled = false;
      const timer = window.setTimeout(() => {
        (async () => {
          try {
            const { PushNotifications } = await import(/* @vite-ignore */"@capacitor/push-notifications");
            if (cancelled) return;

            // Instalar los listeners antes de registrar para no perder el
            // token inicial ni una acción de una notificación pendiente.
            const regHandler = await PushNotifications.addListener("registration", async (token) => {
              await registerFcmToken(token.value, "native");
            });

            const errorHandler = await PushNotifications.addListener("registrationError", () => {
              reportPushSetupIssue("native-registration-error");
            });

            const actionHandler = await PushNotifications.addListener("pushNotificationActionPerformed", async (action) => {
              await navigateFromPushData(action.notification.data || {});
            });

            cleanup = () => {
              void regHandler.remove();
              void errorHandler.remove();
              void actionHandler.remove();
            };

            // Pedir el permiso después de que el plugin esté listo. Los
            // listeners ya están instalados para no perder eventos durante
            // el diálogo ni el token inicial.
            const permission = await PushNotifications.requestPermissions();
            if (cancelled) return;
            if (permission.receive !== "granted") {
              reportPushSetupIssue("native-notification-permission-not-granted");
              return;
            }

            await PushNotifications.register();
          } catch {
            reportPushSetupIssue("native-push-initialization-failed");
          }
        })();
      }, NATIVE_PUSH_START_DELAY_MS);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        cleanup?.();
      };
    }

    if (isWebPushConfigured()) {
      registerWebPush().then((token) => {
        if (token) registerFcmToken(token, "web");
        else reportPushSetupIssue("web-token-unavailable");
      }).catch(() => reportPushSetupIssue("web-registration-failed"));

      const onSwMessage = (event: MessageEvent) => {
        if (event.data?.type === "NOTIFICATION_CLICK" && event.data.link) {
          window.location.href = event.data.link;
        }
      };
      navigator.serviceWorker?.addEventListener("message", onSwMessage);
      return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    }
  }, [user?.id]);
}
