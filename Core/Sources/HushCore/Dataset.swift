import Foundation

/// How the word was produced. The whole point of the experiment is comparing these.
public enum SpeechCondition: String, Codable, CaseIterable, Identifiable, Sendable {
    case normal
    case whisper
    case mouthed
    case imagined

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .normal: return "Normal speech"
        case .whisper: return "Whisper"
        case .mouthed: return "Silent mouthing"
        case .imagined: return "Imagined (no movement)"
        }
    }
}

public struct Take: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var label: String
    public var condition: SpeechCondition
    public var createdAt: Date
    public var frames: [MotionFrame]

    public init(id: UUID = UUID(), label: String, condition: SpeechCondition, createdAt: Date = Date(), frames: [MotionFrame]) {
        self.id = id
        self.label = label
        self.condition = condition
        self.createdAt = createdAt
        self.frames = frames
    }

    public var duration: Double { frames.duration }
}

public struct Dataset: Codable, Equatable, Sendable {
    public var version = 1
    public var vocabulary: [String]
    public var takes: [Take]

    public init(vocabulary: [String] = Dataset.starterVocabulary, takes: [Take] = []) {
        self.vocabulary = vocabulary
        self.takes = takes
    }

    public static let starterVocabulary = ["yes", "no", "hello", "stop", "next", "_noise"]

    public func count(of label: String, condition: SpeechCondition? = nil) -> Int {
        takes.filter { $0.label == label && (condition == nil || $0.condition == condition) }.count
    }

    public func takes(condition: SpeechCondition?) -> [Take] {
        guard let condition else { return takes }
        return takes.filter { $0.condition == condition }
    }

    /// The vocabulary word with the fewest takes, for balanced collection.
    public func leastRecorded(condition: SpeechCondition?, excluding: String? = nil) -> String? {
        let pool = vocabulary.filter { $0 != excluding }
        return pool.min { count(of: $0, condition: condition) < count(of: $1, condition: condition) }
    }

    public mutating func addWord(_ raw: String) {
        let w = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !w.isEmpty, !vocabulary.contains(w) else { return }
        vocabulary.append(w)
    }

    public mutating func removeWord(_ w: String) {
        vocabulary.removeAll { $0 == w }
        takes.removeAll { $0.label == w }
    }

    public static func load(from url: URL) throws -> Dataset {
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        return try decoder.decode(Dataset.self, from: data)
    }

    public func save(to url: URL) throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(self)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
}

/// CSV formatting for experiment sessions.
public enum SessionCSV {
    public static let motionHeader = "t,ax,ay,az,rx,ry,rz,qw,qx,qy,qz,gx,gy,gz"
    public static let eventHeader = "start,end,kind,label,detail"

    public static func motionRow(_ f: MotionFrame, origin: Double) -> String {
        let v: [Double] = [
            f.t - origin,
            f.userAcceleration.x, f.userAcceleration.y, f.userAcceleration.z,
            f.rotationRate.x, f.rotationRate.y, f.rotationRate.z,
            f.attitude.w, f.attitude.x, f.attitude.y, f.attitude.z,
            f.gravity.x, f.gravity.y, f.gravity.z,
        ]
        return v.map { String(format: "%.6f", $0) }.joined(separator: ",")
    }

    public static func eventRow(start: Double, end: Double, kind: String, label: String, detail: String) -> String {
        [String(format: "%.4f", start), String(format: "%.4f", end), escape(kind), escape(label), escape(detail)]
            .joined(separator: ",")
    }

    public static func escape(_ s: String) -> String {
        guard s.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" }) else { return s }
        return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}
