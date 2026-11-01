import HushCore
import SwiftUI

struct TrainView: View {
    @Environment(AppModel.self) private var model
    @State private var newWord = ""

    var body: some View {
        @Bindable var model = model
        HSplitView {
            vocabulary
                .frame(minWidth: 220, idealWidth: 250, maxWidth: 320)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    CapturePad(
                        isCapturing: model.isCapturing,
                        title: model.selectedWord.map { isNoiseLabel($0) ? "(noise: nod, turn, chew…)" : "“\($0)”" } ?? "Pick a word",
                        subtitle: "Hold Space (or Right ⌥ from any app), \(verb) the word, release.",
                        frameCount: model.captureFrames.count
                    )

                    HStack {
                        Toggle("Balanced prompting (auto-advance to least-recorded word)", isOn: $model.settings.balancedPrompting)
                        Spacer()
                        Button("Delete last take", role: .destructive) { model.deleteLastTake() }
                            .disabled(model.lastTake == nil)
                    }

                    if let take = model.lastTake {
                        Card(title: "Last take: “\(take.label)” · \(take.frames.count) frames · \(String(format: "%.2f s", take.duration))") {
                            SignalPlot(title: "Acceleration", unit: "g", values: take.frames.accelerations)
                            SignalPlot(title: "Rotation rate", unit: "rad/s", values: take.frames.rotations)
                            SignalPlot(title: "Attitude change", unit: "rad", values: take.frames.relativeAttitudes)
                        }
                    }

                    Card(title: "How to train") {
                        Text("""
                        1. Pick the condition in the toolbar (start with Silent mouthing, or Whisper for an easier baseline).
                        2. Record 8–15 takes per word. Keep your head still apart from the word itself.
                        3. Record takes of “_noise” too: nods, head turns, swallowing, chewing. Decoding rejects anything closest to a “_” word.
                        4. Go to Evaluate to check whether the signal is real before trusting Decode.
                        """)
                        .font(.callout)
                    }

                    if let e = model.datasetError { Text(e).foregroundStyle(.red) }
                }
                .padding(20)
            }
        }
    }

    private var verb: String {
        switch model.settings.condition {
        case .normal: return "say"
        case .whisper: return "whisper"
        case .mouthed: return "silently mouth"
        case .imagined: return "imagine saying"
        }
    }

    private var vocabulary: some View {
        VStack(alignment: .leading, spacing: 0) {
            List(selection: Binding(get: { model.selectedWord }, set: { model.selectedWord = $0 })) {
                Section("Vocabulary · \(model.settings.condition.title)") {
                    ForEach(model.dataset.vocabulary, id: \.self) { word in
                        HStack {
                            Text(word).foregroundStyle(isNoiseLabel(word) ? .secondary : .primary)
                            Spacer()
                            Text("\(model.dataset.count(of: word, condition: model.settings.condition))")
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                        .tag(Optional(word))
                        .contextMenu {
                            Button("Delete “\(word)” and its takes", role: .destructive) { model.removeWord(word) }
                        }
                    }
                }
                Section("Recent takes") {
                    ForEach(model.dataset.takes.suffix(25).reversed()) { take in
                        HStack {
                            Text(take.label)
                            Spacer()
                            Text(take.condition.rawValue).font(.caption).foregroundStyle(.secondary)
                            Text(String(format: "%.2fs", take.duration)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
                        .contextMenu {
                            Button("Delete take", role: .destructive) { model.deleteTake(take.id) }
                        }
                    }
                }
            }
            HStack {
                TextField("Add word", text: $newWord)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(add)
                Button("Add", action: add).disabled(newWord.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(10)
        }
    }

    private func add() {
        model.addWord(newWord)
        model.selectedWord = newWord.trimmingCharacters(in: .whitespacesAndNewlines)
        newWord = ""
        // Return focus to the window so Space works for capture again.
        NSApp.keyWindow?.makeFirstResponder(nil)
    }
}
