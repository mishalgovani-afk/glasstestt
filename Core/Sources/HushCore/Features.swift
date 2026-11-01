import Foundation

/// Which motion channel groups feed the recogniser. Each group contributes three dimensions.
public struct FeatureSet: OptionSet, Codable, Hashable, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let acceleration = FeatureSet(rawValue: 1 << 0)
    public static let rotationRate = FeatureSet(rawValue: 1 << 1)
    /// Attitude change since the first frame of the segment, as a rotation vector.
    public static let attitude = FeatureSet(rawValue: 1 << 2)
    /// Gravity-direction change since the first frame of the segment.
    public static let gravity = FeatureSet(rawValue: 1 << 3)

    public static let `default`: FeatureSet = [.acceleration, .rotationRate, .attitude]
    public static let all: FeatureSet = [.acceleration, .rotationRate, .attitude, .gravity]

    public static let groups: [(FeatureSet, String)] = [
        (.acceleration, "Acceleration"),
        (.rotationRate, "Rotation rate"),
        (.attitude, "Attitude"),
        (.gravity, "Gravity"),
    ]

    public var groupCount: Int { FeatureSet.groups.filter { contains($0.0) }.count }

    public var name: String {
        let names = FeatureSet.groups.filter { contains($0.0) }.map(\.1)
        return names.isEmpty ? "None" : names.joined(separator: " + ")
    }

    /// Every non-empty combination of groups, for ablation studies.
    public static func allCombinations(of base: FeatureSet = .all) -> [FeatureSet] {
        let present = groups.map(\.0).filter { base.contains($0) }
        var out: [FeatureSet] = []
        for mask in 1..<(1 << present.count) {
            var s: FeatureSet = []
            for (i, g) in present.enumerated() where mask & (1 << i) != 0 { s.insert(g) }
            out.append(s)
        }
        return out.sorted { ($0.groupCount, $0.rawValue) < ($1.groupCount, $1.rawValue) }
    }
}

public struct FeatureConfig: Codable, Equatable, Hashable, Sendable {
    public var channels: FeatureSet
    /// Frames whose activity is below this fraction of the segment peak are trimmed from both ends.
    public var trimThreshold: Double
    /// Centered moving-average window in frames (1 disables smoothing).
    public var smoothing: Int
    /// Append first differences of every channel.
    public var includeDeltas: Bool

    public init(
        channels: FeatureSet = .default,
        trimThreshold: Double = 0.12,
        smoothing: Int = 3,
        includeDeltas: Bool = false
    ) {
        self.channels = channels
        self.trimThreshold = trimThreshold
        self.smoothing = smoothing
        self.includeDeltas = includeDeltas
    }

    public var dimension: Int { channels.groupCount * 3 * (includeDeltas ? 2 : 1) }
}

/// A multichannel time series stored row-major: `values[frame * dim + channel]`.
public struct FeatureSequence: Equatable, Sendable {
    public let dim: Int
    public var values: [Double]

    public init(dim: Int, values: [Double]) {
        precondition(dim > 0 && values.count % dim == 0, "values must be a whole number of frames")
        self.dim = dim
        self.values = values
    }

    public init(rows: [[Double]]) {
        let d = rows.first?.count ?? 1
        self.init(dim: d, values: rows.flatMap { $0 })
    }

    public var count: Int { values.count / dim }

    public subscript(frame: Int, channel: Int) -> Double {
        get { values[frame * dim + channel] }
        set { values[frame * dim + channel] = newValue }
    }

    public func channel(_ c: Int) -> [Double] {
        (0..<count).map { self[$0, c] }
    }
}

public enum FeatureExtractor {
    /// Per-frame activity in [0, 1]: acceleration and rotation magnitudes, each scaled by its own peak.
    public static func activity(_ frames: [MotionFrame]) -> [Double] {
        let acc = frames.map(\.userAcceleration.magnitude)
        let rot = frames.map(\.rotationRate.magnitude)
        let am = max(acc.max() ?? 0, 1e-12)
        let rm = max(rot.max() ?? 0, 1e-12)
        return zip(acc, rot).map { ($0 / am + $1 / rm) / 2 }
    }

    /// Drop quiet lead-in and lead-out frames, keeping `padding` frames of context.
    public static func trim(_ frames: [MotionFrame], threshold: Double, padding: Int = 2, minimumLength: Int = 6) -> [MotionFrame] {
        guard threshold > 0, frames.count > minimumLength else { return frames }
        let e = activity(frames)
        let peak = e.max() ?? 0
        guard peak > 0,
              let first = e.firstIndex(where: { $0 >= threshold * peak }),
              let last = e.lastIndex(where: { $0 >= threshold * peak })
        else { return frames }
        let lo = max(0, first - padding)
        let hi = min(frames.count - 1, last + padding)
        guard hi - lo + 1 >= minimumLength else { return frames }
        return Array(frames[lo...hi])
    }

    public static func extract(_ input: [MotionFrame], config: FeatureConfig) -> FeatureSequence {
        let baseDim = config.channels.groupCount * 3
        guard baseDim > 0 else { return FeatureSequence(dim: 1, values: []) }
        let frames = trim(input, threshold: config.trimThreshold)
        guard let first = frames.first else {
            return FeatureSequence(dim: config.dimension, values: [])
        }

        let q0inv = first.attitude.normalized.conjugate
        let g0 = first.gravity
        var rows: [[Double]] = []
        rows.reserveCapacity(frames.count)
        for f in frames {
            var row: [Double] = []
            row.reserveCapacity(baseDim)
            if config.channels.contains(.acceleration) { row += f.userAcceleration.components }
            if config.channels.contains(.rotationRate) { row += f.rotationRate.components }
            if config.channels.contains(.attitude) { row += (q0inv * f.attitude.normalized).rotationVector.components }
            if config.channels.contains(.gravity) { row += (f.gravity - g0).components }
            rows.append(row)
        }

        rows = smooth(rows, window: config.smoothing)

        if config.includeDeltas {
            let deltas = rows.indices.map { i -> [Double] in
                guard i > 0 else { return [Double](repeating: 0, count: baseDim) }
                return zip(rows[i], rows[i - 1]).map { $0 - $1 }
            }
            rows = zip(rows, deltas).map { $0 + $1 }
        }

        var seq = FeatureSequence(rows: rows)
        meanCenter(&seq)
        return seq
    }

    static func smooth(_ rows: [[Double]], window: Int) -> [[Double]] {
        guard window > 1, rows.count > 1, let dim = rows.first?.count else { return rows }
        let half = window / 2
        return rows.indices.map { i in
            let lo = max(0, i - half)
            let hi = min(rows.count - 1, i + half)
            var acc = [Double](repeating: 0, count: dim)
            for j in lo...hi {
                for c in 0..<dim { acc[c] += rows[j][c] }
            }
            let n = Double(hi - lo + 1)
            return acc.map { $0 / n }
        }
    }

    static func meanCenter(_ seq: inout FeatureSequence) {
        let n = seq.count
        guard n > 0 else { return }
        for c in 0..<seq.dim {
            var mean = 0.0
            for i in 0..<n { mean += seq[i, c] }
            mean /= Double(n)
            for i in 0..<n { seq[i, c] -= mean }
        }
    }
}

/// Per-channel scale so that no single sensor dominates the distance.
/// Fitted on unlabeled frames only, so using it inside cross-validation leaks no label information.
public struct ChannelScaler: Codable, Equatable, Sendable {
    public var scales: [Double]

    public init(scales: [Double]) { self.scales = scales }

    public static func fit(_ sequences: [FeatureSequence]) -> ChannelScaler {
        guard let dim = sequences.first(where: { $0.count > 0 })?.dim else { return ChannelScaler(scales: []) }
        var sum = [Double](repeating: 0, count: dim)
        var sumSq = [Double](repeating: 0, count: dim)
        var n = 0.0
        for s in sequences where s.dim == dim {
            for i in 0..<s.count {
                for c in 0..<dim {
                    let v = s[i, c]
                    sum[c] += v
                    sumSq[c] += v * v
                }
            }
            n += Double(s.count)
        }
        guard n > 1 else { return ChannelScaler(scales: [Double](repeating: 1, count: dim)) }
        let scales = (0..<dim).map { c -> Double in
            let mean = sum[c] / n
            let variance = max(0, sumSq[c] / n - mean * mean)
            let sd = variance.squareRoot()
            return sd > 1e-9 ? 1 / sd : 1
        }
        return ChannelScaler(scales: scales)
    }

    public func apply(_ seq: FeatureSequence) -> FeatureSequence {
        guard scales.count == seq.dim else { return seq }
        var out = seq
        for i in 0..<out.count {
            for c in 0..<out.dim { out[i, c] *= scales[c] }
        }
        return out
    }
}
