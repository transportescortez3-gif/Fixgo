import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "./use-auth";
import { armAutoAnswer } from "./use-call";
import { CallKitVoip } from "@/plugins/callkit-voip";
import { APP_URL } from "@/lib/app-config";

async function registerVoipToken(token: string) {
  try {
    const jwt = localStorage.getItem("fixgo_token");
    if (!jwt) return;
    await fetch(`${APP_URL}/api/notifications/voip-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

/**
 * Integra PushKit + CallKit (iOS) con el flujo de llamada web. Solo se activa en
 * iOS nativo. El delegate nativo:
 *   - registra el token VoIP → lo persistimos en el servidor.
 *   - al recibir el push VoIP reporta la llamada a CallKit (pantalla nativa).
 *   - "Contestar" emite `callAnswered` → armamos el auto-contestar; cuando el
 *     socket reconecta, el servidor re-emite la oferta y la llamada se acepta
 *     automáticamente (mismo camino que el deep link de Android).
 *   - "Rechazar" antes de contestar lo registra el lado nativo vía
 *     /api/calls/reject (rejectToken del push); aquí no hay que hacer nada.
 */
export function useCallKitIos() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const regHandler = await CallKitVoip.addListener("registration", (data) => {
          if (data?.token) void registerVoipToken(data.token);
        });

        const answeredHandler = await CallKitVoip.addListener("callAnswered", (data) => {
          const callerId = Number(data?.callerId);
          // Armar el auto-contestar con el callerId concreto; si no viniera,
          // usamos el comodín (-1) que acepta la próxima llamada entrante.
          armAutoAnswer(Number.isFinite(callerId) && callerId > 0 ? callerId : -1);
        });

        // Inicia PushKit (registra el delegate y dispara `registration`).
        await CallKitVoip.register();

        cleanup = () => {
          regHandler.remove();
          answeredHandler.remove();
        };
      } catch {
        // Plugin no disponible (no compilado aún) → degradar sin romper la app.
      }
    })();

    return () => {
      cleanup?.();
    };
  }, [user?.id]);
}
