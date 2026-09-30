import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { firebaseConfig } from "./firebase-client";

export function isWebPushConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.appId &&
    firebaseConfig.messagingSenderId &&
    import.meta.env.VITE_FIREBASE_VAPID_KEY
  );
}

export async function registerWebPush(): Promise<string | null> {
  if (!isWebPushConfigured()) return null;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
  }
  if (Notification.permission !== "granted") return null;

  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "INIT_FIREBASE", config: firebaseConfig });

    if (!getApps().length) {
      initializeApp(firebaseConfig);
    }
    const messaging = getMessaging();

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || "Fixgo";
      const body = payload.notification?.body || "";
      if (Notification.permission === "granted") {
        registration.showNotification(title, {
          body,
          icon: "/favicon.png",
          data: { link: payload.fcmOptions?.link || payload.data?.link || "/notifications" },
        });
      }
    });

    return token ?? null;
  } catch {
    return null;
  }
}
