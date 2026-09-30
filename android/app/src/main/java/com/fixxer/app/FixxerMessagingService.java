package com.fixxer.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Servicio FCM de Fixgo. Extiende el servicio del plugin Capacitor para que los
 * push normales sigan funcionando (notificaciones de chat, propuestas, etc.) y
 * sólo intercepta los mensajes data-only de llamada:
 *
 *   - type == "incoming_call" → muestra la pantalla de llamada entrante a
 *     pantalla completa (IncomingCallActivity) aunque la app esté cerrada.
 *   - type == "cancel_call"   → cierra esa pantalla (el que llama colgó/contestó).
 *
 * Cualquier otro mensaje se delega a super.onMessageReceived (Capacitor).
 */
public class FixxerMessagingService extends MessagingService {

    public static final String CALL_CHANNEL_ID   = "fixxer_calls";
    public static final String URGENT_CHANNEL_ID = "fixxer_urgent";
    public static final String SERVICE_ALERT_CHANNEL_ID = "fixgo_service_alerts_v2";
    public static final String SERVICE_OVERLAY_CHANNEL_ID = "fixgo_service_overlay_silent_v1";
    public static final int CALL_NOTIFICATION_ID   = 4242;
    public static final int URGENT_NOTIFICATION_ID = 4243;
    public static final int SERVICE_ALERT_NOTIFICATION_ID = 4244;
    public static final int SERVICE_OVERLAY_NOTIFICATION_ID = 4245;
    public static final int SERVICE_REQUEST_NOTIFICATION_ID = 4246;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;

        if ("incoming_call".equals(type)) {
            showIncomingCall(data);
            return;
        }
        if ("cancel_call".equals(type)) {
            cancelIncomingCall();
            return;
        }

        // Una ruta por estado: con la app abierta, Socket.IO presenta la alerta.
        // En segundo plano, service_request usa sus superficies nativas; no
        // delegar el mismo aviso al plugin después de publicarlo.
        if ("service_request".equals(type)) {
            if (MainActivity.isInForeground) {
                super.onMessageReceived(remoteMessage);
                return;
            }
            ServiceRequestAlert alert = ServiceRequestAlert.fromData(data);
            if (alert == null) {
                // Compatibilidad con mensajes de servidores anteriores que aún
                // no envían el vencimiento en el payload.
                Log.w("FixgoPush", "service_request sin vencimiento válido; usando notificación estándar");
                showServiceAlertNotification(remoteMessage);
                return;
            }
            if (alert.remainingMillis() <= 0L) {
                ServiceRequestAlertController.expire(this, alert.deliveryId);
                return;
            }
            createServiceAlertChannel();
            ServiceRequestAlertController.present(this, alert);
            return;
        }

        // La llegada al domicilio conserva exactamente la ruta anterior.
        if ("worker_arrived".equals(type)) {
            if (MainActivity.isInForeground) {
                super.onMessageReceived(remoteMessage);
                return;
            }
            showServiceAlertNotification(remoteMessage);
            return;
        }

        // Los acuerdos conservan su canal y comportamiento actual.
        if ("agreement".equals(type)) {
            showUrgentNotification(remoteMessage);
            super.onMessageReceived(remoteMessage);
            return;
        }

        // Resto de push → comportamiento estándar del plugin Capacitor.
        super.onMessageReceived(remoteMessage);
    }

    private void createUrgentChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(URGENT_CHANNEL_ID) != null) return;

            NotificationChannel channel = new NotificationChannel(
                    URGENT_CHANNEL_ID, "Solicitudes urgentes", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Alertas de nuevos trabajos y acuerdos pactados");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 400, 200, 400});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableLights(true);

            Uri notifSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            channel.setSound(notifSound, attrs);

            nm.createNotificationChannel(channel);
        }
    }

    private void createServiceAlertChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || nm.getNotificationChannel(SERVICE_ALERT_CHANNEL_ID) != null) return;

            NotificationChannel channel = new NotificationChannel(
                    SERVICE_ALERT_CHANNEL_ID,
                    "Solicitudes y llegadas",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Alertas sonoras de solicitudes de trabajo y llegada del experto");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 250, 500});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableLights(true);

            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            channel.setSound(sound, attrs);
            nm.createNotificationChannel(channel);
        }
    }

    private void showServiceAlertNotification(RemoteMessage remoteMessage) {
        createServiceAlertChannel();
        Map<String, String> data = remoteMessage.getData();
        String title = data != null && data.containsKey("title") ? data.get("title") : "Fixgo";
        String body = data != null && data.containsKey("body") ? data.get("body") : "";
        String relatedId = data != null ? data.get("relatedId") : null;

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (relatedId != null && !relatedId.isEmpty()) {
            openApp.setAction(Intent.ACTION_VIEW);
            openApp.setData(Uri.parse("fixgo://app/services/" + Uri.encode(relatedId)));
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(
                this, SERVICE_ALERT_NOTIFICATION_ID, openApp, piFlags);

        Notification notification = new NotificationCompat.Builder(this, SERVICE_ALERT_CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(SERVICE_ALERT_NOTIFICATION_ID, notification);
    }

    private void showUrgentNotification(RemoteMessage remoteMessage) {
        createUrgentChannel();

        RemoteMessage.Notification notif = remoteMessage.getNotification();
        Map<String, String> data = remoteMessage.getData();

        String title = notif != null && notif.getTitle() != null
                ? notif.getTitle()
                : (data != null && data.containsKey("title") ? data.get("title") : "Fixgo");
        String body = notif != null && notif.getBody() != null
                ? notif.getBody()
                : (data != null && data.containsKey("body") ? data.get("body") : "");

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(this, URGENT_NOTIFICATION_ID, openApp, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, URGENT_CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pi);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(URGENT_NOTIFICATION_ID, builder.build());
    }

    private void createCallChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(CALL_CHANNEL_ID) != null) return;

            NotificationChannel channel = new NotificationChannel(
                    CALL_CHANNEL_ID, "Llamadas", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Llamadas de voz entrantes");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 1000, 1000, 1000, 1000});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            channel.setSound(ringtone, attrs);

            nm.createNotificationChannel(channel);
        }
    }

    private void showIncomingCall(Map<String, String> data) {
        createCallChannel();

        // Si la app está en primer plano, el overlay web ya recibe la llamada
        // por socket (call:incoming). Lanzar IncomingCallActivity encima
        // provocaría que aparezcan DOS pantallas de llamada simultáneas.
        // En ese caso ignoramos el push FCM por completo.
        if (MainActivity.isInForeground) return;

        String callerName = data.get("callerName");
        if (callerName == null || callerName.isEmpty()) callerName = "Llamada entrante";

        Intent fullScreen = new Intent(this, IncomingCallActivity.class);
        fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreen.putExtra("callerName", callerName);
        fullScreen.putExtra("callerId", data.get("callerId"));
        fullScreen.putExtra("calleeId", data.get("calleeId"));
        fullScreen.putExtra("serviceId", data.get("serviceId"));
        fullScreen.putExtra("rejectToken", data.get("rejectToken"));

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent fullScreenPI = PendingIntent.getActivity(this, 0, fullScreen, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle("Llamada entrante")
                .setContentText(callerName)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreenPI)
                .setFullScreenIntent(fullScreenPI, true);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(CALL_NOTIFICATION_ID, builder.build());

        // Cuando la pantalla está encendida/desbloqueada el full-screen-intent
        // puede no auto-lanzar la Activity; intentamos lanzarla directamente.
        try {
            startActivity(fullScreen);
        } catch (Exception ignored) {
        }
    }

    private void cancelIncomingCall() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CALL_NOTIFICATION_ID);
        sendBroadcast(new Intent(IncomingCallActivity.ACTION_FINISH).setPackage(getPackageName()));
    }
}
