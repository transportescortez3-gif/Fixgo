package com.fixxer.app;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Pantalla nativa de llamada entrante (estilo Fixgo / WhatsApp moderno).
 * Se muestra sobre la pantalla de bloqueo y enciende la pantalla aunque la
 * app esté cerrada.
 *
 * - "Contestar" abre la app web con un deep link `fixxer://call/answer?callerId=`
 *   que dispara el auto-contestar del hook de llamadas (conecta WebRTC).
 * - "Rechazar" hace un POST autenticado por `rejectToken` a /api/calls/reject
 *   para que el servidor avise al que llama y registre la "llamada perdida".
 */
public class IncomingCallActivity extends AppCompatActivity {

    public static final String ACTION_FINISH = "com.fixxer.app.FINISH_INCOMING_CALL";
    private static final String API_BASE = "https://appfixxer.com";

    private BroadcastReceiver finishReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Mostrar sobre el lock screen y encender la pantalla.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }

        setContentView(R.layout.activity_incoming_call);

        Intent intent = getIntent();
        final String callerName = intent.getStringExtra("callerName");
        final String callerId   = intent.getStringExtra("callerId");
        final String rejectToken = intent.getStringExtra("rejectToken");

        // Nombre del llamador
        TextView nameView = findViewById(R.id.caller_name);
        if (nameView != null) {
            nameView.setText(callerName != null && !callerName.isEmpty() ? callerName : "");
        }

        // Inicial del llamador en el avatar circular
        TextView avatarLetter = findViewById(R.id.avatar_letter);
        if (avatarLetter != null) {
            String initial = (callerName != null && !callerName.isEmpty())
                    ? String.valueOf(callerName.charAt(0)).toUpperCase()
                    : "?";
            avatarLetter.setText(initial);
        }

        // Animaciones de pulse en los anillos del avatar
        View pulseOuter = findViewById(R.id.pulse_outer);
        View pulseInner = findViewById(R.id.pulse_inner);
        if (pulseOuter != null) {
            Animation animOuter = AnimationUtils.loadAnimation(this, R.anim.pulse_scale);
            pulseOuter.startAnimation(animOuter);
        }
        if (pulseInner != null) {
            Animation animInner = AnimationUtils.loadAnimation(this, R.anim.pulse_scale_delayed);
            pulseInner.startAnimation(animInner);
        }

        // Botones de acción
        ImageButton btnAccept = findViewById(R.id.btn_accept);
        ImageButton btnReject = findViewById(R.id.btn_reject);
        if (btnAccept != null) btnAccept.setOnClickListener(v -> acceptCall(callerId));
        if (btnReject != null) btnReject.setOnClickListener(v -> rejectCall(rejectToken));

        // Receptor para cerrar esta pantalla cuando el que llama cuelga
        finishReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent i) {
                finishAndRemoveTask();
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_FINISH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(finishReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(finishReceiver, filter);
        }
    }

    private void clearNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(FixxerMessagingService.CALL_NOTIFICATION_ID);
    }

    private void acceptCall(String callerId) {
        clearNotification();
        Intent launch = new Intent(this, MainActivity.class);
        launch.setAction(Intent.ACTION_VIEW);
        launch.setData(Uri.parse("fixxer://call/answer?callerId=" + (callerId != null ? callerId : "")));
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(launch);
        finishAndRemoveTask();
    }

    private void rejectCall(final String rejectToken) {
        clearNotification();
        if (rejectToken != null && !rejectToken.isEmpty()) {
            new Thread(() -> postReject(rejectToken)).start();
        }
        finishAndRemoveTask();
    }

    private void postReject(String rejectToken) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(API_BASE + "/api/calls/reject");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            String body = "{\"rejectToken\":\"" + rejectToken + "\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (finishReceiver != null) {
            try {
                unregisterReceiver(finishReceiver);
            } catch (Exception ignored) {
            }
        }
    }
}
