import { registerPlugin } from "@capacitor/core";

/**
 * Puente con el plugin nativo de iOS (CallKitVoip) que conecta PushKit + CallKit
 * con el código web de la llamada. Sólo existe en iOS; en otras plataformas el
 * proxy de Capacitor devuelve un no-op y los listeners nunca se disparan.
 *
 * Eventos:
 *   - `registration`  → { token }  token VoIP de PushKit (hex). Se persiste en
 *                        el servidor para enviar el push VoIP de la llamada.
 *   - `callAnswered`  → { callerId, calleeId, serviceId }  el usuario tocó
 *                        "Contestar" en la pantalla nativa de CallKit.
 *   - `callEnded`     → { callerId, calleeId, serviceId }  el usuario rechazó /
 *                        colgó desde CallKit (el rechazo previo a contestar lo
 *                        registra el lado nativo vía /api/calls/reject).
 */
export interface CallKitVoipPlugin {
  /** Inicializa PushKit (registra el delegate y solicita el token VoIP). */
  register(): Promise<void>;
  addListener(
    eventName: "registration",
    listener: (data: { token: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "callAnswered",
    listener: (data: { callerId?: string; calleeId?: string; serviceId?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "callEnded",
    listener: (data: { callerId?: string; calleeId?: string; serviceId?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const CallKitVoip = registerPlugin<CallKitVoipPlugin>("CallKitVoip");
