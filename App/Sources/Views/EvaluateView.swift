import HushCore
import SwiftUI

struct EvaluateView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Card(title: "Setup") {
                    HStack(spacing: 18) {
                        ForEach(FeatureSet.groups, id: \.0.rawValue) { entry in
                            let group = entry.0
                            Toggle(entry.1, isOn: Binding(
                                get: { model.settings.features.channels.contains(group) },
                                set: { on in
                                    if on { model.settings.features.channels.insert(group) }
                                    else { model.settings.features.channels.remove(group) }
                                }
                            ))
                        }
                        Toggle("+ deltas", isOn: $model.settings.features.includeDeltas)
                    }
                    HStack(spacing: 18) {
                        Picker("Takes", selection: $model.evaluationCondition) {
                            Text("All conditions").tag(SpeechCondition?.none)
                            ForEach(SpeechCondition.allCases) { Text($0.title).tag(SpeechCondition?.some($0)) }
                        }
                        .frame(maxWidth: 260)
                        Stepper("k = \(model.settings.classifier.k)", value: $model.settings.classifier.k, in: 1...5)
                        Stepper("Smoothing \(model.settings.features.smoothing)", value: $model.settings.features.smoothing, in: 1...9, step: 2)
                    }
                    HStack(spacing: 18) {
                        LabeledContent("DTW band \(percent(model.settings.classifier.band))") {
                            Slider(value: $model.settings.classifier.band, in: 0.05...0.5).frame(width: 160)
                        }
                        Picker("Permutations", selection: $model.settings.permutations) {
                            ForEach([100, 500, 1000, 2000], id: \.self) { Text("\($0)").tag($0) }
                        }
                        .frame(maxWidth: 200)
                    }
                    HStack {
                        Button("Evaluate") { model.runEvaluation(ablate: false) }
                            .keyboardShortcut(.return, modifiers: .command)
                        Button("Evaluate + channel ablation") { model.runEvaluation(ablate: true) }
                        if model.isEvaluating {
                            ProgressView().controlSize(.small)
                            Text(model.evaluationProgress ?? "").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(model.isEvaluating || model.settings.features.channels.isEmpty)
                    Text("Leave-one-out nearest-template accuracy, compared against the same procedure on shuffled labels. p < 0.05 means the motion stream separates your words better than chance.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                if let e = model.evaluationError {
                    Text(e).foregroundStyle(.red)
                }

                if let r = model.report {
                    Card(title: "Result") {
                        HStack(spacing: 28) {
                            stat("Accuracy", percent(r.accuracy), r.isSignificant ? .green : .orange)
                            stat("Chance", percent(r.chance), .secondary)
                            stat("Shuffled mean", percent(r.nullMean), .secondary)
                            stat("p-value", String(format: "%.4f", r.pValue), r.isSignificant ? .green : .orange)
                            stat("Takes", "\(r.sampleCount)", .secondary)
                        }
                        Text(r.verdict).font(.callout)
                        NullHistogram(nulls: r.nullAccuracies, observed: r.accuracy)
                            .frame(height: 90)
                    }
                    Card(title: "Confusion matrix (rows = said, columns = decoded)") {
                        ConfusionGrid(report: r)
                    }
                }

                if !model.ablation.isEmpty {
                    Card(title: "Channel ablation (which sensors carry the signal?)") {
                        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 6) {
                            GridRow {
                                Text("Channels").bold()
                                Text("Accuracy").bold()
                                Text("p").bold()
                            }
                            ForEach(model.ablation) { row in
                                GridRow {
                                    Text(row.channels.name)
                                    HStack {
                                        LevelMeter(value: row.accuracy, tint: row.pValue < 0.05 ? .green : .orange)
                                            .frame(width: 140)
                                        Text(percent(row.accuracy)).monospacedDigit()
                                    }
                                    Text(String(format: "%.3f", row.pValue)).monospacedDigit()
                                }
                            }
                        }
                    }
                }
            }
            .padding(20)
        }
    }

    private func stat(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title2.monospacedDigit().weight(.semibold)).foregroundStyle(color)
        }
    }
}

struct NullHistogram: View {
    let nulls: [Double]
    let observed: Double

    var body: some View {
        Canvas { ctx, size in
            let bins = 20
            var counts = [Int](repeating: 0, count: bins)
            for v in nulls { counts[min(bins - 1, max(0, Int(v * Double(bins))))] += 1 }
            let peak = CGFloat(max(counts.max() ?? 1, 1))
            let bw = size.width / CGFloat(bins)
            for (i, c) in counts.enumerated() {
                let h = CGFloat(c) / peak * (size.height - 14)
                let r = CGRect(x: CGFloat(i) * bw + 1, y: size.height - 12 - h, width: bw - 2, height: h)
                ctx.fill(Path(r), with: .color(.secondary.opacity(0.5)))
            }
            let x = CGFloat(observed) * size.width
            ctx.fill(Path(CGRect(x: x - 1, y: 0, width: 2, height: size.height - 12)), with: .color(.green))
            ctx.draw(Text("0%").font(.caption2), at: CGPoint(x: 8, y: size.height - 5))
            ctx.draw(Text("100%").font(.caption2), at: CGPoint(x: size.width - 14, y: size.height - 5))
            ctx.draw(Text("you").font(.caption2).foregroundColor(.green), at: CGPoint(x: min(max(x, 12), size.width - 12), y: 6))
        }
    }
}

struct ConfusionGrid: View {
    let report: EvaluationReport

    var body: some View {
        let peak = max(report.confusion.flatMap { $0 }.max() ?? 1, 1)
        Grid(horizontalSpacing: 2, verticalSpacing: 2) {
            GridRow {
                Text("")
                ForEach(report.labels, id: \.self) { Text($0).font(.caption).lineLimit(1).frame(width: 56) }
                Text("recall").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Array(report.labels.enumerated()), id: \.offset) { i, label in
                GridRow {
                    Text(label).font(.caption).lineLimit(1).frame(width: 80, alignment: .trailing)
                    ForEach(0..<report.labels.count, id: \.self) { j in
                        let n = report.confusion[i][j]
                        Text(n == 0 ? "" : "\(n)")
                            .font(.caption.monospacedDigit())
                            .frame(width: 56, height: 26)
                            .background((i == j ? Color.green : Color.red).opacity(Double(n) / Double(peak) * 0.7))
                            .background(Color.secondary.opacity(0.08))
                    }
                    Text(percent(report.recall(of: label))).font(.caption.monospacedDigit())
                }
            }
        }
    }
}
