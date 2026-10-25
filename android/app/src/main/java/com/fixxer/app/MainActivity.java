package com.fixxer.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_FROM_SERVICE_REQUEST_ALERT =
            "com.fixxer.app.extra.FROM_SERVICE_REQUEST_ALERT";
    private static final String SERVICE_ALERT_PREFS = "service_request_alert_state";
    private static final String PREF_OVERLAY_PERMISSION_PROMPTED = "overlay_permission_prompted";

    /**
     * Flag global: true mientras MainActivity está en primer plano (onResume).
     * Lo lee FixxerMessagingService para decidir si debe lanzar
     * IncomingCallActivity — cuando la app está en foreground el overlay web
     * ya muestra la pantalla de llamada vía socket, así que el Activity nativo
     * no debe abrirse para evitar que aparezcan dos pantallas a la vez.
     */
    public static volatile boolean isInForeground = false;

    @Override
    public void onResume() {
        super.onResume();
        isInForeground = true;
    }

    @Override
    public void onStop() {
        super.onStop();
        isInForeground = false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 28-abr-2026: forzar modo oscuro a nivel app ANTES de super.onCreate.
        // Esto hace que (a) los componentes AppCompat se rendericen en dark
        // y (b) el SDK nativo de Google Maps elija el estilo "Modo oscuro"
        // asociado al Map ID en Cloud Console (Fixgo Android, dark).
        // Sin esto, si el celular del usuario esta en modo claro, el SDK
        // pide los tiles con el estilo "Modo claro" del Map ID y la app
        // se ve con un mapa blanco aunque la UI sea oscura.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);

        registerPlugin(ServiceRequestAlertsPlugin.class);
        super.onCreate(savedInstanceState);
        FixxerMessagingService.ensureGeneralNotificationChannels(this);
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Para que @capacitor/google-maps muestre el mapa nativo a traves del
        // WebView se necesitan TRES cosas transparentes:
        //
        // 1. El window background de la activity (si no, queda negro o el
        //    splash drawable se ve por debajo).
        // 2. El WebView (porque vive ENCIMA del MapView nativo).
        // 3. Todos los wrappers HTML padres del contenedor del mapa
        //    (lo hacemos en JS via la clase .native-map-active).
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.setBackgroundColor(Color.TRANSPARENT);

            // Los assets de Capacitor se sirven desde el bundle local. Evita
            // conservar index.html entre actualizaciones sin borrar toda la
            // caché agresivamente en cada arranque.
            WebSettings settings = webView.getSettings();
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

            // Android puede finalizar el renderer de Chromium por un fallo
            // nativo de WebView. Si no se maneja este callback, WebView
            // propaga el fallo y cierra toda la app. Conservamos el cliente
            // oficial de Capacitor y recreamos la Activity para recuperar la
            // pantalla sin terminar el proceso principal.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                    @Override
                    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        Log.e("FixgoWebView", "WebView renderer finalizado; recreando Activity. didCrash=" + detail.didCrash());
                        if (!isFinishing()) {
                            runOnUiThread(MainActivity.this::recreate);
                        }
                        return true;
                    }
                });
            }
        }

        scheduleOverlayPermissionPrompt(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        scheduleOverlayPermissionPrompt(intent);
    }

    private void scheduleOverlayPermissionPrompt(Intent sourceIntent) {
        if (sourceIntent == null
                || !sourceIntent.getBooleanExtra(EXTRA_FROM_SERVICE_REQUEST_ALERT, false)) {
            return;
        }
        getWindow().getDecorView().post(() -> maybeShowOverlayPermissionPrompt());
    }

    public void promptOverlayPermissionForServiceRequest() {
        Intent sourceIntent = new Intent()
                .putExtra(EXTRA_FROM_SERVICE_REQUEST_ALERT, true);
        scheduleOverlayPermissionPrompt(sourceIntent);
    }

    private void maybeShowOverlayPermissionPrompt() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
            return;
        }

        SharedPreferences prefs = getSharedPreferences(SERVICE_ALERT_PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(PREF_OVERLAY_PERMISSION_PROMPTED, false)) return;
        // Record before showing so closing or denying the dialog does not cause
        // an automatic prompt on every later request.
        prefs.edit().putBoolean(PREF_OVERLAY_PERMISSION_PROMPTED, true).apply();

        new AlertDialog.Builder(this)
                .setTitle("Alertas sobre otras aplicaciones")
                .setMessage("Permite que FixMaster muestre una ventana para nuevas solicitudes cuando estés usando otra app. Puedes seguir sin activarlo; Android seguirá usando notificaciones.")
                .setNegativeButton("Ahora no", null)
                .setPositiveButton("Ir a Ajustes", (dialog, which) -> {
                    Intent settingsIntent = new Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    try {
                        startActivity(settingsIntent);
                    } catch (Exception error) {
                        Toast.makeText(this, "Abre los ajustes de FixMaster para activar las ventanas flotantes.", Toast.LENGTH_LONG).show();
                    }
                })
                .show();
    }
}
