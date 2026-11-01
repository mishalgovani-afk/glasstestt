import Foundation

public struct ClassifierConfig: Codable, Equatable, Hashable, Sendable {
    /// Sakoe–Chiba band as a fraction of sequence length.
    public var band: Double
    /// Score a word by the mean of its `k` closest templates.
    public var k: Int
    /// Reject when the best distance is above this (in scaled feature units).
    public var maxDistance: Double
    /// Reject when (runnerUp - best) / runnerUp is below this.
    public var minMargin: Double

    public init(band: Double = 0.2, k: Int = 1, maxDistance: Double = 2.5, minMargin: Double = 0.08) {
        self.band = band
        self.k = k
        self.maxDistance = maxDistance
        self.minMargin = minMargin
    }
}

public struct Candidate: Equatable, Sendable {
    public var label: String
    public var distance: Double
}

public struct Prediction: Equatable, Sendable {
    public enum Rejection: String, Sendable {
        case noTemplates = "No templates"
        case noiseClass = "Matched a noise template"
        case tooFar = "Too far from every template"
        case ambiguous = "Too close to call"
    }

    /// Accepted word, or nil if rejected.
    public var label: String?
    public var ranked: [Candidate]
    public var margin: Double
    public var rejection: Rejection?

    public var best: Candidate? { ranked.first }
    public var runnerUp: Candidate? { ranked.dropFirst().first }
}

/// Labels beginning with "_" are rejection classes, e.g. "_noise" for head turns, nods, chewing.
public func isNoiseLabel(_ label: String) -> Bool { label.hasPrefix("_") }

/// Nearest-template recogniser over DTW distance.
public struct TemplateClassifier: Sendable {
    public struct Template: Sendable {
        public var label: String
        public var sequence: FeatureSequence
    }

    public private(set) var templates: [Template]
    public private(set) var scaler: ChannelScaler
    public var config: ClassifierConfig

    /// - Parameter examples: unscaled feature sequences with their labels.
    public init(examples: [(label: String, sequence: FeatureSequence)], config: ClassifierConfig = .init()) {
        let usable = examples.filter { $0.sequence.count > 0 }
        let scaler = ChannelScaler.fit(usable.map(\.sequence))
        self.scaler = scaler
        self.templates = usable.map { Template(label: $0.label, sequence: scaler.apply($0.sequence)) }
        self.config = config
    }

    public var labels: [String] { Array(Set(templates.map(\.label))).sorted() }

    public func classify(_ raw: FeatureSequence) -> Prediction {
        guard !templates.isEmpty, raw.count > 0 else {
            return Prediction(label: nil, ranked: [], margin: 0, rejection: .noTemplates)
        }
        let seq = scaler.apply(raw)
        var perLabel: [String: [Double]] = [:]
        for t in templates {
            perLabel[t.label, default: []].append(DTW.distance(seq, t.sequence, band: config.band))
        }
        let k = max(1, config.k)
        let ranked = perLabel.map { label, ds -> Candidate in
            let best = ds.sorted().prefix(k)
            return Candidate(label: label, distance: best.reduce(0, +) / Double(best.count))
        }
        .sorted { ($0.distance, $0.label) < ($1.distance, $1.label) }

        let best = ranked[0]
        let margin: Double
        if ranked.count > 1, ranked[1].distance.isFinite, ranked[1].distance > 0 {
            margin = (ranked[1].distance - best.distance) / ranked[1].distance
        } else {
            margin = 1
        }

        var rejection: Prediction.Rejection?
        if isNoiseLabel(best.label) {
            rejection = .noiseClass
        } else if !(best.distance <= config.maxDistance) {
            rejection = .tooFar
        } else if margin < config.minMargin {
            rejection = .ambiguous
        }
        return Prediction(label: rejection == nil ? best.label : nil, ranked: ranked, margin: margin, rejection: rejection)
    }
}
