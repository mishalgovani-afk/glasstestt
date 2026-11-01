import Foundation
import HushCore
import Observation

/// Writes an experiment session to ~/Documents/Hush/Sessions/<timestamp>-<condition>/.
@MainActor
@Observable
final class SessionRecorder {
    private(set) var isRecording = false
    private(set) var directory: URL?
    private(set) var frameCount = 0
    private(set) var eventCount = 0
    private(set) var startedAt: Date?
    var lastError: String?

    @ObservationIgnored private var motionHandle: FileHandle?
    @ObservationIgnored private var eventHandle: FileHandle?
    @ObservationIgnored private var pending: [String] = []
    @ObservationIgnored private var origin: Double?
    @ObservationIgnored private var condition: SpeechCondition = .mouthed
    @ObservationIgnored private var prompt = ""
    @ObservationIgnored private var audioOffset: Double?
    @ObservationIgnored private var hasAudio = false

    static var root: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Hush/Sessions", isDirectory: true)
    }

    func start(condition: SpeechCondition, prompt: String, audio: AudioService) {
        guard !isRecording else { return }
        let stamp = Self.stampFormatter.string(from: Date())
        let dir = Self.root.appendingPathComponent("\(stamp)-\(condition.rawValue)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            motionHandle = try Self.open(dir.appendingPathComponent("motion.csv"), header: SessionCSV.motionHeader)
            eventHandle = try Self.open(dir.appendingPathComponent("events.csv"), header: SessionCSV.eventHeader)
        } catch {
            lastError = "Could not create session: \(error.localizedDescription)"
            return
        }
        // Motion timestamps are seconds since boot, so the uptime clock is the shared origin.
        origin = ProcessInfo.processInfo.systemUptime
        hasAudio = false
        audioOffset = nil
        if audio.isRunning {
            do {
                try audio.beginRecording(to: dir.appendingPathComponent("audio.caf"))
                hasAudio = true
                if let s = audio.recordingStartedAt, let origin { audioOffset = s - origin }
            } catch {
                lastError = "Audio not recorded: \(error.localizedDescription)"
            }
        }
        self.condition = condition
        self.prompt = prompt
        directory = dir
        frameCount = 0
        eventCount = 0
        startedAt = Date()
        isRecording = true
        lastError = nil
    }

    func append(_ f: MotionFrame) {
        guard isRecording, let origin else { return }
        pending.append(SessionCSV.motionRow(f, origin: origin))
        frameCount += 1
        if pending.count >= 25 { flush() }
    }

    func event(start: Double, end: Double, kind: String, label: String, detail: String = "") {
        guard isRecording, let origin, let eventHandle else { return }
        let row = SessionCSV.eventRow(start: start - origin, end: end - origin, kind: kind, label: label, detail: detail)
        eventHandle.write(Data((row + "\n").utf8))
        eventCount += 1
    }

    func stop(audio: AudioService) {
        guard isRecording else { return }
        flush()
        if hasAudio { audio.endRecording() }
        try? motionHandle?.close()
        try? eventHandle?.close()
        motionHandle = nil
        eventHandle = nil
        if let directory {
            let meta: [String: Any] = [
                "app": "Hush",
                "condition": condition.rawValue,
                "prompt": prompt,
                "started": ISO8601DateFormatter().string(from: startedAt ?? Date()),
                "duration": Date().timeIntervalSince(startedAt ?? Date()),
                "frames": frameCount,
                "events": eventCount,
                "audio": hasAudio ? "audio.caf" : NSNull(),
                "audioOffsetSeconds": audioOffset ?? NSNull(),
                "timeOrigin": "t = 0 is session start (system uptime clock)",
            ]
            if let data = try? JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted, .sortedKeys]) {
                try? data.write(to: directory.appendingPathComponent("meta.json"))
            }
        }
        isRecording = false
    }

    private func flush() {
        guard !pending.isEmpty, let motionHandle else { return }
        motionHandle.write(Data((pending.joined(separator: "\n") + "\n").utf8))
        pending.removeAll(keepingCapacity: true)
    }

    private static func open(_ url: URL, header: String) throws -> FileHandle {
        FileManager.default.createFile(atPath: url.path, contents: Data((header + "\n").utf8))
        let h = try FileHandle(forWritingTo: url)
        try h.seekToEnd()
        return h
    }

    private static let stampFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd-HHmmss"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}
