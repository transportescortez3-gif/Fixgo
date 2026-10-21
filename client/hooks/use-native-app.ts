import { useEffect } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { useLocation } from "wouter";
import { handleCallDeepLink } from "./use-call";

export function useNativeApp() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanupFns: Array<() => void> = [];
    const navigateFromUrl = (rawUrl: string) => {
      if (handleCallDeepLink(rawUrl)) return;
      try {
        const url = new URL(rawUrl);
        const path = url.pathname + url.search;
        if (path && path !== "/") setLocation(path);
      } catch {}
    };

    (async () => {
      try {
        // SystemBars usa la API edge-to-edge moderna para fijar iconos claros
        // sin las llamadas de color de ventana obsoletas en Android 15+.
        await SystemBars.setStyle({ style: SystemBarsStyle.Dark });
        cleanupFns.push(() => {});
      } catch {}

      try {
        // Keyboard — ajustar scroll cuando aparece el teclado
        const { Keyboard } = await import("@capacitor/keyboard");

        const showHandler = await Keyboard.addListener("keyboardWillShow", (info) => {
          document.documentElement.style.setProperty(
            "--keyboard-height",
            `${info.keyboardHeight}px`
          );
          document.documentElement.classList.add("keyboard-open");
        });

        const hideHandler = await Keyboard.addListener("keyboardWillHide", () => {
          document.documentElement.style.setProperty("--keyboard-height", "0px");
          document.documentElement.classList.remove("keyboard-open");
        });

        cleanupFns.push(() => {
          showHandler.remove();
          hideHandler.remove();
        });
      } catch {}

      try {
        // App — botón Atrás de Android + deep links
        const { App } = await import("@capacitor/app");

        const backHandler = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else if (location !== "/") {
            setLocation("/");
          } else {
            App.exitApp();
          }
        });

        const urlHandler = await App.addListener("appUrlOpen", (data) => {
          navigateFromUrl(data.url);
        });

        // Cold start: la app se abrió desde el deep link de "Contestar" estando
        // cerrada. appUrlOpen no se dispara en arranque en frío, así que leemos
        // la URL de lanzamiento manualmente.
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) navigateFromUrl(launch.url);
        } catch {}

        const resumeHandler = await App.addListener("resume", async () => {
          try {
            await SystemBars.setStyle({ style: SystemBarsStyle.Dark });
          } catch {}
        });

        cleanupFns.push(() => {
          backHandler.remove();
          urlHandler.remove();
          resumeHandler.remove();
        });
      } catch {}
    })();

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
  }, []);
}
