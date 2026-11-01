import Foundation

public enum EvaluationError: Error, Equatable, LocalizedError {
    case needTwoLabels
    case needTwoTakesPerLabel([String])

    public var errorDescription: String? {
        switch self {
        case .needTwoLabels:
            return "Record at least two different words."
        case .needTwoTakesPerLabel(let labels):
            return "Each word needs at least two takes. Short: \(labels.joined(separator: ", "))."
        }
    }
}

public struct EvaluationReport: Sendable {
    public var labels: [String]
    public var sampleCount: Int
    /// Leave-one-out accuracy of the nearest-template classifier.
    public var accuracy: Double
    /// 1 / number of words.
    public var chance: Double
    /// Accuracy of always guessing the most common word.
    public var majorityBaseline: Double
    /// Probability of reaching `accuracy` with shuffled labels.
    public var pValue: Double
    public var permutations: Int
    /// Accuracies obtained with shuffled labels.
    public var nullAccuracies: [Double]
    /// confusion[true][predicted], indexed like `labels`.
    public var confusion: [[Int]]

    public var nullMean: Double {
        nullAccuracies.isEmpty ? chance : nullAccuracies.reduce(0, +) / Double(nullAccuracies.count)
    }

    public var isSignificant: Bool { pValue < 0.05 }

    public func recall(of label: String) -> Double {
        guard let i = labels.firstIndex(of: label) else { return 0 }
        let row = confusion[i]
        let total = row.reduce(0, +)
        return total == 0 ? 0 : Double(row[i]) / Double(total)
    }

    public var verdict: String {
        if isSignificant {
            return String(
                format: "The motion signal separates these words: %.0f%% vs %.0f%% expected by chance (p = %.3f).",
                accuracy * 100, nullMean * 100, pValue
            )
        }
        return String(
            format: "No evidence yet: %.0f%% is within what shuffled labels reach (%.0f%%, p = %.3f). Record more takes or try other channels.",
            accuracy * 100, nullMean * 100, pValue
        )
    }
}

public enum Evaluator {
    /// Leave-one-out evaluation plus a label-permutation test.
    ///
    /// The distance matrix is computed once; the channel scaler is fitted on all data,
    /// which uses no labels and therefore cannot inflate accuracy relative to the null.
    public static func evaluate(
        sequences: [FeatureSequence],
        labels: [String],
        config: ClassifierConfig = .init(),
        permutations: Int = 500,
        seed: UInt64 = 0x5EED
    ) throws -> EvaluationReport {
        precondition(sequences.count == labels.count)
        let names = Array(Set(labels)).sorted()
        guard names.count >= 2 else { throw EvaluationError.needTwoLabels }
        let counts = Dictionary(labels.map { ($0, 1) }, uniquingKeysWith: +)
        let short = names.filter { counts[$0, default: 0] < 2 }
        guard short.isEmpty else { throw EvaluationError.needTwoTakesPerLabel(short) }

        let scaler = ChannelScaler.fit(sequences)
        let scaled = sequences.map(scaler.apply)
        let dist = DTW.matrix(scaled, band: config.band)
        return evaluate(distances: dist, labels: labels, k: config.k, permutations: permutations, seed: seed)
    }

    /// Same as above, starting from a precomputed distance matrix.
    public static func evaluate(
        distances: [[Double]],
        labels: [String],
        k: Int = 1,
        permutations: Int = 500,
        seed: UInt64 = 0x5EED
    ) -> EvaluationReport {
        let names = Array(Set(labels)).sorted()
        let index = Dictionary(uniqueKeysWithValues: names.enumerated().map { ($1, $0) })
        let y = labels.map { index[$0]! }

        let predicted = looPredict(distances: distances, labels: y, classCount: names.count, k: k)
        let acc = accuracy(predicted, y)

        var confusion = [[Int]](repeating: [Int](repeating: 0, count: names.count), count: names.count)
        for (t, p) in zip(y, predicted) where p >= 0 { confusion[t][p] += 1 }

        var rng = SplitMix64(seed: seed)
        var shuffled = y
        var nulls: [Double] = []
        nulls.reserveCapacity(permutations)
        var atLeast = 0
        for _ in 0..<permutations {
            shuffled.shuffle(using: &rng)
            let a = accuracy(looPredict(distances: distances, labels: shuffled, classCount: names.count, k: k), shuffled)
            nulls.append(a)
            if a >= acc - 1e-12 { atLeast += 1 }
        }
        let p = Double(atLeast + 1) / Double(permutations + 1)

        let majority = Double(counts(y, names.count).max() ?? 0) / Double(max(1, y.count))
        return EvaluationReport(
            labels: names,
            sampleCount: y.count,
            accuracy: acc,
            chance: 1 / Double(names.count),
            majorityBaseline: majority,
            pValue: p,
            permutations: permutations,
            nullAccuracies: nulls,
            confusion: confusion
        )
    }

    /// Predict each sample from all others. Returns -1 where no prediction is possible.
    static func looPredict(distances: [[Double]], labels: [Int], classCount: Int, k: Int) -> [Int] {
        let n = labels.count
        let k = max(1, k)
        var out = [Int](repeating: -1, count: n)
        var buckets = [[Double]](repeating: [], count: classCount)
        for i in 0..<n {
            for c in 0..<classCount { buckets[c].removeAll(keepingCapacity: true) }
            let row = distances[i]
            for j in 0..<n where j != i {
                buckets[labels[j]].append(row[j])
            }
            var bestClass = -1
            var bestScore = Double.infinity
            for c in 0..<classCount where !buckets[c].isEmpty {
                let score: Double
                if k == 1 {
                    score = buckets[c].min()!
                } else {
                    let s = buckets[c].sorted().prefix(k)
                    score = s.reduce(0, +) / Double(s.count)
                }
                if score < bestScore {
                    bestScore = score
                    bestClass = c
                }
            }
            out[i] = bestClass
        }
        return out
    }

    static func accuracy(_ predicted: [Int], _ truth: [Int]) -> Double {
        guard !truth.isEmpty else { return 0 }
        let hits = zip(predicted, truth).filter { $0 == $1 }.count
        return Double(hits) / Double(truth.count)
    }

    static func counts(_ y: [Int], _ classes: Int) -> [Int] {
        var c = [Int](repeating: 0, count: classes)
        for v in y { c[v] += 1 }
        return c
    }
}

/// Small deterministic PRNG so permutation tests are reproducible.
public struct SplitMix64: RandomNumberGenerator, Sendable {
    private var state: UInt64
    public init(seed: UInt64) { state = seed }
    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
