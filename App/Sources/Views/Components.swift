import HushCore
import SwiftUI

struct SpeechConditionOption: Identifiable {
    let value: SpeechCondition
    var id: String { value.rawValue }
    var title: String { value.title }
    static let all = SpeechCondition.allCases.map(SpeechConditionOption.init)
}

/// Three-line scrolling plot of a vector signal.
struct SignalPlot: View {
    let title: String
    let unit: String
    let values: [Vec3]
    var colors: [Color] = [.red, .green, .blue]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                if let last = values.last {
                    Text(String(format: "x %+.3f  y %+.3f  z %+.3f %@", last.x, last.y, last.z, unit))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            Canvas { ctx, size in
                let all = values.flatMap(\.components)
                let peak = max(all.map(abs).max() ?? 0, 1e-3)
                let mid = size.height / 2
                var axis = Path()
                axis.move(to: CGPoint(x: 0, y: mid))
                axis.addLine(to: CGPoint(x: size.width, y: mid))
                ctx.stroke(axis, with: .color(.secondary.opacity(0.3)), lineWidth: 1)
                guard values.count > 1 else { return }
                let dx = size.width / CGFloat(values.count - 1)
                for (c, color) in colors.enumerated() {
                    var p = Path()
                    for (i, v) in values.enumerated() {
                        let y = mid - CGFloat(v.components[c] / peak) * (size.height / 2 - 2)
                        let pt = CGPoint(x: CGFloat(i) * dx, y: y)
                        i == 0 ? p.move(to: pt) : p.addLine(to: pt)
                    }
                    ctx.stroke(p, with: .color(color), lineWidth: 1.4)
                }
            }
            .frame(minHeight: 70)
            .background(RoundedRectangle(cornerRadius: 6).fill(.quaternary.opacity(0.4)))
        }
    }
}

/// Horizontal meter with an optional threshold marker.
struct LevelMeter: View {
    let value: Double
    var maximum: Double = 1
    var threshold: Double?
    var tint: Color = .accentColor

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3).fill(.quaternary)
                RoundedRectangle(cornerRadius: 3).fill(tint)
                    .frame(width: w * CGFloat(min(1, max(0, value / maximum))))
                if let threshold {
                    Rectangle().fill(.primary).frame(width: 2)
                        .offset(x: w * CGFloat(min(1, max(0, threshold / maximum))) - 1)
                }
            }
        }
        .frame(height: 8)
    }
}

/// Big push-to-talk target.
struct CapturePad: View {
    let isCapturing: Bool
    let title: String
    let subtitle: String
    let frameCount: Int

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 44, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.4)
            Text(isCapturing ? "Capturing… \(frameCount) frames" : subtitle)
                .font(.callout)
                .foregroundStyle(isCapturing ? .primary : .secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 150)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isCapturing ? Color.red.opacity(0.18) : Color.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(isCapturing ? Color.red : Color.secondary.opacity(0.25), lineWidth: isCapturing ? 2 : 1)
        )
        .animation(.easeOut(duration: 0.12), value: isCapturing)
    }
}

struct Card<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline)
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(.background.secondary))
    }
}

extension Array where Element == MotionFrame {
    var accelerations: [Vec3] { map(\.userAcceleration) }
    var rotations: [Vec3] { map(\.rotationRate) }
    /// Attitude change relative to the first frame, as rotation vectors (radians).
    var relativeAttitudes: [Vec3] {
        guard let q0 = first?.attitude.normalized.conjugate else { return [] }
        return map { (q0 * $0.attitude.normalized).rotationVector }
    }
}

func percent(_ x: Double) -> String { String(format: "%.0f%%", x * 100) }
