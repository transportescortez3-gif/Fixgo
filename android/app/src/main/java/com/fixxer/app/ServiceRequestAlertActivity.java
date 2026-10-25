package com.fixxer.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/** Lock-screen/activity surface for a new service request. */
public class ServiceRequestAlertActivity extends AppCompatActivity {
    public static volatile boolean isInForeground = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ServiceRequestAlert alert;
    private TextView expiryView;
    private Runnable expiryTicker;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureLockScreen();
        setContentView(R.layout.activity_service_request_alert);
        bindIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bindIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        isInForeground = true;
    }

    @Override
    protected void onStop() {
        super.onStop();
        isInForeground = false;
    }

    private void configureLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            // Do not dismiss the keyguard. Android still controls when the
            // person must unlock before opening the service in FixMaster.
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void bindIntent(Intent intent) {
        stopExpiryTicker();
        alert = ServiceRequestAlert.fromIntent(intent);
        if (alert == null || alert.remainingMillis() <= 0L) {
            if (alert != null) ServiceRequestAlertController.expire(this, alert.deliveryId);
            finish();
            return;
        }

        ServiceRequestOverlay.hideVisible(this, alert.deliveryId);
        TextView summary = findViewById(R.id.service_request_summary);
        TextView phaseView = findViewById(R.id.service_request_phase);
        TextView budgetView = findViewById(R.id.service_request_budget);
        expiryView = findViewById(R.id.service_request_expiry);
        Button viewButton = findViewById(R.id.service_request_view);
        Button closeButton = findViewById(R.id.service_request_close);

        boolean isProMax = alert.phase.equals("promax");
        phaseView.setText(isProMax ? "PARA LOS PRO MAX" : "PARA PRO Y GRATIS");
        phaseView.setTextColor(isProMax ? 0xFFF59E0B : 0xFF1A8CF8);
        summary.setText(alert.body);
        if (isProMax && !alert.budgetNote.isEmpty()) {
            budgetView.setText("Precio sugerido del cliente: " + alert.budgetNote);
            budgetView.setVisibility(View.VISIBLE);
        } else {
            budgetView.setVisibility(View.GONE);
        }
        viewButton.setOnClickListener(v -> openRequest());
        closeButton.setOnClickListener(v -> closeAlert());
        startExpiryTicker();
    }

    private void startExpiryTicker() {
        expiryTicker = new Runnable() {
            @Override
            public void run() {
                if (alert == null || expiryView == null) return;
                long remaining = alert.remainingMillis();
                if (remaining <= 0L) {
                    ServiceRequestAlertController.expire(ServiceRequestAlertActivity.this, alert.deliveryId);
                    finish();
                    return;
                }
                long seconds = (remaining + 999L) / 1000L;
                expiryView.setText("Vence en " + seconds + " s");
                handler.postDelayed(this, Math.min(1000L, remaining));
            }
        };
        expiryTicker.run();
    }

    private void stopExpiryTicker() {
        if (expiryTicker != null) {
            handler.removeCallbacks(expiryTicker);
            expiryTicker = null;
        }
    }

    private void openRequest() {
        if (alert == null) {
            finish();
            return;
        }
        ServiceRequestAlertController.openRequest(this, alert);
        startActivity(alert.createMainActivityIntent(this));
        finish();
    }

    private void closeAlert() {
        if (alert != null) {
            ServiceRequestOverlay.markDismissed(this, alert);
            ServiceRequestOverlay.hideVisible(this, alert.deliveryId);
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        closeAlert();
    }

    @Override
    protected void onDestroy() {
        stopExpiryTicker();
        super.onDestroy();
    }
}