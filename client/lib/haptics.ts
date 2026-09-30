import { Capacitor } from "@capacitor/core";

type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export async function haptic(style: HapticStyle = "light") {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");

    if (style === "success") {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (style === "warning") {
      await Haptics.notification({ type: NotificationType.Warning });
    } else if (style === "error") {
      await Haptics.notification({ type: NotificationType.Error });
    } else {
      const impactMap: Record<string, any> = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      await Haptics.impact({ style: impactMap[style] ?? ImpactStyle.Light });
    }
  } catch {}
}
