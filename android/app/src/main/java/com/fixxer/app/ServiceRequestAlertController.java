package com.fixxer.app;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

/** Chooses the Android presentation path and owns request-alert notifications. */
public final class ServiceRequestAlertController {
    private static final String PREFS = "service_request_alert_state";
    private static final String PREF_ACTIVE_DELIVERY_ID = "active_delivery_id";
    private static final Handler EXPIRY_HANDLER = new Handler(Looper.getMainLooper());

    private ServiceRequestAlertController() {}

    public static void present(Context context, ServiceRequestAlert alert) {
        Context appContext = context.getApplicationContext();
        if (alert == null || alert.remainingMillis() <= 0L) return;
        if (MainActivity.isInForeground || ServiceRequestAlertActivity.isInForeground) return;

        rememberActiveAlert(appContext, alert);
        EXPIRY_HANDLER.postDelayed(
                () -> expire(appContext, alert.deliveryId),
                alert.remainingMillis());

        if (isScreenLockedOrOff(appContext)) {
            ServiceRequestOverlay.hideVisible(appContext, null);
            postUrgentNotification(appContext, alert, true);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && Settings.canDrawOverlays(appContext)) {
            ServiceRequestOverlay.show(appContext, alert, shown -> {
                if (alert.remainingMillis() <= 0L) {
                    expire(appContext, alert.deliveryId);
                    return;
                }
                if (MainActivity.isInForeground || ServiceRequestAlertActivity.isInForeground) {
                    ServiceRequestOverlay.hideVisible(appContext, alert.deliveryId);
                    return;
                }
                if (shown) {
                    postQuietNotification(appContext, alert);
                } else {
                    postUrgentNotification(appContext, alert, false);
                }
            });
            return;
        }

        ServiceRequestOverlay.hideVisible(appContext, null);
        postUrgentNotification(appContext, alert, false);
    }

    /** Called after the expert chooses to open the request in FixMaster. */
    public static void openRequest(Context context, ServiceRequestAlert alert) {
        if (alert == null) return;
        ServiceRequestOverlay.markDismissed(context, alert);
        ServiceRequestOverlay.hideVisible(context, alert.deliveryId);
        cancelIfCurrent(context, alert.deliveryId);
    }

    /** Hides all native request surfaces when the active alert expires. */
    public static void expire(Context context, String deliveryId) {
        if (deliveryId == null || deliveryId.isEmpty()) return;
        ServiceRequestOverlay.hideVisible(context, deliveryId);
        cancelIfCurrent(context, deliveryId);
    }

    /** Cancels the request-alert cards only when they still represent this delivery. */
    private static void cancelIfCurrent(Context context, String deliveryId) {
        android.content.SharedPreferences prefs =
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!deliveryId.equals(prefs.getString(PREF_ACTIVE_DELIVERY_ID, null))) return;

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(FixxerMessagingService.SERVICE_REQUEST_NOTIFICATION_ID);
            manager.cancel(FixxerMessagingService.SERVICE_OVERLAY_NOTIFICATION_ID);
        }

        prefs.edit()
                .remove(PREF_ACTIVE_DELIVERY_ID)
                .apply();
    }

    private static void rememberActiveAlert(Context context, ServiceRequestAlert alert) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_ACTIVE_DELIVERY_ID, alert.deliveryId)
                .apply();
    }

    private static boolean isScreenLockedOrOff(Context context) {
        PowerManager powerManager =
                (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        KeyguardManager keyguardManager =
                (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return powerManager == null
                || !powerManager.isInteractive()
                || (keyguardManager != null && keyguardManager.isKeyguardLocked());
    }

    private static void postUrgentNotification(
            Context context,
            ServiceRequestAlert alert,
            boolean requestFullScreen) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        manager.cancel(FixxerMessagingService.SERVICE_OVERLAY_NOTIFICATION_ID);

        PendingIntent contentIntent = createContentIntent(context, alert);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, FixxerMessagingService.SERVICE_ALERT_CHANNEL_ID)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(alert.title)
                .setContentText(alert.notificationBody())
                .setStyle(new NotificationCompat.BigTextStyle().bigText(alert.notificationBody()))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setContentIntent(contentIntent);
        applyTimeout(builder, alert);

        if (requestFullScreen && canUseFullScreenIntent(manager)) {
            builder.setFullScreenIntent(contentIntent, true);
        }
        manager.notify(FixxerMessagingService.SERVICE_REQUEST_NOTIFICATION_ID, builder.build());
    }

    private static void postQuietNotification(Context context, ServiceRequestAlert alert) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        createQuietChannel(context, manager);
        manager.cancel(FixxerMessagingService.SERVICE_REQUEST_NOTIFICATION_ID);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, FixxerMessagingService.SERVICE_OVERLAY_CHANNEL_ID)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle("Solicitud pendiente")
                .setContentText(alert.notificationBody())
                .setStyle(new NotificationCompat.BigTextStyle().bigText(alert.notificationBody()))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setContentIntent(createContentIntent(context, alert));
        applyTimeout(builder, alert);
        manager.notify(FixxerMessagingService.SERVICE_OVERLAY_NOTIFICATION_ID, builder.build());
    }

    private static PendingIntent createContentIntent(Context context, ServiceRequestAlert alert) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(
                context,
                FixxerMessagingService.SERVICE_REQUEST_NOTIFICATION_ID,
                alert.createActivityIntent(context),
                flags);
    }

    private static void applyTimeout(NotificationCompat.Builder builder, ServiceRequestAlert alert) {
        long timeout = alert.remainingMillis();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && timeout > 0L) {
            builder.setTimeoutAfter(timeout);
        }
    }

    private static boolean canUseFullScreenIntent(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 34) return true;
        return manager.canUseFullScreenIntent();
    }

    private static void createQuietChannel(Context context, NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || manager.getNotificationChannel(FixxerMessagingService.SERVICE_OVERLAY_CHANNEL_ID) != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                FixxerMessagingService.SERVICE_OVERLAY_CHANNEL_ID,
                "Solicitudes abiertas",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Acceso silencioso a una solicitud mientras se muestra la ventana flotante");
        channel.enableVibration(false);
        channel.setSound(null, null);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }
}