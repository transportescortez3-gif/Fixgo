package com.fixxer.app;

import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/** A small, dismissible system window for a pending service request. */
public final class ServiceRequestOverlay {
    public interface ShowCallback {
        void onComplete(boolean shownOrIntentionallyHidden);
    }

    private static final String PREFS = "service_request_alert_state";
    private static final String PREF_DISMISSED_DELIVERY_ID = "dismissed_delivery_id";
    private static final String PREF_DISMISSED_EXPIRES_AT = "dismissed_expires_at";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static WindowManager windowManager;
    private static View visibleView;
    private static TextView countdownView;
    private static String visibleDeliveryId;
    private static Runnable countdownRunnable;

    private ServiceRequestOverlay() {}

    public static void show(Context context, ServiceRequestAlert alert, ShowCallback callback) {
        Context appContext = context.getApplicationContext();
        MAIN.post(() -> showOnMain(appContext, alert, callback));
    }

    private static void showOnMain(
            Context context,
            ServiceRequestAlert alert,
            ShowCallback callback) {
        if (alert == null || alert.remainingMillis() <= 0L) {
            finishCallback(callback, false);
            return;
        }
        if (MainActivity.isInForeground || ServiceRequestAlertActivity.isInForeground) {
            finishCallback(callback, true);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || !Settings.canDrawOverlays(context)) {
            finishCallback(callback, false);
            return;
        }
        if (wasDismissed(context, alert)) {
            finishCallback(callback, true);
            return;
        }
        if (alert.deliveryId.equals(visibleDeliveryId) && visibleView != null) {
            finishCallback(callback, true);
            return;
        }

        removeVisibleView();
        WindowManager manager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        if (manager == null) {
            finishCallback(callback, false);
            return;
        }

        LinearLayout card = createCard(context, alert);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                getOverlayWidth(context),
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                flags,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        params.y = dp(context, 48);

        try {
            manager.addView(card, params);
            windowManager = manager;
            visibleView = card;
            visibleDeliveryId = alert.deliveryId;
            startCountdown(context, alert);
            finishCallback(callback, true);
        } catch (RuntimeException error) {
            removeVisibleView();
            finishCallback(callback, false);
        }
    }

    public static void markDismissed(Context context, ServiceRequestAlert alert) {
        if (alert == null) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_DISMISSED_DELIVERY_ID, alert.deliveryId)
                .putLong(PREF_DISMISSED_EXPIRES_AT, alert.expiresAt)
                .apply();
    }

    public static void hideVisible(Context context, String deliveryId) {
        Runnable hide = () -> {
            if (deliveryId == null || deliveryId.equals(visibleDeliveryId)) {
                removeVisibleView();
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) hide.run();
        else MAIN.post(hide);
    }

    private static boolean wasDismissed(Context context, ServiceRequestAlert alert) {
        android.content.SharedPreferences prefs =
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String dismissedId = prefs.getString(PREF_DISMISSED_DELIVERY_ID, null);
        long dismissedExpiry = prefs.getLong(PREF_DISMISSED_EXPIRES_AT, 0L);
        if (alert.deliveryId.equals(dismissedId) && dismissedExpiry > System.currentTimeMillis()) {
            return true;
        }
        if (dismissedExpiry <= System.currentTimeMillis()) {
            prefs.edit()
                    .remove(PREF_DISMISSED_DELIVERY_ID)
                    .remove(PREF_DISMISSED_EXPIRES_AT)
                    .apply();
        }
        return false;
    }

    private static LinearLayout createCard(Context context, ServiceRequestAlert alert) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(context, 20), dp(context, 18), dp(context, 20), dp(context, 16));
        card.setElevation(dp(context, 12));
        GradientDrawable background = new GradientDrawable();
        background.setColor(0xFF111827);
        background.setCornerRadius(dp(context, 22));
        background.setStroke(dp(context, 1), 0xFF34425B);
        card.setBackground(background);
        card.setContentDescription("Nueva solicitud de trabajo");

        TextView heading = text(context, "NUEVA SOLICITUD", 12, 0xFF8FA8FF, true);
        heading.setLetterSpacing(0.08f);
        card.addView(heading);

        TextView summary = text(context, alert.body, 19, 0xFFF7F8FA, true);
        LinearLayout.LayoutParams summaryParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        summaryParams.topMargin = dp(context, 8);
        card.addView(summary, summaryParams);

        countdownView = text(context, "", 13, 0xFFB7C0D2, false);
        LinearLayout.LayoutParams countdownParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        countdownParams.topMargin = dp(context, 8);
        card.addView(countdownView, countdownParams);

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsParams.topMargin = dp(context, 14);

        TextView viewButton = action(context, "Ver solicitud", 0xFF5B7FFF, 0xFFFFFFFF);
        TextView closeButton = action(context, "Cerrar", 0xFF202A3B, 0xFFE7EAF0);
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                0, dp(context, 48), 1f);
        buttonParams.rightMargin = dp(context, 8);
        actions.addView(viewButton, buttonParams);
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
                0, dp(context, 48), 1f);
        closeParams.leftMargin = dp(context, 8);
        actions.addView(closeButton, closeParams);
        card.addView(actions, actionsParams);

        viewButton.setOnClickListener(v -> {
            ServiceRequestAlertController.openRequest(context, alert);
            context.startActivity(alert.createMainActivityIntent(context));
        });
        closeButton.setOnClickListener(v -> {
            markDismissed(context, alert);
            hideVisible(context, alert.deliveryId);
        });
        return card;
    }

    private static TextView text(Context context, String value, int sizeSp, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private static TextView action(Context context, String label, int backgroundColor, int textColor) {
        TextView button = new TextView(context);
        button.setText(label);
        button.setTextSize(14);
        button.setTextColor(textColor);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(context, 48));
        button.setClickable(true);
        button.setFocusable(true);
        button.setContentDescription(label);
        GradientDrawable background = new GradientDrawable();
        background.setColor(backgroundColor);
        background.setCornerRadius(dp(context, 14));
        button.setBackground(background);
        return button;
    }

    private static void startCountdown(Context context, ServiceRequestAlert alert) {
        stopCountdown();
        countdownRunnable = new Runnable() {
            @Override
            public void run() {
                if (!alert.deliveryId.equals(visibleDeliveryId) || countdownView == null) return;
                long remaining = alert.expiresAt - System.currentTimeMillis();
                if (remaining <= 0L) {
                    ServiceRequestAlertController.expire(context, alert.deliveryId);
                    return;
                }
                long seconds = (remaining + 999L) / 1000L;
                countdownView.setText("Vence en " + seconds + " s");
                MAIN.postDelayed(this, Math.min(1000L, remaining));
            }
        };
        countdownRunnable.run();
    }

    private static void stopCountdown() {
        if (countdownRunnable != null) {
            MAIN.removeCallbacks(countdownRunnable);
            countdownRunnable = null;
        }
        countdownView = null;
    }

    private static void removeVisibleView() {
        stopCountdown();
        if (visibleView != null && windowManager != null) {
            try {
                windowManager.removeViewImmediate(visibleView);
            } catch (RuntimeException ignored) {
            }
        }
        visibleView = null;
        windowManager = null;
        visibleDeliveryId = null;
    }

    private static int getOverlayWidth(Context context) {
        int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
        return Math.max(dp(context, 240), screenWidth - dp(context, 32));
    }

    private static int dp(Context context, int value) {
        return (int) (value * context.getResources().getDisplayMetrics().density + 0.5f);
    }

    private static void finishCallback(ShowCallback callback, boolean shown) {
        if (callback != null) callback.onComplete(shown);
    }
}