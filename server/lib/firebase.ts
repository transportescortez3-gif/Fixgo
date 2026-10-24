import admin from "firebase-admin";
import { logger } from "./logger";

let initialized = false;

export function getFirebaseApp(): admin.app.App | null {
  if (initialized) return admin.apps[0] || null;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn("Firebase not configured — push notifications disabled. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.");
    initialized = true;
    return null;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    initialized = true;
    logger.info("Firebase Admin initialized — push notifications enabled");
    return admin.apps[0]!;
  } catch (err) {
    logger.error({ err }, "Failed to initialize Firebase Admin");
    initialized = true;
    return null;
  }
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  highPriority = false,
  androidData?: Record<string, string>,
): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;

  const isServiceAlert = highPriority &&
    (data?.type === "service_request" || data?.type === "worker_arrived");
  const channelId = isServiceAlert
    ? "fixgo_service_alerts_v2"
    : highPriority
      ? "fixxer_urgent"
      : "fixxer_default";
  const messageData = isServiceAlert
    ? { ...data, title, body }
    : data;
  const link = data?.type === "subscription_expiry"
    ? "/mi-plan"
    : data?.relatedId
    ? `/services/${data.relatedId}`
    : "/notifications";

  try {
    await admin.messaging(app).send({
      token: fcmToken,
      // Android service/arrival alerts are deliberately data-only. The native
      // messaging service owns their single background notification; the
      // top-level notification block would make Android auto-post a duplicate.
      ...(!isServiceAlert ? { notification: { title, body } } : {}),
      android: {
        priority: "high",
        ...(isServiceAlert
          ? {
              ttl: 60_000,
              data: data?.type === "service_request" && androidData
                ? { ...messageData, ...androidData }
                : messageData,
            }
          : {
              notification: {
                sound: highPriority ? "alarm" : "default",
                channelId,
                priority: highPriority ? "max" as const : "default" as const,
                defaultVibrateTimings: highPriority,
              },
            }),
      },
      apns: {
        headers: {
          "apns-priority": highPriority ? "10" : "5",
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            ...(isServiceAlert ? { alert: { title, body } } : {}),
            sound: highPriority ? { critical: true, name: "default", volume: 1.0 } : "default",
            ...(highPriority ? { "interruption-level": "time-sensitive" } : {}),
          },
        },
      },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        },
        fcmOptions: { link },
      },
      data: messageData,
    });
    return true;
  } catch (err: any) {
    if (err?.errorInfo?.code === "messaging/registration-token-not-registered") {
      logger.info({ fcmToken: fcmToken.slice(-8) }, "FCM token expired/unregistered — skipping");
    } else {
      logger.warn({ err }, "Failed to send push notification");
    }
    return false;
  }
}

/**
 * Envía un mensaje FCM **solo de datos** (sin bloque `notification`) con máxima
 * prioridad. Esto es lo que despierta a la app Android cerrada/en background:
 * los mensajes data-only siempre invocan `onMessageReceived` en el servicio
 * nativo (FixgoMessagingService), que construye la pantalla de llamada
 * entrante a pantalla completa. Un mensaje con bloque `notification` NO llama a
 * `onMessageReceived` cuando la app está en background, por eso usamos data-only.
 */
export async function sendDataMessage(
  fcmToken: string,
  data: Record<string, string>
): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return;

  try {
    await admin.messaging(app).send({
      token: fcmToken,
      android: {
        priority: "high",
        // ttl 0 → entregar ya o descartar; una llamada vieja no sirve.
        ttl: 60_000,
      },
      data,
    });
  } catch (err: any) {
    if (err?.errorInfo?.code === "messaging/registration-token-not-registered") {
      logger.info({ fcmToken: fcmToken.slice(-8) }, "FCM token expired/unregistered — skipping");
    } else {
      logger.warn({ err }, "Failed to send data message");
    }
  }
}
