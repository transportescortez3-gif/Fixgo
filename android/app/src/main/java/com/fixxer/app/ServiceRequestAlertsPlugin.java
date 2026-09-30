package com.fixxer.app;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Exposes the one-time Android overlay-permission explanation to the web UI. */
@CapacitorPlugin(name = "ServiceRequestAlerts")
public class ServiceRequestAlertsPlugin extends Plugin {
    @PluginMethod
    public void promptOverlayPermissionIfNeeded(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            MainActivity mainActivity = (MainActivity) activity;
            mainActivity.runOnUiThread(mainActivity::promptOverlayPermissionForServiceRequest);
        }
        call.resolve();
    }
}