import Foundation

/// Multivariate dynamic time warping with a Sakoe–Chiba band.
public enum DTW {
    /// Path-length-normalised DTW distance between two sequences of equal dimension.
    ///
    /// - Parameters:
    ///   - band: Band half-width as a fraction of the longer sequence. Always widened enough
    ///     to reach the corner when lengths differ.
    ///   - cutoff: Early-abandon threshold on the normalised distance. Returns `.infinity`
    ///     as soon as the result is guaranteed to exceed it.
    public static func distance(
        _ a: FeatureSequence,
        _ b: FeatureSequence,
        band: Double = 0.2,
        cutoff: Double = .infinity
    ) -> Double {
        let n = a.count, m = b.count
        guard n > 0, m > 0, a.dim == b.dim else { return .infinity }
        let dim = a.dim
        let norm = Double(n + m)
        let w = max(Int((band * Double(max(n, m))).rounded(.up)), abs(n - m), 1)

        var prev = [Double](repeating: .infinity, count: m + 1)
        var cur = [Double](repeating: .infinity, count: m + 1)
        prev[0] = 0

        a.values.withUnsafeBufferPointer { av in
            b.values.withUnsafeBufferPointer { bv in
                for i in 1...n {
                    for j in 0...m { cur[j] = .infinity }
                    let jLo = max(1, i - w)
                    let jHi = min(m, i + w)
                    var rowMin = Double.infinity
                    if jLo <= jHi {
                        let ai = (i - 1) * dim
                        for j in jLo...jHi {
                            let bj = (j - 1) * dim
                            var d2 = 0.0
                            for c in 0..<dim {
                                let d = av[ai + c] - bv[bj + c]
                                d2 += d * d
                            }
                            let step = min(prev[j], prev[j - 1], cur[j - 1])
                            let v = d2.squareRoot() + step
                            cur[j] = v
                            if v < rowMin { rowMin = v }
                        }
                    }
                    if rowMin / norm > cutoff {
                        prev[m] = .infinity
                        return
                    }
                    swap(&prev, &cur)
                }
            }
        }
        return prev[m] / norm
    }

    /// Symmetric pairwise distance matrix.
    public static func matrix(_ seqs: [FeatureSequence], band: Double = 0.2) -> [[Double]] {
        let n = seqs.count
        var out = [[Double]](repeating: [Double](repeating: 0, count: n), count: n)
        for i in 0..<n {
            for j in (i + 1)..<max(i + 1, n) {
                let d = distance(seqs[i], seqs[j], band: band)
                out[i][j] = d
                out[j][i] = d
            }
        }
        return out
    }
}
