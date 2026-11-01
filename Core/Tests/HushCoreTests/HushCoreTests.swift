import Foundation
import XCTest
@testable import HushCore

/// Synthetic "word" generator: each word is a distinct jaw/head motion shape,
/// randomly time-stretched, amplitude-jittered and noisy.
struct Synth {
    var rng: SplitMix64

    init(seed: UInt64) { rng = SplitMix64(seed: seed) }

    mutating func gaussian(_ sd: Double) -> Double {
        let u1 = max(Double.random(in: 0..<1, using: &rng), 1e-12)
        let u2 = Double.random(in: 0..<1, using: &rng)
        return sd * (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
    }

    mutating func quiet(_ n: Int, start: Double = 0, noise: Double = 0.002) -> [MotionFrame] {
        (0..<n).map { i in
            MotionFrame(
                t: start + Double(i) / 25,
                userAcceleration: Vec3(gaussian(noise), gaussian(noise), gaussian(noise)),
                rotationRate: Vec3(gaussian(noise * 5), gaussian(noise * 5), gaussian(noise * 5))
            )
        }
    }

    /// `word` 0, 1, 2 … picks a shape. Returns frames at 25 Hz with quiet padding.
    mutating func word(_ word: Int, start: Double = 0, noise: Double = 0.004) -> [MotionFrame] {
        let stretch = Double.random(in: 0.8...1.25, using: &rng)
        let amp = Double.random(in: 0.85...1.15, using: &rng)
        let n = Int(30 * stretch)
        var frames = quiet(4, start: start, noise: noise)
        var q = Quat.identity
        for i in 0..<n {
            let p = Double(i) / Double(n - 1)
            let bump = sin(.pi * p)
            let a: Vec3
            let r: Vec3
            switch word % 4 {
            case 0: // single jaw drop
                a = Vec3(0, 0, -0.05 * bump)
                r = Vec3(0.3 * bump, 0, 0)
            case 1: // two syllables
                a = Vec3(0, 0, -0.05 * sin(2 * .pi * p) * bump)
                r = Vec3(0.3 * sin(2 * .pi * p), 0, 0)
            case 2: // lateral
                a = Vec3(0.04 * bump, 0, 0)
                r = Vec3(0, 0, 0.25 * bump)
            default: // rising then sharp close
                a = Vec3(0, 0.04 * p * p, -0.03 * bump)
                r = Vec3(0, 0.3 * p, 0)
            }
            let dq = Quat(axis: r, angle: r.magnitude * amp / 25)
            q = (q * dq).normalized
            frames.append(MotionFrame(
                t: start + Double(frames.count) / 25,
                userAcceleration: Vec3(a.x * amp + gaussian(noise), a.y * amp + gaussian(noise), a.z * amp + gaussian(noise)),
                rotationRate: Vec3(r.x * amp + gaussian(noise * 5), r.y * amp + gaussian(noise * 5), r.z * amp + gaussian(noise * 5)),
                attitude: q
            ))
        }
        frames += quiet(4, start: start + Double(frames.count) / 25, noise: noise)
        return frames
    }
}

final class GeometryTests: XCTestCase {
    func testRotationVectorRoundTrip() {
        let axis = Vec3(0.2, -0.5, 0.8)
        let q = Quat(axis: axis, angle: 0.3)
        let v = q.rotationVector
        XCTAssertEqual(v.magnitude, 0.3, accuracy: 1e-9)
        let unit = axis * (1 / axis.magnitude)
        XCTAssertEqual(v.x / v.magnitude, unit.x, accuracy: 1e-9)
        XCTAssertEqual(v.y / v.magnitude, unit.y, accuracy: 1e-9)
        XCTAssertEqual(v.z / v.magnitude, unit.z, accuracy: 1e-9)
    }

    func testRelativeAttitude() {
        let q0 = Quat(axis: Vec3(0, 0, 1), angle: 1.0)
        let q1 = q0 * Quat(axis: Vec3(1, 0, 0), angle: 0.2)
        let rel = (q0.conjugate * q1).rotationVector
        XCTAssertEqual(rel.x, 0.2, accuracy: 1e-9)
        XCTAssertEqual(rel.y, 0, accuracy: 1e-9)
        XCTAssertEqual(rel.z, 0, accuracy: 1e-9)
    }

    func testFrameCodingRoundTrip() throws {
        let f = MotionFrame(t: 1.5, userAcceleration: Vec3(1, 2, 3), rotationRate: Vec3(4, 5, 6),
                            attitude: Quat(w: 0.5, x: 0.5, y: 0.5, z: 0.5), gravity: Vec3(0, -1, 0))
        let data = try JSONEncoder().encode([f])
        XCTAssertEqual(try JSONDecoder().decode([MotionFrame].self, from: data), [f])
    }
}

final class FeatureTests: XCTestCase {
    func testDimensionsMatchChannels() {
        var s = Synth(seed: 1)
        let frames = s.word(0)
        for set in FeatureSet.allCombinations() {
            for deltas in [false, true] {
                let cfg = FeatureConfig(channels: set, includeDeltas: deltas)
                let seq = FeatureExtractor.extract(frames, config: cfg)
                XCTAssertEqual(seq.dim, cfg.dimension, "\(set.name)")
                XCTAssertGreaterThan(seq.count, 5)
            }
        }
        XCTAssertEqual(FeatureSet.allCombinations().count, 15)
    }

    func testTrimRemovesQuietPadding() {
        var s = Synth(seed: 2)
        let frames = s.quiet(20) + s.word(0, start: 20.0 / 25) + s.quiet(20, start: 3)
        let trimmed = FeatureExtractor.trim(frames, threshold: 0.12)
        XCTAssertLessThan(trimmed.count, frames.count - 20)
    }

    func testMeanCentered() {
        var s = Synth(seed: 3)
        let seq = FeatureExtractor.extract(s.word(2), config: FeatureConfig())
        for c in 0..<seq.dim {
            let mean = seq.channel(c).reduce(0, +) / Double(seq.count)
            XCTAssertEqual(mean, 0, accuracy: 1e-9)
        }
    }

    func testScalerUnitVariance() {
        var s = Synth(seed: 4)
        let seqs = (0..<6).map { FeatureExtractor.extract(s.word($0), config: FeatureConfig()) }
        let scaler = ChannelScaler.fit(seqs)
        let scaled = seqs.map(scaler.apply)
        let all = scaled.flatMap { $0.channel(0) }
        let mean = all.reduce(0, +) / Double(all.count)
        let variance = all.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(all.count)
        XCTAssertEqual(variance, 1, accuracy: 1e-6)
    }
}

final class DTWTests: XCTestCase {
    func seq(_ xs: [Double]) -> FeatureSequence { FeatureSequence(dim: 1, values: xs) }

    func testIdenticalIsZero() {
        let a = seq([0, 1, 2, 1, 0])
        XCTAssertEqual(DTW.distance(a, a), 0, accuracy: 1e-12)
    }

    func testWarpingBeatsShapeChange() {
        let base = (0..<30).map { sin(Double($0) / 29 * .pi) }
        let slow = (0..<40).map { sin(Double($0) / 39 * .pi) }
        let other = (0..<30).map { -sin(Double($0) / 29 * 2 * .pi) }
        XCTAssertLessThan(DTW.distance(seq(base), seq(slow)), 0.05)
        XCTAssertLessThan(DTW.distance(seq(base), seq(slow)), DTW.distance(seq(base), seq(other)) / 5)
    }

    func testSymmetricAndMatrix() {
        let a = seq([0, 1, 3, 1, 0, 0])
        let b = seq([0, 0, 2, 2, 1])
        XCTAssertEqual(DTW.distance(a, b), DTW.distance(b, a), accuracy: 1e-12)
        let m = DTW.matrix([a, b, a])
        XCTAssertEqual(m[0][2], 0, accuracy: 1e-12)
        XCTAssertEqual(m[0][1], m[1][0])
    }

    func testEarlyAbandon() {
        let a = seq(Array(repeating: 0, count: 20))
        let b = seq(Array(repeating: 10, count: 20))
        XCTAssertEqual(DTW.distance(a, b, cutoff: 1), .infinity)
        XCTAssertEqual(DTW.distance(a, b), 5, accuracy: 1e-9) // 20 steps * 10 / 40
    }

    func testMismatchedLengthsReachCorner() {
        let a = seq(Array(repeating: 1, count: 5))
        let b = seq(Array(repeating: 1, count: 50))
        XCTAssertEqual(DTW.distance(a, b, band: 0.01), 0, accuracy: 1e-12)
    }
}

final class ClassifierTests: XCTestCase {
    func dataset(seed: UInt64, perWord: Int, words: Int = 3) -> [(label: String, sequence: FeatureSequence)] {
        var s = Synth(seed: seed)
        var out: [(String, FeatureSequence)] = []
        for w in 0..<words {
            for _ in 0..<perWord {
                out.append(("w\(w)", FeatureExtractor.extract(s.word(w), config: FeatureConfig())))
            }
        }
        return out
    }

    func testRecognisesHeldOutTakes() {
        let train = dataset(seed: 10, perWord: 5)
        let clf = TemplateClassifier(examples: train, config: ClassifierConfig(maxDistance: .infinity, minMargin: 0))
        var s = Synth(seed: 99)
        var hits = 0
        for w in 0..<3 {
            for _ in 0..<5 {
                let p = clf.classify(FeatureExtractor.extract(s.word(w), config: FeatureConfig()))
                if p.label == "w\(w)" { hits += 1 }
            }
        }
        XCTAssertGreaterThanOrEqual(hits, 13)
    }

    func testNoiseClassIsRejected() {
        var train = dataset(seed: 11, perWord: 4, words: 2)
        var s = Synth(seed: 12)
        for _ in 0..<4 {
            train.append(("_noise", FeatureExtractor.extract(s.word(2), config: FeatureConfig())))
        }
        let clf = TemplateClassifier(examples: train, config: ClassifierConfig(maxDistance: .infinity, minMargin: 0))
        let p = clf.classify(FeatureExtractor.extract(s.word(2), config: FeatureConfig()))
        XCTAssertNil(p.label)
        XCTAssertEqual(p.rejection, .noiseClass)
        XCTAssertEqual(p.best?.label, "_noise")
    }

    func testDistanceGate() {
        let train = dataset(seed: 13, perWord: 3, words: 2)
        let clf = TemplateClassifier(examples: train, config: ClassifierConfig(maxDistance: 1e-9, minMargin: 0))
        var s = Synth(seed: 14)
        let p = clf.classify(FeatureExtractor.extract(s.word(0), config: FeatureConfig()))
        XCTAssertEqual(p.rejection, .tooFar)
    }

    func testEmpty() {
        let clf = TemplateClassifier(examples: [])
        XCTAssertEqual(clf.classify(FeatureSequence(dim: 3, values: [0, 0, 0])).rejection, .noTemplates)
    }
}

final class EvaluationTests: XCTestCase {
    func testSeparableWordsAreSignificant() throws {
        var s = Synth(seed: 20)
        var seqs: [FeatureSequence] = []
        var labels: [String] = []
        for w in 0..<4 {
            for _ in 0..<6 {
                seqs.append(FeatureExtractor.extract(s.word(w), config: FeatureConfig()))
                labels.append("w\(w)")
            }
        }
        let r = try Evaluator.evaluate(sequences: seqs, labels: labels, permutations: 200)
        XCTAssertGreaterThan(r.accuracy, 0.85)
        XCTAssertLessThan(r.pValue, 0.01)
        XCTAssertTrue(r.isSignificant)
        XCTAssertEqual(r.confusion.flatMap { $0 }.reduce(0, +), 24)
        XCTAssertEqual(r.chance, 0.25, accuracy: 1e-12)
        XCTAssertLessThan(r.nullMean, 0.45)
    }

    func testUninformativeLabelsAreNotSignificant() throws {
        // Every take is the same word; labels carry no signal.
        var s = Synth(seed: 21)
        var seqs: [FeatureSequence] = []
        var labels: [String] = []
        for i in 0..<24 {
            seqs.append(FeatureExtractor.extract(s.word(0), config: FeatureConfig()))
            labels.append("w\(i % 3)")
        }
        let r = try Evaluator.evaluate(sequences: seqs, labels: labels, permutations: 200)
        XCTAssertLessThan(r.accuracy, 0.7)
        XCTAssertGreaterThan(r.pValue, 0.001)
    }

    func testPermutationTestIsReproducible() throws {
        var s = Synth(seed: 22)
        let seqs = (0..<12).map { FeatureExtractor.extract(s.word($0 % 2), config: FeatureConfig()) }
        let labels = (0..<12).map { "w\($0 % 2)" }
        let a = try Evaluator.evaluate(sequences: seqs, labels: labels, permutations: 50, seed: 7)
        let b = try Evaluator.evaluate(sequences: seqs, labels: labels, permutations: 50, seed: 7)
        XCTAssertEqual(a.nullAccuracies, b.nullAccuracies)
        XCTAssertEqual(a.pValue, b.pValue)
    }

    func testValidation() {
        let seq = FeatureSequence(dim: 1, values: [0, 1, 0])
        XCTAssertThrowsError(try Evaluator.evaluate(sequences: [seq, seq], labels: ["a", "a"])) {
            XCTAssertEqual($0 as? EvaluationError, .needTwoLabels)
        }
        XCTAssertThrowsError(try Evaluator.evaluate(sequences: [seq, seq, seq], labels: ["a", "a", "b"])) {
            XCTAssertEqual($0 as? EvaluationError, .needTwoTakesPerLabel(["b"]))
        }
    }
}

final class SegmenterTests: XCTestCase {
    func testDetectsWordsInStream() {
        var s = Synth(seed: 30)
        var seg = MotionSegmenter()
        seg.beginCalibration()
        var stream = s.quiet(80)
        var t = Double(stream.count) / 25
        var expected = 0
        for w in 0..<3 {
            stream += s.word(w, start: t)
            t = Double(stream.count) / 25
            stream += s.quiet(40, start: t)
            t = Double(stream.count) / 25
            expected += 1
        }
        var segments: [[MotionFrame]] = []
        for f in stream {
            if let out = seg.process(f) { segments.append(out) }
        }
        XCTAssertTrue(seg.isCalibrated)
        XCTAssertEqual(segments.count, expected)
        for sgm in segments {
            XCTAssertGreaterThanOrEqual(sgm.count, 15)
            XCTAssertLessThan(sgm.count, 60)
        }
    }

    func testStillnessProducesNothing() {
        var s = Synth(seed: 31)
        var seg = MotionSegmenter()
        seg.beginCalibration()
        var n = 0
        for f in s.quiet(600) where seg.process(f) != nil { n += 1 }
        XCTAssertEqual(n, 0)
    }

    func testUncalibratedIsInert() {
        var s = Synth(seed: 32)
        var seg = MotionSegmenter()
        for f in s.word(0) { XCTAssertNil(seg.process(f)) }
        XCTAssertEqual(seg.state, .uncalibrated)
    }
}

final class DatasetTests: XCTestCase {
    func testSaveLoadAndBalancing() throws {
        var s = Synth(seed: 40)
        var d = Dataset(vocabulary: ["yes", "no"])
        d.takes.append(Take(label: "yes", condition: .mouthed, frames: s.word(0)))
        d.addWord("maybe")
        d.addWord("yes")
        XCTAssertEqual(d.vocabulary, ["yes", "no", "maybe"])
        XCTAssertEqual(d.leastRecorded(condition: .mouthed), "no")

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("d.json")
        try d.save(to: url)
        let loaded = try Dataset.load(from: url)
        XCTAssertEqual(loaded, d)

        d.removeWord("yes")
        XCTAssertTrue(d.takes.isEmpty)
    }

    func testCSV() {
        let row = SessionCSV.motionRow(MotionFrame(t: 10.5), origin: 10)
        XCTAssertEqual(row.split(separator: ",").count, SessionCSV.motionHeader.split(separator: ",").count)
        XCTAssertTrue(row.hasPrefix("0.500000,"))
        XCTAssertEqual(SessionCSV.escape("a,b"), "\"a,b\"")
    }
}
