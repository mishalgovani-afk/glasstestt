"""Windows text injection (SendInput, Unicode) and a global push-to-talk key."""

from __future__ import annotations

import ctypes
import sys
from typing import Callable, Optional

IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    from ctypes import wintypes

    INPUT_KEYBOARD = 1
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_UNICODE = 0x0004
    ULONG_PTR = ctypes.c_size_t

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                    ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class HARDWAREINPUT(ctypes.Structure):
        _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]

    class _INPUTUNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]

    class INPUT(ctypes.Structure):
        _anonymous_ = ("u",)
        _fields_ = [("type", wintypes.DWORD), ("u", _INPUTUNION)]

    _SendInput = ctypes.windll.user32.SendInput
    _SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
    _SendInput.restype = wintypes.UINT


def utf16_units(text: str) -> list[int]:
    data = text.encode("utf-16-le")
    return [int.from_bytes(data[i:i + 2], "little") for i in range(0, len(data), 2)]


def type_text(text: str) -> bool:
    """Type text into the focused window of any app. Returns False where unsupported."""
    if not IS_WINDOWS or not text:
        return False
    units = utf16_units(text)
    events = (INPUT * (len(units) * 2))()
    for k, u in enumerate(units):
        for j, flags in enumerate((KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)):
            e = events[2 * k + j]
            e.type = INPUT_KEYBOARD
            e.ki = KEYBDINPUT(0, u, flags, 0, 0)
    sent = _SendInput(len(events), events, ctypes.sizeof(INPUT))
    return sent == len(events)


class GlobalPushToTalk:
    """Hold Right Ctrl anywhere in Windows to capture. Callbacks run on a background thread."""

    KEY_NAME = "Right Ctrl"

    def __init__(self, on_press: Callable[[], None], on_release: Callable[[], None]):
        self.on_press = on_press
        self.on_release = on_release
        self._down = False
        self._listener = None
        self.error: Optional[str] = None

    def start(self) -> bool:
        try:
            from pynput import keyboard
        except Exception as e:  # no display server, missing dependency
            self.error = f"Global hotkey unavailable: {e}"
            return False

        target = keyboard.Key.ctrl_r

        def press(key):
            if key == target and not self._down:
                self._down = True
                self.on_press()

        def release(key):
            if key == target and self._down:
                self._down = False
                self.on_release()

        try:
            self._listener = keyboard.Listener(on_press=press, on_release=release)
            self._listener.daemon = True
            self._listener.start()
            return True
        except Exception as e:
            self.error = f"Global hotkey unavailable: {e}"
            return False

    def stop(self) -> None:
        if self._listener:
            self._listener.stop()
            self._listener = None
