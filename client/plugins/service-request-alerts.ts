import { Capacitor, registerPlugin } from "@capacitor/core";

interface ServiceRequestAlertsPlugin {
  promptOverlayPermissionIfNeeded(): Promise<void>;
}

const ServiceRequestAlerts = registerPlugin<ServiceRequestAlertsPlugin>("ServiceRequestAlerts");

/** Shows the Android-only, one-time overlay-permission explanation when needed. */
export async function promptServiceRequestOverlayPermissionIfNeeded(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await ServiceRequestAlerts.promptOverlayPermissionIfNeeded();
  } catch (error) {
    // Permission education must never block opening the work request.
    console.warn("Could not show service-request overlay permission prompt", error);
  }
}