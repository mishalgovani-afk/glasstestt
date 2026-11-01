import Foundation
import HushCore
import Observation

enum Screen: String, CaseIterable, Identifiable, Hashable {
    case sensors, train, evaluate, decode
    var id: String { rawValue }

    var title: String {
        switch self {
        case .sensors: return "Sensors"
        case .train: return "Train"
        case .evaluate: return "Evaluate"
        case .decode: return "Decode"
        }
    }

    var symbol: String {
        switch self {
        case .sensors: return "waveform.path.ecg"
        case .train: return "record.circle"
        case .evaluate: return "chart.bar.xaxis"
        case .decode: return "text.bubble"
        }
    }
}

struct DecodedWord: Identifiable, Equatable {
    let id = UUID()
    let time: Date
    let prediction: Prediction
    let frameCount: Int
    var text: String? { prediction.label }
}

struct AblationRow: Identifiable, Sendable {
    var id: Int { channels.rawValue }
    let channels: FeatureSet
    let accuracy: Double
    let pValue: Double
}

/// Persisted user settings.
struct HushSettings: Codable, Equatable {
    var features = FeatureConfig()
    var classifier = ClassifierConfig()
    var segmenter = SegmenterConfig()
    var condition: SpeechCondition = .mouthed
    var balancedPrompting = true
    var typeIntoFrontApp = false
    var autoDetect = false
    var permutations = 500

    static let key = "HushSettings.v1"

    static func load() -> HushSettings {
        guard let data = UserDefaults.standard.data(forKey: key),
              let s = try? JSONDecoder().decode(HushSettings.self, from: data) else { return HushSettings() }
        return s
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.key) }
    }
}

@MainActor
@Observable
final class AppModel {
    let motion = MotionService()
    let audio = AudioService()
    let recorder = SessionRecorder()
    private let pushToTalk = PushToTalk()

    var screen: Screen = .train
    var settings = HushSettings.load() {
        didSet {
            settings.save()
            segmenter.config = settings.segmenter
            if oldValue.features != settings.features || oldValue.classifier != settings.classifier {
                classifierDirty = true
            }
        }
    }

    // Dataset
    private(set) var dataset = Dataset()
    var selectedWord: String?
    var datasetError: String?
    private(set) var lastTake: Take?

    // Capture
    private(set) var isCapturing = false
    private(set) var captureFrames: [MotionFrame] = []
    @ObservationIgnored private var captureStartedAt: Double = 0

    // Decode
    private(set) var segmenter = MotionSegmenter()
    private(set) var decoded: [DecodedWord] = []
    private(set) var lastPrediction: Prediction?
    @ObservationIgnored private var classifier: TemplateClassifier?
    @ObservationIgnored private var classifierDirty = true

    // Evaluate
    /// Restricts both evaluation and decoding templates to one condition.
    var evaluationCondition: SpeechCondition? {
        didSet { classifierDirty = true }
    }
    private(set) var isEvaluating = false
    private(set) var report: EvaluationReport?
    private(set) var evaluationError: String?
    private(set) var ablation: [AblationRow] = []
    private(set) var evaluationProgress: String?

    // Session recording UI state
    var sessionPrompt = ""
    var accessibilityTrusted = TextInjector.isTrusted

    static var datasetURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Hush/dataset.json")
    }

    init() {
        segmenter.config = settings.segmenter
        loadDataset()
        motion.onFrame = { [weak self] f in self?.handle(f) }
        pushToTalk.onPress = { [weak self] in self?.beginCapture() }
        pushToTalk.onRelease = { [weak self] in self?.endCapture() }
        pushToTalk.spaceEnabled = { [weak self] in
            guard let self else { return false }
            return self.screen == .train || self.screen == .decode
        }
        pushToTalk.install()
        motion.start()
    }

    // MARK: Frame routing

    private func handle(_ f: MotionFrame) {
        recorder.append(f)
        if isCapturing {
            captureFrames.append(f)
            if captureFrames.count > 250 { endCapture() } // 10 s safety stop
        }
        if screen == .decode, settings.autoDetect, !isCapturing {
            if let segment = segmenter.process(f) {
                decode(segment, source: "auto")
            }
        }
    }

    // MARK: Capture

    func beginCapture() {
        guard !isCapturing, screen == .train || screen == .decode else { return }
        if screen == .train && selectedWord == nil { selectedWord = nextWord() }
        isCapturing = true
        captureFrames = []
        captureStartedAt = ProcessInfo.processInfo.systemUptime
    }

    func endCapture() {
        guard isCapturing else { return }
        isCapturing = false
        let frames = captureFrames
        captureFrames = []
        let end = ProcessInfo.processInfo.systemUptime
        guard frames.count >= 5 else { return }
        switch screen {
        case .train:
            guard let word = selectedWord else { return }
            let take = Take(label: word, condition: settings.condition, frames: frames)
            dataset.takes.append(take)
            lastTake = take
            recorder.event(start: captureStartedAt, end: end, kind: "take", label: word, detail: settings.condition.rawValue)
            saveDataset()
            if settings.balancedPrompting { selectedWord = nextWord(after: word) }
        case .decode:
            decode(frames, source: "push-to-talk")
        default:
            break
        }
    }

    func nextWord(after word: String? = nil) -> String? {
        dataset.leastRecorded(condition: settings.condition, excluding: dataset.vocabulary.count > 1 ? word : nil)
    }

    // MARK: Dataset

    func loadDataset() {
        let url = Self.datasetURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            dataset = Dataset()
            selectedWord = dataset.vocabulary.first
            return
        }
        do {
            dataset = try Dataset.load(from: url)
            selectedWord = nextWord()
        } catch {
            datasetError = "Could not read dataset: \(error.localizedDescription)"
        }
    }

    func saveDataset() {
        classifierDirty = true
        do { try dataset.save(to: Self.datasetURL) } catch {
            datasetError = "Could not save dataset: \(error.localizedDescription)"
        }
    }

    func addWord(_ w: String) {
        dataset.addWord(w)
        saveDataset()
    }

    func removeWord(_ w: String) {
        dataset.removeWord(w)
        if selectedWord == w { selectedWord = nextWord() }
        saveDataset()
    }

    func deleteTake(_ id: UUID) {
        dataset.takes.removeAll { $0.id == id }
        if lastTake?.id == id { lastTake = nil }
        saveDataset()
    }

    func deleteLastTake() {
        if let id = lastTake?.id { deleteTake(id) }
    }

    func resetDataset() {
        dataset = Dataset(vocabulary: dataset.vocabulary, takes: [])
        lastTake = nil
        saveDataset()
    }

    // MARK: Decode

    var templateCount: Int { trainingTakes.count }

    private var trainingTakes: [Take] {
        dataset.takes(condition: evaluationCondition).filter { dataset.vocabulary.contains($0.label) }
    }

    private func currentClassifier() -> TemplateClassifier {
        if classifierDirty || classifier == nil {
            let features = settings.features
            let examples = trainingTakes.map { (label: $0.label, sequence: FeatureExtractor.extract($0.frames, config: features)) }
            classifier = TemplateClassifier(examples: examples, config: settings.classifier)
            classifierDirty = false
        }
        return classifier!
    }

    func decode(_ frames: [MotionFrame], source: String) {
        let clf = currentClassifier()
        let prediction = clf.classify(FeatureExtractor.extract(frames, config: settings.features))
        lastPrediction = prediction
        let word = DecodedWord(time: Date(), prediction: prediction, frameCount: frames.count)
        decoded.append(word)
        if let first = frames.first, let last = frames.last {
            recorder.event(start: first.t, end: last.t, kind: "decode-\(source)",
                           label: prediction.label ?? "", detail: prediction.rejection?.rawValue ?? "")
        }
        if let text = prediction.label, settings.typeIntoFrontApp {
            TextInjector.type(text + " ")
        }
    }

    var transcript: String {
        decoded.compactMap(\.text).joined(separator: " ")
    }

    func clearTranscript() {
        decoded.removeAll()
        lastPrediction = nil
    }

    func calibrate() {
        segmenter.beginCalibration()
    }

    func refreshAccessibility(prompt: Bool) {
        if prompt { TextInjector.requestTrust() }
        accessibilityTrusted = TextInjector.isTrusted
    }

    // MARK: Evaluate

    func runEvaluation(ablate: Bool) {
        guard !isEvaluating else { return }
        let takes = trainingTakes
        let features = settings.features
        let classifierConfig = settings.classifier
        let permutations = settings.permutations
        isEvaluating = true
        evaluationError = nil
        evaluationProgress = "Computing DTW distances…"
        if ablate { ablation = [] }

        Task {
            let labels = takes.map(\.label)
            let frames = takes.map(\.frames)
            do {
                let r = try await Task.detached(priority: .userInitiated) {
                    let seqs = frames.map { FeatureExtractor.extract($0, config: features) }
                    return try Evaluator.evaluate(sequences: seqs, labels: labels, config: classifierConfig, permutations: permutations)
                }.value
                report = r
            } catch {
                report = nil
                evaluationError = error.localizedDescription
                isEvaluating = false
                evaluationProgress = nil
                return
            }

            if ablate {
                let combos = FeatureSet.allCombinations()
                for (i, combo) in combos.enumerated() {
                    evaluationProgress = "Ablation \(i + 1)/\(combos.count): \(combo.name)"
                    var cfg = features
                    cfg.channels = combo
                    let row = try? await Task.detached(priority: .userInitiated) { () throws -> AblationRow in
                        let seqs = frames.map { FeatureExtractor.extract($0, config: cfg) }
                        let r = try Evaluator.evaluate(sequences: seqs, labels: labels, config: classifierConfig,
                                                       permutations: min(permutations, 200))
                        return AblationRow(channels: combo, accuracy: r.accuracy, pValue: r.pValue)
                    }.value
                    if let row { ablation.append(row) }
                }
                ablation.sort { $0.accuracy > $1.accuracy }
            }
            isEvaluating = false
            evaluationProgress = nil
        }
    }

    // MARK: Session recording

    func toggleSession() {
        if recorder.isRecording {
            recorder.stop(audio: audio)
        } else {
            recorder.start(condition: settings.condition, prompt: sessionPrompt, audio: audio)
        }
    }
}
