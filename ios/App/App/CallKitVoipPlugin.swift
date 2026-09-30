import Foundation
import Capacitor

/// Plugin de Capacitor que puentea PushKit + CallKit (CallKitVoipManager) con el
/// código web de la llamada. Capacitor lo descubre automáticamente en runtime
/// por conformar a `CAPBridgedPlugin`. Eventos emitidos al JS:
///   - `registration` { token }            token VoIP de PushKit
///   - `callAnswered` { callerId, ... }     el usuario tocó "Contestar"
///   - `callEnded`    { callerId, ... }     rechazo / colgar desde CallKit
@objc(CallKitVoipPlugin)
public class CallKitVoipPlugin: CAPPlugin, CAPBridgedPlugin, CallKitVoipDelegate {

    public let identifier = "CallKitVoipPlugin"
    public let jsName = "CallKitVoip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        CallKitVoipManager.shared.delegate = self
        // Asegura que PushKit esté arrancado (idempotente con el arranque en
        // AppDelegate por si el orden de carga cambiara).
        CallKitVoipManager.shared.start()
    }

    @objc func register(_ call: CAPPluginCall) {
        CallKitVoipManager.shared.start()
        // Handshake explícito tras arranque en frío: re-entrega cualquier evento
        // (token / callAnswered) que ocurrió antes de engancharse el delegate.
        CallKitVoipManager.shared.flushPending()
        call.resolve()
    }

    // MARK: - CallKitVoipDelegate
    //
    // `retainUntilConsumed: true` hace que Capacitor encole el evento hasta que
    // el JS agregue su listener; imprescindible en arranque en frío, donde el
    // evento nativo puede dispararse antes de que el hook registre los listeners.

    public func voipDidRegister(token: String) {
        notifyListeners("registration", data: ["token": token], retainUntilConsumed: true)
    }

    public func voipCallAnswered(_ info: VoipCallInfo) {
        notifyListeners("callAnswered", data: [
            "callerId": info.callerId,
            "calleeId": info.calleeId,
            "serviceId": info.serviceId,
        ], retainUntilConsumed: true)
    }

    public func voipCallEnded(_ info: VoipCallInfo) {
        notifyListeners("callEnded", data: [
            "callerId": info.callerId,
            "calleeId": info.calleeId,
            "serviceId": info.serviceId,
        ], retainUntilConsumed: true)
    }
}
