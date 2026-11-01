import HushCore
import SwiftUI

struct DecodeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        HSplitView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    CapturePad(
                        isCapturing: model.isCapturing || model.segmenter.state == .active,
                        title: model.lastPrediction.map { $0.label ?? "—" } ?? "Ready",
                        subtitle: model.settings.autoDetect
                            ? "Auto-detect: just mouth words. Hold Space / Right ⌥ to force a capture."
                            : "Hold Space (or Right ⌥ from any app), mouth a word, release.",
                        frameCount: model.captureFrames.count
                    )

                    Card(title: "Transcript") {
                        Text(model.transcript.isEmpty ? "Decoded words appear here." : model.transcript)
                            .font(.title3)
                            .foregroundStyle(model.transcript.isEmpty ? .secondary : .primary)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        HStack {
                            Button("Clear") { model.clearTranscript() }
                            Button("Copy") {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(model.transcript, forType: .string)
                            }
                            .disabled(model.transcript.isEmpty)
                            Spacer()
                            Text("\(model.templateCount) templates").font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    if model.audio.isRunning {
                        Card(title: "Mic transcript (reference)") {
                            Text(model.audio.transcript.isEmpty ? "…" : model.audio.transcript)
                                .textSelection(.enabled)
                            Button("Clear") { model.audio.clearTranscript() }
                        }
                    }

                    if let p = model.lastPrediction {
                        Card(title: "Last match") {
                            if let r = p.rejection {
                                Text("Rejected: \(r.rawValue)").foregroundStyle(.orange)
                            }
                            Text(String(format: "Margin %.0f%%", p.margin * 100)).font(.caption)
                            ForEach(Array(p.ranked.prefix(6).enumerated()), id: \.offset) { i, c in
                                HStack {
                                    Text(c.label).frame(width: 100, alignment: .leading)
                                        .fontWeight(i == 0 ? .semibold : .regular)
                                    LevelMeter(value: max(0, model.settings.classifier.maxDistance * 1.5 - c.distance),
                                               maximum: model.settings.classifier.maxDistance * 1.5,
                                               tint: i == 0 && p.label != nil ? .green : .secondary)
                                    Text(String(format: "%.2f", c.distance)).font(.caption.monospacedDigit()).frame(width: 50)
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .frame(minWidth: 460)

            settingsPanel
                .frame(minWidth: 280, idealWidth: 320, maxWidth: 380)
        }
    }

    private var settingsPanel: some View {
        @Bindable var model = model
        return Form {
            Section("Segmentation") {
                Toggle("Auto-detect words", isOn: $model.settings.autoDetect)
                if model.settings.autoDetect {
                    HStack {
                        Button(model.segmenter.isCalibrated ? "Recalibrate" : "Calibrate (stay still 3 s)") {
                            model.calibrate()
                        }
                        Spacer()
                        Text(stateText).font(.caption).foregroundStyle(.secondary)
                    }
                    LevelMeter(value: model.segmenter.level, maximum: model.settings.segmenter.sensitivity * 2.5,
                               threshold: model.settings.segmenter.sensitivity,
                               tint: model.segmenter.state == .active ? .red : .accentColor)
                    LabeledContent(String(format: "Trigger at %.1f σ", model.settings.segmenter.sensitivity)) {
                        Slider(value: $model.settings.segmenter.sensitivity, in: 2...15)
                    }
                    Stepper("End after \(model.settings.segmenter.hangoverFrames) quiet frames",
                            value: $model.settings.segmenter.hangoverFrames, in: 3...25)
                }
            }
            Section("Acceptance") {
                LabeledContent(String(format: "Max distance %.2f", model.settings.classifier.maxDistance)) {
                    Slider(value: $model.settings.classifier.maxDistance, in: 0.2...8)
                }
                LabeledContent(String(format: "Min margin %.0f%%", model.settings.classifier.minMargin * 100)) {
                    Slider(value: $model.settings.classifier.minMargin, in: 0...0.5)
                }
                Text("Templates use the channel and condition choices from Evaluate.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Output") {
                Toggle("Type into frontmost app", isOn: Binding(
                    get: { model.settings.typeIntoFrontApp },
                    set: { on in
                        model.settings.typeIntoFrontApp = on
                        if on { model.refreshAccessibility(prompt: true) }
                    }
                ))
                if model.settings.typeIntoFrontApp && !model.accessibilityTrusted {
                    Text("Grant Accessibility to Hush in System Settings › Privacy & Security, then click Recheck. Right ⌥ push-to-talk from other apps needs this too.")
                        .font(.caption).foregroundStyle(.orange)
                    Button("Recheck") { model.refreshAccessibility(prompt: false) }
                }
            }
        }
        .formStyle(.grouped)
    }

    private var stateText: String {
        switch model.segmenter.state {
        case .uncalibrated: return "Not calibrated"
        case .calibrating(let p): return "Calibrating \(Int(p * 100))%"
        case .idle: return "Listening"
        case .active: return "Word in progress"
        }
    }
}
