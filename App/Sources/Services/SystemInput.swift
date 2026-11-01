import AppKit
import ApplicationServices

/// Types decoded words into whatever app is frontmost. Needs Accessibility permission.
enum TextInjector {
    static var isTrusted: Bool { AXIsProcessTrusted() }

    static func requestTrust() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }

    static func type(_ text: String) {
        guard isTrusted, !text.isEmpty else { return }
        let source = CGEventSource(stateID: .combinedSessionState)
        var units = Array(text.utf16)
        // CGEvent carries at most ~20 UTF-16 units per event.
        while !units.isEmpty {
            var chunk = Array(units.prefix(16))
            units.removeFirst(chunk.count)
            for down in [true, false] {
                guard let e = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down) else { continue }
                e.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: &chunk)
                e.post(tap: .cghidEventTap)
            }
        }
    }
}

/// Push-to-talk: Space while Hush is focused, Right Option from anywhere
/// (global monitoring needs Accessibility permission).
@MainActor
final class PushToTalk {
    var onPress: () -> Void = {}
    var onRelease: () -> Void = {}
    /// Whether Space should be captured right now (e.g. only on Train/Decode screens).
    var spaceEnabled: () -> Bool = { false }

    private var monitors: [Any] = []
    private var spaceDown = false
    private var optionDown = false

    private static let spaceKey: UInt16 = 49
    private static let rightOptionKey: UInt16 = 61

    func install() {
        guard monitors.isEmpty else { return }
        if let m = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp], handler: { [weak self] event in
            MainActor.assumeIsolated { () -> NSEvent? in
                guard let self else { return event }
                return self.handleKey(event)
            }
        }) { monitors.append(m) }

        if let m = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged, handler: { [weak self] event in
            MainActor.assumeIsolated { self?.handleFlags(event) }
            return event
        }) { monitors.append(m) }

        if let m = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged, handler: { [weak self] event in
            MainActor.assumeIsolated { self?.handleFlags(event) }
        }) { monitors.append(m) }
    }

    func uninstall() {
        monitors.forEach(NSEvent.removeMonitor)
        monitors.removeAll()
    }

    private func handleKey(_ event: NSEvent) -> NSEvent? {
        guard event.keyCode == Self.spaceKey, spaceEnabled(), !Self.isEditingText else { return event }
        if event.type == .keyDown {
            if !event.isARepeat && !spaceDown {
                spaceDown = true
                onPress()
            }
        } else if spaceDown {
            spaceDown = false
            onRelease()
        }
        return nil
    }

    private func handleFlags(_ event: NSEvent) {
        guard event.keyCode == Self.rightOptionKey else { return }
        let down = event.modifierFlags.contains(.option)
        guard down != optionDown else { return }
        optionDown = down
        down ? onPress() : onRelease()
    }

    private static var isEditingText: Bool {
        NSApp.keyWindow?.firstResponder is NSTextView
    }
}
