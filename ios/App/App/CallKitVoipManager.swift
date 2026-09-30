import Foundation
import PushKit
import CallKit
import AVFoundation
import UIKit

/// Datos de una llamada entrante reportada a CallKit, extraídos del push VoIP.
struct VoipCallInfo {
    let uuid: UUID
    let callerId: String
    let calleeId: String
    let serviceId: String
    let callerName: String
    let rejectToken: String
    var answered: Bool = false
}

/// Recibe eventos del manager para reenviarlos al JS (lo implementa el plugin
/// de Capacitor `CallKitVoipPlugin`).
protocol CallKitVoipDelegate: AnyObject {
    func voipDidRegister(token: String)
    func voipCallAnswered(_ info: VoipCallInfo)
    func voipCallEnded(_ info: VoipCallInfo)
}

/// Núcleo de PushKit + CallKit. Es un singleton independiente del WebView para
/// poder recibir el push VoIP y mostrar la pantalla de llamada nativa de iOS
/// aunque la app esté cerrada. Espeja el flujo de Android:
///   - "Contestar" → avisa al JS (arma el auto-contestar; el servidor re-emite
///     la oferta SDP al reconectar el socket).
///   - "Rechazar" antes de contestar → POST nativo a /api/calls/reject con el
///     `rejectToken` del push (registra la "llamada perdida" sin la sesión web).
final class CallKitVoipManager: NSObject {

    static let shared = CallKitVoipManager()

    private let apiBase = "https://appfixxer.com"

    private var voipRegistry: PKPushRegistry?
    private let provider: CXProvider
    private let callController = CXCallController()

    /// Llamadas reportadas vivas, indexadas por UUID.
    private var calls: [UUID: VoipCallInfo] = [:]

    /// El plugin se engancha cuando el WebView carga (más tarde que el arranque
    /// de PushKit). Cualquier evento ocurrido antes (token, llamada contestada o
    /// finalizada en arranque en frío por CallKit) se almacena y se entrega al
    /// engancharse el delegate. Sin esto, "Contestar" con la app cerrada podría
    /// perderse y la oferta SDP re-emitida nunca se auto-aceptaría.
    weak var delegate: CallKitVoipDelegate? {
        didSet { flushPending() }
    }
    private var pendingToken: String?
    private var pendingAnswered: [VoipCallInfo] = []
    private var pendingEnded: [VoipCallInfo] = []

    private override init() {
        let config = CXProviderConfiguration(localizedName: "Fixgo")
        config.supportsVideo = false
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        self.provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    /// Arranca el registro de PushKit. Idempotente.
    func start() {
        guard voipRegistry == nil else { return }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        voipRegistry = registry
    }

    /// Entrega al delegate (plugin) cualquier evento que ocurrió antes de que se
    /// enganchara. Idempotente: lo invocan tanto `delegate.didSet` como el
    /// `register()` del plugin (handshake explícito tras arranque en frío).
    func flushPending() {
        guard let delegate = delegate else { return }
        if let token = pendingToken {
            delegate.voipDidRegister(token: token)
            pendingToken = nil
        }
        if !pendingAnswered.isEmpty {
            let items = pendingAnswered
            pendingAnswered = []
            items.forEach { delegate.voipCallAnswered($0) }
        }
        if !pendingEnded.isEmpty {
            let items = pendingEnded
            pendingEnded = []
            items.forEach { delegate.voipCallEnded($0) }
        }
    }

    // MARK: - Reportar / finalizar llamadas en CallKit

    private func reportIncoming(_ info: VoipCallInfo, completion: @escaping () -> Void) {
        calls[info.uuid] = info
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: info.callerName)
        update.hasVideo = false
        update.localizedCallerName = info.callerName
        provider.reportNewIncomingCall(with: info.uuid, update: update) { [weak self] error in
            if error != nil {
                self?.calls[info.uuid] = nil
            }
            completion()
        }
    }

    /// Finaliza la pantalla de CallKit de la llamada del `callerId` indicado (el
    /// que llama colgó / contestó en otro lado / timeout). iOS exige reportar
    /// algo por cada push VoIP: si no hay llamada viva, reportamos una y la
    /// cerramos de inmediato para satisfacer la regla sin dejar UI colgada.
    private func endCall(callerId: String, calleeId: String, completion: @escaping () -> Void) {
        if let entry = calls.first(where: { $0.value.callerId == callerId && !$0.value.answered }) {
            provider.reportCall(with: entry.key, endedAt: Date(), reason: .remoteEnded)
            calls[entry.key] = nil
            completion()
            return
        }
        // No había llamada viva conocida: reportar+cerrar para no violar la regla.
        let uuid = UUID()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Fixgo")
        update.hasVideo = false
        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] _ in
            self?.provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            completion()
        }
    }

    // MARK: - Rechazo nativo (POST con rejectToken)

    private func postReject(rejectToken: String) {
        guard !rejectToken.isEmpty, let url = URL(string: "\(apiBase)/api/calls/reject") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 8
        let body: [String: String] = ["rejectToken": rejectToken]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }
}

// MARK: - PKPushRegistryDelegate
extension CallKitVoipManager: PKPushRegistryDelegate {

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        if delegate != nil {
            delegate?.voipDidRegister(token: token)
        } else {
            pendingToken = token
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        // El token VoIP dejó de ser válido; el próximo didUpdate entregará uno nuevo.
    }

    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType,
                      completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let dict = payload.dictionaryPayload
        let pushType = (dict["type"] as? String) ?? "incoming_call"
        let callerId = stringValue(dict["callerId"])
        let calleeId = stringValue(dict["calleeId"])

        if pushType == "cancel_call" {
            endCall(callerId: callerId, calleeId: calleeId, completion: completion)
            return
        }

        let info = VoipCallInfo(
            uuid: UUID(),
            callerId: callerId,
            calleeId: calleeId,
            serviceId: stringValue(dict["serviceId"]),
            callerName: stringValueOrDefault(dict["callerName"], "Llamada entrante"),
            rejectToken: stringValue(dict["rejectToken"])
        )
        // reportNewIncomingCall DEBE invocarse antes de completion() o el sistema
        // mata la app por incumplir el contrato de PushKit.
        reportIncoming(info, completion: completion)
    }

    private func stringValue(_ v: Any?) -> String {
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return ""
    }

    private func stringValueOrDefault(_ v: Any?, _ def: String) -> String {
        let s = stringValue(v)
        return s.isEmpty ? def : s
    }
}

// MARK: - CXProviderDelegate
extension CallKitVoipManager: CXProviderDelegate {

    func providerDidReset(_ provider: CXProvider) {
        calls.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard var info = calls[action.callUUID] else { action.fail(); return }
        info.answered = true
        calls[action.callUUID] = info
        // Trae la app al frente y avisa al JS para que arme el auto-contestar.
        // En arranque en frío el delegate (plugin) aún no existe: se almacena y
        // se entrega en flushPending() al engancharse.
        if let delegate = delegate {
            delegate.voipCallAnswered(info)
        } else {
            pendingAnswered.append(info)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let info = calls[action.callUUID] {
            // Si NO se había contestado, es un rechazo: registrar la llamada
            // perdida vía HTTP (la app puede estar cerrada, sin sesión web).
            if !info.answered {
                postReject(rejectToken: info.rejectToken)
            }
            if let delegate = delegate {
                delegate.voipCallEnded(info)
            } else {
                pendingEnded.append(info)
            }
            calls[action.callUUID] = nil
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Configurar la sesión de audio para la llamada de voz (WebRTC en el WebView).
        try? audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try? audioSession.setActive(true)
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        try? audioSession.setActive(false)
    }
}
