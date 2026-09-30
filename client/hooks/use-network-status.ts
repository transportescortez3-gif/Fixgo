import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let cleanup: (() => void) | undefined;

      (async () => {
        try {
          const { Network } = await import("@capacitor/network");

          const status = await Network.getStatus();
          setIsOnline(status.connected);

          const handler = await Network.addListener("networkStatusChange", (s) => {
            setIsOnline(s.connected);
          });

          cleanup = () => handler.remove();
        } catch {
          setIsOnline(navigator.onLine);
        }
      })();

      return () => cleanup?.();
    } else {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      setIsOnline(navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  return isOnline;
}
