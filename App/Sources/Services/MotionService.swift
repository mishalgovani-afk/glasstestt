import CoreMotion
import Foundation
import HushCore
import Observation

/// Streams AirPods head motion via `CMHeadphoneMotionManager`.
@MainActor
@Observable
final class MotionService: NSObject {
    private let manager = CMHeadphoneMotionManager()

    private(set) var isRunning = false
    private(set) var isConnected = false
    private(set) var lastError: String?
    /// Smoothed measured sample rate in Hz.
    private(set) var sampleRate: Double = 0
    private(set) var frameCount = 0
    /// Recent frames for plotting (about 10 s).
    private(set) var recent: [MotionFrame] = []

    @ObservationIgnored var onFrame: ((MotionFrame) -> Void)?
    @ObservationIgnored private var lastTimestamp: Double?
    private let historyLimit = 260

    override init() {
        super.init()
        manager.delegate = self
    }

    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    var authorization: String {
        switch CMHeadphoneMotionManager.authorizationStatus() {
        case .authorized: return "Authorized"
        case .denied: return "Denied: enable Hush in System Settings › Privacy & Security › Motion & Fitness"
        case .restricted: return "Restricted"
        case .notDetermined: return "Not yet requested"
        @unknown default: return "Unknown"
        }
    }

    var statusText: String {
        if let lastError { return lastError }
        if !isAvailable { return "Headphone motion is not available on this Mac" }
        if !isRunning { return "Stopped" }
        if !isConnected && frameCount == 0 { return "Waiting for AirPods… put them in your ears" }
        return isConnected || frameCount > 0 ? "Streaming" : "Disconnected"
    }

    func start() {
        guard !isRunning else { return }
        guard manager.isDeviceMotionAvailable else {
            lastError = "Headphone motion is not available. Connect AirPods Pro/Max (or other head-tracking headphones) as the audio output."
            return
        }
        lastError = nil
        lastTimestamp = nil
        isRunning = true
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                if let error {
                    self.lastError = error.localizedDescription
                    return
                }
                guard let motion else { return }
                self.receive(Self.frame(from: motion))
            }
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        isRunning = false
        sampleRate = 0
    }

    private func receive(_ f: MotionFrame) {
        if let last = lastTimestamp, f.t > last {
            let instant = 1 / (f.t - last)
            sampleRate = sampleRate == 0 ? instant : sampleRate * 0.95 + instant * 0.05
        }
        lastTimestamp = f.t
        frameCount += 1
        recent.append(f)
        if recent.count > historyLimit { recent.removeFirst(recent.count - historyLimit) }
        onFrame?(f)
    }

    nonisolated static func frame(from m: CMDeviceMotion) -> MotionFrame {
        let q = m.attitude.quaternion
        return MotionFrame(
            t: m.timestamp,
            userAcceleration: Vec3(m.userAcceleration.x, m.userAcceleration.y, m.userAcceleration.z),
            rotationRate: Vec3(m.rotationRate.x, m.rotationRate.y, m.rotationRate.z),
            attitude: Quat(w: q.w, x: q.x, y: q.y, z: q.z),
            gravity: Vec3(m.gravity.x, m.gravity.y, m.gravity.z)
        )
    }
}

extension MotionService: CMHeadphoneMotionManagerDelegate {
    nonisolated func headphoneMotionManagerDidConnect(_ manager: CMHeadphoneMotionManager) {
        Task { @MainActor in self.isConnected = true }
    }

    nonisolated func headphoneMotionManagerDidDisconnect(_ manager: CMHeadphoneMotionManager) {
        Task { @MainActor in self.isConnected = false }
    }
}
