import CoreAudio
import HushCore
import SwiftUI

struct SensorsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        @Bindable var audio = model.audio
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Card(title: "Headphone motion") {
                    HStack(alignment: .top, spacing: 24) {
                        LabeledContent("Status", value: model.motion.statusText)
                        LabeledContent("Permission", value: model.motion.authorization)
                        LabeledContent("Rate", value: String(format: "%.1f Hz", model.motion.sampleRate))
                        LabeledContent("Frames", value: "\(model.motion.frameCount)")
                        Spacer()
                        Button(model.motion.isRunning ? "Stop" : "Start") {
                            model.motion.isRunning ? model.motion.stop() : model.motion.start()
                        }
                    }
                    .font(.callout)
                    let frames = model.motion.recent
                    SignalPlot(title: "User acceleration", unit: "g", values: frames.accelerations)
                    SignalPlot(title: "Rotation rate", unit: "rad/s", values: frames.rotations)
                    SignalPlot(title: "Attitude change (window start)", unit: "rad", values: frames.relativeAttitudes)
                }

                Card(title: "Microphone (reference)") {
                    HStack {
                        Picker("Input", selection: $audio.selectedDevice) {
                            Text("System default").tag(AudioDeviceID?.none)
                            ForEach(audio.devices) { d in Text(d.name).tag(AudioDeviceID?.some(d.id)) }
                        }
                        .frame(maxWidth: 320)
                        .disabled(audio.isRunning)
                        Button { audio.refreshDevices() } label: { Image(systemName: "arrow.clockwise") }
                            .disabled(audio.isRunning)
                        Toggle("Transcribe on-device", isOn: $audio.transcribe).disabled(audio.isRunning)
                        Spacer()
                        Button(audio.isRunning ? "Stop Mic" : "Start Mic") {
                            if audio.isRunning { audio.stop() } else { Task { await audio.start() } }
                        }
                    }
                    LevelMeter(value: audio.level, tint: .green)
                    Text(audio.status).font(.caption).foregroundStyle(.secondary)
                    if !audio.transcript.isEmpty {
                        Text(audio.transcript).textSelection(.enabled)
                    }
                    Text("Choosing AirPods as the input switches them to the Bluetooth headset profile (lower audio quality). Use the Mac's mic to keep AirPods in high-quality mode.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Card(title: "Experiment session") {
                    HStack {
                        TextField("Prompt / script, e.g. “yes no hello stop next ×10”", text: $model.sessionPrompt)
                        Button(model.recorder.isRecording ? "Stop" : "Record") { model.toggleSession() }
                            .tint(model.recorder.isRecording ? .red : nil)
                    }
                    if model.recorder.isRecording, let dir = model.recorder.directory {
                        Text("Recording \(model.settings.condition.title) → \(dir.path) · \(model.recorder.frameCount) frames · \(model.recorder.eventCount) events")
                            .font(.caption).textSelection(.enabled)
                    } else if let dir = model.recorder.directory {
                        HStack {
                            Text("Last session: \(dir.lastPathComponent)").font(.caption)
                            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([dir]) }
                                .buttonStyle(.link).font(.caption)
                        }
                    }
                    if let e = model.recorder.lastError { Text(e).font(.caption).foregroundStyle(.red) }
                    Text("Writes motion.csv, events.csv (every take or decode), audio.caf (if the mic is on) and meta.json. Suggested protocol: the same short script under Normal, Whisper and Silent mouthing, 10 reps each.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(20)
        }
    }
}
