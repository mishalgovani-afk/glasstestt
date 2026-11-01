import Foundation

/// One headphone device-motion sample, a platform-neutral mirror of `CMDeviceMotion`.
public struct MotionFrame: Codable, Equatable, Sendable {
    /// Seconds. On device this is `CMLogItem.timestamp` (seconds since boot).
    public var t: Double
    /// User acceleration in g, gravity removed.
    public var userAcceleration: Vec3
    /// Rotation rate in rad/s.
    public var rotationRate: Vec3
    /// Attitude relative to the reference frame.
    public var attitude: Quat
    /// Gravity direction in g.
    public var gravity: Vec3

    public init(
        t: Double,
        userAcceleration: Vec3 = .zero,
        rotationRate: Vec3 = .zero,
        attitude: Quat = .identity,
        gravity: Vec3 = Vec3(0, 0, -1)
    ) {
        self.t = t
        self.userAcceleration = userAcceleration
        self.rotationRate = rotationRate
        self.attitude = attitude
        self.gravity = gravity
    }

    // Compact coding: datasets hold thousands of frames, so use short keys.
    private enum CodingKeys: String, CodingKey {
        case t, a, r, q, g
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        t = try c.decode(Double.self, forKey: .t)
        let a = try c.decode([Double].self, forKey: .a)
        let r = try c.decode([Double].self, forKey: .r)
        let q = try c.decode([Double].self, forKey: .q)
        let g = try c.decode([Double].self, forKey: .g)
        guard a.count == 3, r.count == 3, q.count == 4, g.count == 3 else {
            throw DecodingError.dataCorruptedError(forKey: .a, in: c, debugDescription: "Bad motion frame arity")
        }
        userAcceleration = Vec3(a[0], a[1], a[2])
        rotationRate = Vec3(r[0], r[1], r[2])
        attitude = Quat(w: q[0], x: q[1], y: q[2], z: q[3])
        gravity = Vec3(g[0], g[1], g[2])
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(t, forKey: .t)
        try c.encode(userAcceleration.components, forKey: .a)
        try c.encode(rotationRate.components, forKey: .r)
        try c.encode([attitude.w, attitude.x, attitude.y, attitude.z], forKey: .q)
        try c.encode(gravity.components, forKey: .g)
    }
}

public extension Array where Element == MotionFrame {
    var duration: Double {
        guard let first, let last else { return 0 }
        return last.t - first.t
    }

    /// Mean sample rate in Hz.
    var sampleRate: Double {
        guard count > 1, duration > 0 else { return 0 }
        return Double(count - 1) / duration
    }
}
