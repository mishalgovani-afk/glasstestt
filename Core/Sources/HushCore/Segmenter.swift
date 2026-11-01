import Foundation

public struct SegmenterConfig: Codable, Equatable, Hashable, Sendable {
    /// Trigger when activity exceeds the noise floor by this many standard deviations.
    public var sensitivity: Double
    /// Release threshold as a fraction of the trigger threshold.
    public var releaseRatio: Double
    /// Consecutive frames above threshold needed to start a segment.
    public var minOnFrames: Int
    /// Frames kept from before the trigger.
    public var prerollFrames: Int
    /// Consecutive quiet frames that end a segment.
    public var hangoverFrames: Int
    public var minFrames: Int
    public var maxFrames: Int
    /// Exponential smoothing of the activity score (0..1, higher = less smoothing).
    public var smoothing: Double
    public var calibrationFrames: Int

    public init(
        sensitivity: Double = 5,
        releaseRatio: Double = 0.5,
        minOnFrames: Int = 2,
        prerollFrames: Int = 6,
        hangoverFrames: Int = 8,
        minFrames: Int = 8,
        maxFrames: Int = 125,
        smoothing: Double = 0.4,
        calibrationFrames: Int = 75
    ) {
        self.sensitivity = sensitivity
        self.releaseRatio = releaseRatio
        self.minOnFrames = minOnFrames
        self.prerollFrames = prerollFrames
        self.hangoverFrames = hangoverFrames
        self.minFrames = minFrames
        self.maxFrames = maxFrames
        self.smoothing = smoothing
        self.calibrationFrames = calibrationFrames
    }
}

/// Streaming motion-activity detector: calibrate on stillness, then emit segments of movement.
public struct MotionSegmenter: Sendable {
    public enum State: Equatable, Sendable {
        case uncalibrated
        case calibrating(progress: Double)
        case idle
        case active
    }

    public var config: SegmenterConfig
    public private(set) var state: State = .uncalibrated
    /// Smoothed activity in noise standard deviations.
    public private(set) var level: Double = 0

    private var accStats = RunningStats()
    private var rotStats = RunningStats()
    private var accFloor = (mean: 0.0, sd: 1.0)
    private var rotFloor = (mean: 0.0, sd: 1.0)
    private var preroll: [MotionFrame] = []
    private var buffer: [MotionFrame] = []
    private var above = 0
    private var below = 0

    public init(config: SegmenterConfig = .init()) {
        self.config = config
    }

    public var isCalibrated: Bool {
        switch state {
        case .idle, .active: return true
        default: return false
        }
    }

    public var noiseFloor: (acceleration: Double, rotation: Double) { (accFloor.mean, rotFloor.mean) }

    public mutating func beginCalibration() {
        accStats = RunningStats()
        rotStats = RunningStats()
        state = .calibrating(progress: 0)
        reset()
    }

    /// Use explicit noise statistics instead of calibrating.
    public mutating func setNoiseFloor(accMean: Double, accSD: Double, rotMean: Double, rotSD: Double) {
        accFloor = (accMean, max(accSD, 1e-4))
        rotFloor = (rotMean, max(rotSD, 1e-4))
        state = .idle
        reset()
    }

    public mutating func reset() {
        preroll.removeAll()
        buffer.removeAll()
        above = 0
        below = 0
        level = 0
        if state == .active { state = .idle }
    }

    /// Feed one frame. Returns a finished segment when one ends.
    public mutating func process(_ f: MotionFrame) -> [MotionFrame]? {
        let a = f.userAcceleration.magnitude
        let r = f.rotationRate.magnitude

        switch state {
        case .uncalibrated:
            return nil
        case .calibrating:
            accStats.add(a)
            rotStats.add(r)
            let n = accStats.count
            if n >= config.calibrationFrames {
                setNoiseFloor(accMean: accStats.mean, accSD: accStats.sd, rotMean: rotStats.mean, rotSD: rotStats.sd)
            } else {
                state = .calibrating(progress: Double(n) / Double(max(1, config.calibrationFrames)))
            }
            return nil
        case .idle, .active:
            break
        }

        let z = max((a - accFloor.mean) / accFloor.sd, (r - rotFloor.mean) / rotFloor.sd, 0)
        level += config.smoothing * (z - level)
        let on = config.sensitivity
        let off = config.sensitivity * config.releaseRatio

        if state == .idle {
            preroll.append(f)
            if preroll.count > config.prerollFrames + config.minOnFrames {
                preroll.removeFirst(preroll.count - (config.prerollFrames + config.minOnFrames))
            }
            above = level > on ? above + 1 : 0
            if above >= config.minOnFrames {
                state = .active
                buffer = preroll
                preroll.removeAll()
                below = 0
            }
            return nil
        }

        // active
        buffer.append(f)
        below = level < off ? below + 1 : 0
        guard below >= config.hangoverFrames || buffer.count >= config.maxFrames else { return nil }
        let keepTail = 2
        let segment = Array(buffer.dropLast(max(0, below - keepTail)))
        buffer.removeAll()
        above = 0
        below = 0
        state = .idle
        return segment.count >= config.minFrames ? segment : nil
    }
}

struct RunningStats: Sendable {
    private(set) var count = 0
    private(set) var mean = 0.0
    private var m2 = 0.0

    mutating func add(_ x: Double) {
        count += 1
        let d = x - mean
        mean += d / Double(count)
        m2 += d * (x - mean)
    }

    var sd: Double { count > 1 ? (m2 / Double(count - 1)).squareRoot() : 0 }
}
