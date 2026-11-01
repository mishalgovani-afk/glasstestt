import Foundation

/// A plain 3-vector. Kept dependency-free so the core builds on Linux too.
public struct Vec3: Codable, Equatable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var z: Double

    public init(_ x: Double, _ y: Double, _ z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    public static let zero = Vec3(0, 0, 0)

    public var magnitude: Double { (x * x + y * y + z * z).squareRoot() }
    public var components: [Double] { [x, y, z] }

    public static func + (a: Vec3, b: Vec3) -> Vec3 { Vec3(a.x + b.x, a.y + b.y, a.z + b.z) }
    public static func - (a: Vec3, b: Vec3) -> Vec3 { Vec3(a.x - b.x, a.y - b.y, a.z - b.z) }
    public static func * (a: Vec3, s: Double) -> Vec3 { Vec3(a.x * s, a.y * s, a.z * s) }
}

/// Unit quaternion (Hamilton convention), matching `CMQuaternion`.
public struct Quat: Codable, Equatable, Hashable, Sendable {
    public var w: Double
    public var x: Double
    public var y: Double
    public var z: Double

    public init(w: Double, x: Double, y: Double, z: Double) {
        self.w = w
        self.x = x
        self.y = y
        self.z = z
    }

    public static let identity = Quat(w: 1, x: 0, y: 0, z: 0)

    /// Rotation of `angle` radians about `axis` (need not be normalised).
    public init(axis: Vec3, angle: Double) {
        let m = axis.magnitude
        guard m > 0 else { self = .identity; return }
        let s = sin(angle / 2) / m
        self.init(w: cos(angle / 2), x: axis.x * s, y: axis.y * s, z: axis.z * s)
    }

    public var conjugate: Quat { Quat(w: w, x: -x, y: -y, z: -z) }

    public var normalized: Quat {
        let n = (w * w + x * x + y * y + z * z).squareRoot()
        guard n > 0 else { return .identity }
        return Quat(w: w / n, x: x / n, y: y / n, z: z / n)
    }

    public static func * (a: Quat, b: Quat) -> Quat {
        Quat(
            w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
            x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
        )
    }

    /// Axis-angle as a single vector (axis * angle, radians). Continuous near identity,
    /// which makes it a good small-motion feature.
    public var rotationVector: Vec3 {
        var q = normalized
        if q.w < 0 { q = Quat(w: -q.w, x: -q.x, y: -q.y, z: -q.z) }
        let v = Vec3(q.x, q.y, q.z)
        let s = v.magnitude
        guard s > 1e-12 else { return v * 2 }
        let angle = 2 * atan2(s, q.w)
        return v * (angle / s)
    }
}
