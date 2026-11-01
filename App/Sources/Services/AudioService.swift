import AVFoundation
import CoreAudio
import Foundation
import Observation
import Speech

struct AudioInputDevice: Identifiable, Hashable {
    let id: AudioDeviceID
    let name: String
}

/// Microphone capture: level meter, optional file recording, and on-device speech recognition
/// as a reference transcript (useful for the whisper condition).
@MainActor
@Observable
final class AudioService {
    private(set) var isRunning = false
    private(set) var level: Double = 0
    private(set) var transcript = ""
    private(set) var status = "Mic off"
    private(set) var devices: [AudioInputDevice] = []
    var selectedDevice: AudioDeviceID?
    var transcribe = true

    /// `ProcessInfo.systemUptime` when the current recording file started, comparable with motion timestamps.
    private(set) var recordingStartedAt: Double?

    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var tap: AudioTap?
    @ObservationIgnored private var recognizer: SFSpeechRecognizer?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var committedTranscript = ""

    init() {
        refreshDevices()
    }

    func refreshDevices() {
        devices = AudioDevices.inputs()
    }

    func start() async {
        guard !isRunning else { return }
        guard await AVCaptureDevice.requestAccess(for: .audio) else {
            status = "Microphone access denied (System Settings › Privacy & Security › Microphone)"
            return
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        if let device = selectedDevice, let unit = input.audioUnit {
            var id = device
            let err = AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
                                           &id, UInt32(MemoryLayout<AudioDeviceID>.size))
            if err != noErr { status = "Could not select input device (\(err)); using default" }
        }
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            status = "No usable microphone input"
            return
        }

        let tap = AudioTap { [weak self] level in
            Task { @MainActor in self?.level = level }
        }
        tap.install(on: input, format: format)
        do {
            engine.prepare()
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            status = "Audio engine failed: \(error.localizedDescription)"
            return
        }
        self.engine = engine
        self.tap = tap
        isRunning = true
        status = String(format: "Listening · %.0f kHz · %d ch", format.sampleRate / 1000, format.channelCount)
        if transcribe { await startRecognition() }
    }

    func stop() {
        endRecording()
        task?.cancel()
        task = nil
        tap?.setRequest(nil)
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        tap = nil
        isRunning = false
        level = 0
        status = "Mic off"
    }

    func clearTranscript() {
        committedTranscript = ""
        transcript = ""
    }

    // MARK: Recording

    func beginRecording(to url: URL) throws {
        guard let tap, let engine else { return }
        let format = engine.inputNode.outputFormat(forBus: 0)
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        tap.setFile(file)
        recordingStartedAt = ProcessInfo.processInfo.systemUptime
    }

    func endRecording() {
        tap?.setFile(nil)
        recordingStartedAt = nil
    }

    // MARK: Speech

    private func startRecognition() async {
        let authorized = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        guard authorized, isRunning else {
            if !authorized { status += " · speech recognition not authorized" }
            return
        }
        if self.recognizer == nil { self.recognizer = SFSpeechRecognizer() }
        guard let recognizer = self.recognizer, recognizer.isAvailable else {
            status += " · speech recognizer unavailable"
            return
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        tap?.setRequest(request)

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let failed = error != nil
            Task { @MainActor in
                guard let self else { return }
                if let text {
                    self.transcript = [self.committedTranscript, text].filter { !$0.isEmpty }.joined(separator: " ")
                }
                if isFinal || failed {
                    // Recognition requests end after a pause or about a minute; start a fresh one.
                    self.committedTranscript = self.transcript
                    self.task = nil
                    if self.isRunning && self.transcribe { await self.startRecognition() }
                }
            }
        }
    }
}

/// Runs on the real-time audio thread; deliberately not actor-isolated.
final class AudioTap: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private let onLevel: @Sendable (Double) -> Void
    private var lastLevelPost = 0.0

    init(onLevel: @escaping @Sendable (Double) -> Void) {
        self.onLevel = onLevel
    }

    func setFile(_ f: AVAudioFile?) { lock.withLock { file = f } }

    func setRequest(_ r: SFSpeechAudioBufferRecognitionRequest?) {
        lock.withLock {
            request?.endAudio()
            request = r
        }
    }

    func install(on node: AVAudioInputNode, format: AVAudioFormat) {
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { [self] buffer, _ in
            self.process(buffer)
        }
    }

    private func process(_ buffer: AVAudioPCMBuffer) {
        if let ch = buffer.floatChannelData, buffer.frameLength > 0 {
            let n = Int(buffer.frameLength)
            var sum: Float = 0
            for i in 0..<n { sum += ch[0][i] * ch[0][i] }
            let rms = (sum / Float(n)).squareRoot()
            let db = 20 * log10(max(Double(rms), 1e-7))
            let normalized = min(1, max(0, (db + 60) / 60))
            let now = ProcessInfo.processInfo.systemUptime
            if now - lastLevelPost > 0.05 {
                lastLevelPost = now
                onLevel(normalized)
            }
        }
        lock.lock()
        let file = self.file
        let request = self.request
        lock.unlock()
        try? file?.write(from: buffer)
        request?.append(buffer)
    }
}

enum AudioDevices {
    static func inputs() -> [AudioInputDevice] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        let system = AudioObjectID(kAudioObjectSystemObject)
        guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr else { return [] }
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else { return [] }
        return ids.compactMap { id in
            guard inputChannels(id) > 0 else { return nil }
            return AudioInputDevice(id: id, name: name(id) ?? "Device \(id)")
        }
    }

    private static func inputChannels(_ id: AudioDeviceID) -> Int {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr, size > 0 else { return 0 }
        let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { raw.deallocate() }
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, raw) == noErr else { return 0 }
        let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
        return list.reduce(0) { $0 + Int($1.mNumberChannels) }
    }

    private static func name(_ id: AudioDeviceID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var name: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        let err = withUnsafeMutablePointer(to: &name) { ptr in
            AudioObjectGetPropertyData(id, &address, 0, nil, &size, ptr)
        }
        guard err == noErr, let name else { return nil }
        return name.takeRetainedValue() as String
    }
}
