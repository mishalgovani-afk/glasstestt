import SwiftUI

@main
struct HushApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup("Hush") {
            ContentView()
                .environment(model)
                .frame(minWidth: 1000, minHeight: 680)
        }
        .commands {
            CommandMenu("Capture") {
                Button(model.motion.isRunning ? "Stop Motion" : "Start Motion") {
                    model.motion.isRunning ? model.motion.stop() : model.motion.start()
                }
                .keyboardShortcut("m", modifiers: [.command, .shift])
                Button(model.recorder.isRecording ? "Stop Session Recording" : "Record Session") {
                    model.toggleSession()
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
                Divider()
                Button("Delete Last Take") { model.deleteLastTake() }
                    .keyboardShortcut(.delete, modifiers: [.command])
                    .disabled(model.lastTake == nil)
            }
        }
    }
}

struct ContentView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        NavigationSplitView {
            List(Screen.allCases, selection: Binding<Screen?>(
                get: { model.screen },
                set: { if let s = $0 { model.screen = s } }
            )) { screen in
                Label(screen.title, systemImage: screen.symbol).tag(screen)
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 190)
            .safeAreaInset(edge: .bottom) {
                SidebarStatus().padding(10)
            }
        } detail: {
            Group {
                switch model.screen {
                case .sensors: SensorsView()
                case .train: TrainView()
                case .evaluate: EvaluateView()
                case .decode: DecodeView()
                }
            }
            .navigationTitle(model.screen.title)
            .toolbar {
                ToolbarItemGroup {
                    Picker("Condition", selection: $model.settings.condition) {
                        ForEach(SpeechConditionOption.all) { Text($0.title).tag($0.value) }
                    }
                    .pickerStyle(.menu)
                    .help("How you are producing words right now. Stored with every take and session.")

                    Button {
                        model.toggleSession()
                    } label: {
                        Label(model.recorder.isRecording ? "Stop Recording" : "Record Session",
                              systemImage: model.recorder.isRecording ? "stop.circle.fill" : "record.circle")
                    }
                    .tint(model.recorder.isRecording ? .red : nil)
                    .help("Record motion, mic audio and events to ~/Documents/Hush/Sessions")
                }
            }
        }
    }
}

struct SidebarStatus: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(model.motion.frameCount > 0 && model.motion.isRunning ? .green : .orange).frame(width: 8, height: 8)
                Text(model.motion.isRunning && model.motion.frameCount > 0
                     ? String(format: "AirPods · %.0f Hz", model.motion.sampleRate)
                     : "No motion")
                    .font(.caption)
            }
            if model.recorder.isRecording {
                HStack(spacing: 6) {
                    Circle().fill(.red).frame(width: 8, height: 8)
                    Text("Recording · \(model.recorder.frameCount) frames").font(.caption)
                }
            }
            Text("\(model.dataset.takes.count) takes · \(model.dataset.vocabulary.count) words")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
