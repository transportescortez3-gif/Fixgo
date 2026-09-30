importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "INIT_FIREBASE" && event.data.config) {
    try {
      firebase.initializeApp(event.data.config);
      const messaging = firebase.messaging();

      messaging.onBackgroundMessage((payload) => {
        const title = payload.notification?.title || payload.data?.title || "Fixgo";
        const body = payload.notification?.body || payload.data?.body || "";
        const link = payload.fcmOptions?.link || payload.data?.link || "/notifications";

        self.registration.showNotification(title, {
          body,
          icon: "/favicon.png",
          badge: "/favicon.png",
          data: { link, ...payload.data },
        });
      });
    } catch (e) {
      // Firebase ya pudo haber sido inicializado por otra pestaña
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", link });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    })
  );
});
