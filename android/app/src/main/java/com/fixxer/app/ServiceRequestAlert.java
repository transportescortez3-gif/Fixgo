package com.fixxer.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** Data and intents shared by the native service-request alert surfaces. */
public final class ServiceRequestAlert {
    public static final String EXTRA_DELIVERY_ID = "serviceRequestDeliveryId";
    public static final String EXTRA_SERVICE_ID = "serviceRequestServiceId";
    public static final String EXTRA_TITLE = "serviceRequestTitle";
    public static final String EXTRA_BODY = "serviceRequestBody";
    public static final String EXTRA_EXPIRES_AT = "serviceRequestExpiresAt";

    public final String deliveryId;
    public final String serviceId;
    public final String title;
    public final String body;
    public final long expiresAt;

    private ServiceRequestAlert(
            String deliveryId,
            String serviceId,
            String title,
            String body,
            long expiresAt) {
        this.deliveryId = deliveryId;
        this.serviceId = serviceId;
        this.title = title;
        this.body = body;
        this.expiresAt = expiresAt;
    }

    public static ServiceRequestAlert fromData(Map<String, String> data) {
        if (data == null) return null;
        String serviceId = clean(data.get("relatedId"));
        String deliveryId = clean(data.get("deliveryId"));
        String expiresAtValue = clean(data.get("alertExpiresAt"));
        if (serviceId.isEmpty() || deliveryId.isEmpty() || expiresAtValue.isEmpty()) return null;

        long expiresAt = parseIsoDate(expiresAtValue);
        if (expiresAt <= 0L) return null;

        String title = clean(data.get("title"));
        if (title.isEmpty()) title = "Nueva solicitud de trabajo";

        String body = clean(data.get("body"));
        if (body.isEmpty()) body = "Hay una nueva solicitud disponible";

        return new ServiceRequestAlert(deliveryId, serviceId, title, body, expiresAt);
    }

    public static ServiceRequestAlert fromIntent(Intent intent) {
        if (intent == null) return null;
        String deliveryId = clean(intent.getStringExtra(EXTRA_DELIVERY_ID));
        String serviceId = clean(intent.getStringExtra(EXTRA_SERVICE_ID));
        long expiresAt = intent.getLongExtra(EXTRA_EXPIRES_AT, 0L);
        if (deliveryId.isEmpty() || serviceId.isEmpty() || expiresAt <= 0L) return null;

        String title = clean(intent.getStringExtra(EXTRA_TITLE));
        if (title.isEmpty()) title = "Nueva solicitud de trabajo";
        String body = clean(intent.getStringExtra(EXTRA_BODY));
        if (body.isEmpty()) body = "Hay una nueva solicitud disponible";
        return new ServiceRequestAlert(deliveryId, serviceId, title, body, expiresAt);
    }

    public Intent createActivityIntent(Context context) {
        Intent intent = new Intent(context, ServiceRequestAlertActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("fixgo://alert/service-request/" + Uri.encode(deliveryId)));
        intent.putExtra(EXTRA_DELIVERY_ID, deliveryId);
        intent.putExtra(EXTRA_SERVICE_ID, serviceId);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body);
        intent.putExtra(EXTRA_EXPIRES_AT, expiresAt);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    public Intent createMainActivityIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("fixgo://app/services/" + Uri.encode(serviceId)));
        intent.putExtra(MainActivity.EXTRA_FROM_SERVICE_REQUEST_ALERT, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    public long remainingMillis() {
        return Math.max(0L, expiresAt - System.currentTimeMillis());
    }

    private static long parseIsoDate(String value) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setLenient(false);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        try {
            Date parsed = format.parse(value);
            return parsed != null ? parsed.getTime() : 0L;
        } catch (ParseException ignored) {
            return 0L;
        }
    }

    private static String clean(String value) {
        if (value == null) return "";
        String cleaned = value.trim().replace('\n', ' ').replace('\r', ' ');
        return cleaned.length() > 160 ? cleaned.substring(0, 160) : cleaned;
    }
}