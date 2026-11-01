"""HushCam: silent-speech input from your webcam (lip reading for a personal vocabulary).

Train -> Evaluate -> Decode, mirroring the macOS AirPods app, with lip landmarks as the sensor.
"""

from __future__ import annotations

import argparse
import collections
import json
import math
import queue
import sys
import threading
import time
import tkinter as tk
import traceback
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Optional

import numpy as np

from . import core, sysinput
from .core import CONDITIONS, GROUP_TITLES, GROUPS, LipFrame
from .lips import app_data_dir

APP_NAME = "HushCam"
CONDITION_KEYS = list(CONDITIONS)


@dataclass
class Settings:
    condition: str = "mouthed"
    groups: list = field(default_factory=lambda: list(core.DEFAULT_GROUPS))
    deltas: bool = False
    smoothing: int = 3
    band: float = 0.2
    k: int = 1
    max_distance: float = 1.0
    min_margin: float = 0.08
    sensitivity: float = 4.0
    permutations: int = 500
    eval_condition: str = "all"
    balanced: bool = True
    type_into_apps: bool = False
    auto_detect: bool = False
    camera_index: int = 0
    mirror: bool = True

    @property
    def features(self) -> core.FeatureConfig:
        return core.FeatureConfig(groups=tuple(g for g in GROUPS if g in self.groups),
                                  smoothing=self.smoothing, deltas=self.deltas)

    @property
    def classifier(self) -> core.ClassifierConfig:
        return core.ClassifierConfig(band=self.band, k=self.k, max_distance=self.max_distance,
                                     min_margin=self.min_margin)

    @staticmethod
    def load(path: Path) -> "Settings":
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            known = {f.name for f in fields(Settings)}
            return Settings(**{k: v for k, v in data.items() if k in known})
        except Exception:
            return Settings()

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")


class LevelMeter(tk.Canvas):
    def __init__(self, master, width=220, height=12, **kw):
        super().__init__(master, width=width, height=height, highlightthickness=0, bg="#e6e6e6", **kw)
        self._mw, self._mh = width, height

    def set(self, value: float, maximum: float, threshold: Optional[float] = None, color: str = "#3b82f6"):
        self.delete("all")
        frac = max(0.0, min(1.0, value / maximum)) if maximum > 0 else 0
        self.create_rectangle(0, 0, frac * self._mw, self._mh, fill=color, width=0)
        if threshold is not None and maximum > 0:
            x = max(0.0, min(1.0, threshold / maximum)) * self._mw
            self.create_line(x, 0, x, self._mh, fill="#111", width=2)


class HushCamApp:
    PREVIEW_W, PREVIEW_H = 480, 360

    def __init__(self, root: tk.Tk, use_camera: bool = True):
        self.root = root
        self.data_dir = app_data_dir()
        self.settings_path = self.data_dir / "settings.json"
        self.dataset_path = self.data_dir / "dataset.json"
        self.settings = Settings.load(self.settings_path)
        self.dataset = self._load_dataset()

        self.events: "queue.Queue[tuple]" = queue.Queue()
        self.frames: "collections.deque[LipFrame | None]" = collections.deque(maxlen=300)
        self._preview = None
        self._photo = None
        self.worker = None

        self.capturing = False
        self.capture: list[LipFrame] = []
        self.capture_missed = 0
        self.last_take: Optional[core.Take] = None
        self.segmenter = core.Segmenter(core.SegmenterConfig(sensitivity=self.settings.sensitivity))
        self._classifier: Optional[core.TemplateClassifier] = None
        self.decoded: list[str] = []
        self.evaluating = False
        self.face_seen = 0.0
        self.space_down = False

        self.selected_word = self.dataset.least_recorded(self.settings.condition)

        root.title(f"{APP_NAME}: silent speech from your webcam")
        root.geometry("1180x720")
        root.minsize(1000, 640)
        self._build_ui()
        self._refresh_all()

        # Space is push-to-talk everywhere except text fields. A leading bind tag runs before the
        # widget's own class bindings, so Space never "clicks" a focused button or checkbox.
        root.bind_class("PTT", "<KeyPress-space>", self._on_space_down)
        root.bind_class("PTT", "<KeyRelease-space>", self._on_space_up)
        self._install_ptt_tags(root)
        root.protocol("WM_DELETE_WINDOW", self.close)

        self.ptt = sysinput.GlobalPushToTalk(lambda: self.events.put(("ptt", True)),
                                             lambda: self.events.put(("ptt", False)))
        if not self.ptt.start():
            self.status_var.set(self.ptt.error or "")

        if use_camera:
            self.start_camera()
        root.after(15, self._poll)

    # ------------------------------------------------------------------ persistence

    def _load_dataset(self) -> core.Dataset:
        if self.dataset_path.exists():
            try:
                return core.Dataset.load(self.dataset_path)
            except Exception as e:
                messagebox.showwarning(APP_NAME, f"Could not read dataset, starting fresh:\n{e}")
        return core.Dataset()

    def save_dataset(self) -> None:
        self._classifier = None
        try:
            self.dataset.save(self.dataset_path)
        except Exception as e:
            self.status_var.set(f"Could not save dataset: {e}")

    def save_settings(self) -> None:
        self._classifier = None
        self.segmenter.config.sensitivity = self.settings.sensitivity
        try:
            self.settings.save(self.settings_path)
        except Exception:
            pass

    # ------------------------------------------------------------------ UI

    def _build_ui(self) -> None:
        style = ttk.Style(self.root)
        if "vista" in style.theme_names():
            style.theme_use("vista")
        style.configure("Big.TLabel", font=("Segoe UI", 30, "bold"))
        style.configure("Hint.TLabel", foreground="#555")
        style.configure("Rec.TLabel", foreground="#c00", font=("Segoe UI", 11, "bold"))

        top = ttk.Frame(self.root, padding=(10, 8))
        top.pack(fill="x")
        ttk.Label(top, text="Condition:").pack(side="left")
        self.condition_var = tk.StringVar(value=CONDITIONS[self.settings.condition])
        cb = ttk.Combobox(top, textvariable=self.condition_var, values=list(CONDITIONS.values()),
                          state="readonly", width=18)
        cb.pack(side="left", padx=6)
        cb.bind("<<ComboboxSelected>>", self._on_condition)
        ttk.Label(top, text="Hold Space (in HushCam) or Right Ctrl (anywhere) to capture a word.",
                  style="Hint.TLabel").pack(side="left", padx=16)
        self.status_var = tk.StringVar()
        ttk.Label(top, textvariable=self.status_var, style="Hint.TLabel").pack(side="right")

        body = ttk.Frame(self.root, padding=(10, 0, 10, 10))
        body.pack(fill="both", expand=True)

        left = ttk.Frame(body)
        left.pack(side="left", fill="y")
        self.preview = tk.Label(left, bg="#111", width=self.PREVIEW_W, height=self.PREVIEW_H)
        self.preview.pack()
        info = ttk.Frame(left, padding=(0, 6))
        info.pack(fill="x")
        self.face_var = tk.StringVar(value="Starting camera…")
        ttk.Label(info, textvariable=self.face_var).pack(side="left")
        self.rec_var = tk.StringVar()
        ttk.Label(info, textvariable=self.rec_var, style="Rec.TLabel").pack(side="right")
        cam = ttk.Frame(left)
        cam.pack(fill="x")
        ttk.Label(cam, text="Camera").pack(side="left")
        self.camera_var = tk.IntVar(value=self.settings.camera_index)
        ttk.Spinbox(cam, from_=0, to=9, width=4, textvariable=self.camera_var).pack(side="left", padx=4)
        ttk.Button(cam, text="Switch", command=self._switch_camera).pack(side="left")
        self.mirror_var = tk.BooleanVar(value=self.settings.mirror)
        ttk.Checkbutton(cam, text="Mirror", variable=self.mirror_var, command=self._toggle_mirror).pack(side="left", padx=8)
        ttk.Label(left, wraplength=self.PREVIEW_W, style="Hint.TLabel", justify="left", text=(
            "Tips: face the camera with even light on your mouth. Keep your head still and articulate "
            "clearly but silently. Green = outer lip, orange = inner lip tracking.")).pack(fill="x", pady=(8, 0))

        self.tabs = ttk.Notebook(body)
        self.tabs.pack(side="left", fill="both", expand=True, padx=(10, 0))
        self.train_tab = ttk.Frame(self.tabs, padding=10)
        self.eval_tab = ttk.Frame(self.tabs, padding=10)
        self.decode_tab = ttk.Frame(self.tabs, padding=10)
        self.tabs.add(self.train_tab, text="  Train  ")
        self.tabs.add(self.eval_tab, text="  Evaluate  ")
        self.tabs.add(self.decode_tab, text="  Decode  ")
        self._build_train()
        self._build_eval()
        self._build_decode()

    def _build_train(self) -> None:
        t = self.train_tab
        left = ttk.Frame(t)
        left.pack(side="left", fill="y")
        ttk.Label(left, text="Vocabulary (takes in this condition)").pack(anchor="w")
        self.vocab_list = tk.Listbox(left, height=14, width=24, exportselection=False, font=("Consolas", 11))
        self.vocab_list.pack(fill="y", expand=True)
        self.vocab_list.bind("<<ListboxSelect>>", self._on_vocab_select)
        add = ttk.Frame(left)
        add.pack(fill="x", pady=4)
        self.new_word = tk.StringVar()
        entry = ttk.Entry(add, textvariable=self.new_word, width=18)
        entry.pack(side="left")
        entry.bind("<Return>", lambda e: self._add_word())
        ttk.Button(add, text="Add", command=self._add_word).pack(side="left", padx=4)
        ttk.Button(left, text="Remove word and its takes", command=self._remove_word).pack(fill="x")

        right = ttk.Frame(t, padding=(16, 0))
        right.pack(side="left", fill="both", expand=True)
        self.pad = tk.Frame(right, bg="#f2f2f2", highlightthickness=2, highlightbackground="#ccc")
        self.pad.pack(fill="x")
        self.word_var = tk.StringVar()
        tk.Label(self.pad, textvariable=self.word_var, font=("Segoe UI", 34, "bold"), bg="#f2f2f2").pack(pady=(24, 4))
        self.pad_hint = tk.StringVar()
        hint = tk.Label(self.pad, textvariable=self.pad_hint, bg="#f2f2f2", fg="#555", justify="center")
        hint.pack(pady=(0, 22), padx=10)
        self._wrap(hint, self.pad, 30)

        opts = ttk.Frame(right, padding=(0, 8))
        opts.pack(fill="x")
        self.balanced_var = tk.BooleanVar(value=self.settings.balanced)
        ttk.Checkbutton(opts, text="Auto-advance to least-recorded word",
                        variable=self.balanced_var, command=self._toggle_balanced).pack(anchor="w")
        ttk.Button(opts, text="Delete last take", command=self._delete_last_take).pack(anchor="w", pady=(6, 0))
        self.take_info = tk.StringVar(value="No takes yet in this session.")
        info = ttk.Label(right, textvariable=self.take_info)
        info.pack(anchor="w", fill="x")
        self._wrap(info, right, 40)
        howto = ttk.Label(right, style="Hint.TLabel", justify="left", text=(
            "How to train:\n"
            "1. Pick a condition (start with Silent mouthing; Whisper is an easier baseline).\n"
            "2. Record 8-15 takes per word. Start and end each take with your mouth relaxed and closed.\n"
            "3. Record '_noise' takes too: smiles, yawns, swallowing, talking to someone. Decoding rejects "
            "anything closest to a word starting with '_'.\n"
            "4. Check Evaluate before trusting Decode."))
        howto.pack(anchor="w", fill="x", pady=10)
        self._wrap(howto, right, 40)

    @staticmethod
    def _wrap(label, container, margin: int) -> None:
        """Keep a label's text wrapped to its container's current width."""
        container.bind("<Configure>", lambda e: label.configure(wraplength=max(120, e.width - margin)), add="+")

    def _build_eval(self) -> None:
        t = self.eval_tab
        row = ttk.Frame(t)
        row.pack(fill="x")
        ttk.Label(row, text="Features:").pack(side="left")
        self.group_vars = {}
        for g in GROUPS:
            v = tk.BooleanVar(value=g in self.settings.groups)
            self.group_vars[g] = v
            ttk.Checkbutton(row, text=GROUP_TITLES[g], variable=v, command=self._on_eval_settings).pack(side="left", padx=6)
        self.deltas_var = tk.BooleanVar(value=self.settings.deltas)
        ttk.Checkbutton(row, text="+ deltas", variable=self.deltas_var, command=self._on_eval_settings).pack(side="left", padx=6)

        row2 = ttk.Frame(t, padding=(0, 6))
        row2.pack(fill="x")
        ttk.Label(row2, text="Takes:").pack(side="left")
        self.eval_cond_var = tk.StringVar(value="All conditions" if self.settings.eval_condition == "all"
                                          else CONDITIONS.get(self.settings.eval_condition, "All conditions"))
        ec = ttk.Combobox(row2, textvariable=self.eval_cond_var, state="readonly", width=16,
                          values=["All conditions"] + list(CONDITIONS.values()))
        ec.pack(side="left", padx=4)
        ec.bind("<<ComboboxSelected>>", lambda e: self._on_eval_settings())
        ttk.Label(row2, text="k").pack(side="left", padx=(12, 2))
        self.k_var = tk.IntVar(value=self.settings.k)
        ttk.Spinbox(row2, from_=1, to=5, width=3, textvariable=self.k_var, command=self._on_eval_settings).pack(side="left")
        ttk.Label(row2, text="Smoothing").pack(side="left", padx=(12, 2))
        self.smooth_var = tk.IntVar(value=self.settings.smoothing)
        ttk.Spinbox(row2, values=(1, 3, 5, 7), width=3, textvariable=self.smooth_var, command=self._on_eval_settings).pack(side="left")
        row2b = ttk.Frame(t, padding=(0, 0, 0, 6))
        row2b.pack(fill="x")
        ttk.Label(row2b, text="DTW band").pack(side="left", padx=(0, 2))
        self.band_var = tk.DoubleVar(value=self.settings.band)
        ttk.Scale(row2b, from_=0.05, to=0.5, variable=self.band_var, length=140,
                  command=lambda v: self._on_eval_settings()).pack(side="left")
        ttk.Label(row2b, text="Permutations").pack(side="left", padx=(12, 2))
        self.perm_var = tk.StringVar(value=str(self.settings.permutations))
        pc = ttk.Combobox(row2b, textvariable=self.perm_var, values=["100", "500", "1000", "2000"], width=6, state="readonly")
        pc.pack(side="left")
        pc.bind("<<ComboboxSelected>>", lambda e: self._on_eval_settings())

        row3 = ttk.Frame(t, padding=(0, 6))
        row3.pack(fill="x")
        self.eval_btn = ttk.Button(row3, text="Evaluate", command=lambda: self.run_evaluation(False))
        self.eval_btn.pack(side="left")
        self.ablate_btn = ttk.Button(row3, text="Evaluate + feature ablation", command=lambda: self.run_evaluation(True))
        self.ablate_btn.pack(side="left", padx=6)
        self.eval_progress = ttk.Progressbar(row3, length=200, mode="determinate", maximum=1.0)
        self.eval_progress.pack(side="left", padx=10)
        self.eval_status = tk.StringVar()
        ttk.Label(row3, textvariable=self.eval_status, style="Hint.TLabel").pack(side="left")

        ttk.Label(t, style="Hint.TLabel", wraplength=640, justify="left", text=(
            "Leave-one-out nearest-template accuracy, compared against the same procedure on shuffled labels. "
            "p < 0.05 means your lip movements separate the words better than chance.")).pack(anchor="w")
        box = ttk.Frame(t)
        box.pack(fill="both", expand=True, pady=(6, 0))
        self.eval_text = tk.Text(box, height=24, font=("Consolas", 10), wrap="none", relief="flat", bg="#fafafa")
        scroll = ttk.Scrollbar(box, orient="vertical", command=self.eval_text.yview)
        self.eval_text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.eval_text.pack(side="left", fill="both", expand=True)
        self.eval_text.insert("end", "Record takes in Train, then click Evaluate.")
        self.eval_text.configure(state="disabled")

    def _build_decode(self) -> None:
        t = self.decode_tab
        left = ttk.Frame(t)
        left.pack(side="left", fill="both", expand=True)
        self.decode_word = tk.StringVar(value="Ready")
        ttk.Label(left, textvariable=self.decode_word, style="Big.TLabel").pack(anchor="w")
        self.decode_detail = tk.StringVar()
        ttk.Label(left, textvariable=self.decode_detail, style="Hint.TLabel").pack(anchor="w")
        ttk.Label(left, text="Transcript").pack(anchor="w", pady=(10, 0))
        self.transcript = tk.Text(left, height=6, font=("Segoe UI", 14), wrap="word", relief="flat", bg="#fafafa")
        self.transcript.pack(fill="x")
        btns = ttk.Frame(left, padding=(0, 4))
        btns.pack(fill="x")
        ttk.Button(btns, text="Clear", command=self._clear_transcript).pack(side="left")
        ttk.Button(btns, text="Copy", command=self._copy_transcript).pack(side="left", padx=4)
        self.template_info = tk.StringVar()
        ttk.Label(btns, textvariable=self.template_info, style="Hint.TLabel").pack(side="right")
        ttk.Label(left, text="Last match").pack(anchor="w", pady=(10, 0))
        self.match_text = tk.Text(left, height=8, font=("Consolas", 10), relief="flat", bg="#fafafa")
        self.match_text.pack(fill="both", expand=True)

        right = ttk.LabelFrame(t, text="Settings", padding=10)
        right.pack(side="left", fill="y", padx=(12, 0))
        self.auto_var = tk.BooleanVar(value=self.settings.auto_detect)
        ttk.Checkbutton(right, text="Auto-detect words (no key needed)", variable=self.auto_var,
                        command=self._toggle_auto).pack(anchor="w")
        cal = ttk.Frame(right, padding=(0, 4))
        cal.pack(fill="x")
        ttk.Button(cal, text="Calibrate (mouth closed, 2 s)", command=self._calibrate).pack(side="left")
        self.seg_state = tk.StringVar(value="Not calibrated")
        ttk.Label(right, textvariable=self.seg_state, style="Hint.TLabel").pack(anchor="w")
        self.seg_meter = LevelMeter(right, width=230)
        self.seg_meter.pack(anchor="w", pady=4)
        self.sens_label = tk.StringVar()
        ttk.Label(right, textvariable=self.sens_label).pack(anchor="w", pady=(8, 0))
        self.sens_var = tk.DoubleVar(value=self.settings.sensitivity)
        ttk.Scale(right, from_=1.5, to=12, variable=self.sens_var, length=230,
                  command=lambda v: self._on_decode_settings()).pack(anchor="w")
        self.maxd_label = tk.StringVar()
        ttk.Label(right, textvariable=self.maxd_label).pack(anchor="w", pady=(8, 0))
        self.maxd_var = tk.DoubleVar(value=self.settings.max_distance)
        ttk.Scale(right, from_=0.1, to=3, variable=self.maxd_var, length=230,
                  command=lambda v: self._on_decode_settings()).pack(anchor="w")
        self.margin_label = tk.StringVar()
        ttk.Label(right, textvariable=self.margin_label).pack(anchor="w", pady=(8, 0))
        self.margin_var = tk.DoubleVar(value=self.settings.min_margin)
        ttk.Scale(right, from_=0, to=0.5, variable=self.margin_var, length=230,
                  command=lambda v: self._on_decode_settings()).pack(anchor="w")
        ttk.Separator(right).pack(fill="x", pady=10)
        self.type_var = tk.BooleanVar(value=self.settings.type_into_apps)
        ttk.Checkbutton(right, text="Type decoded words into the active app", variable=self.type_var,
                        command=self._toggle_type).pack(anchor="w")
        ttk.Label(right, style="Hint.TLabel", wraplength=230, justify="left", text=(
            "Click into another app (Notepad, a browser…), then hold Right Ctrl and mouth a word, "
            "or use auto-detect. Words typed while HushCam itself is focused only go to the transcript."
        )).pack(anchor="w")
        self._on_decode_settings(save=False)

    # ------------------------------------------------------------------ refresh

    def _refresh_all(self) -> None:
        self._refresh_vocab()
        self._refresh_pad()
        self.template_info.set(f"{len(self._training_takes())} templates")

    def _refresh_vocab(self) -> None:
        self.vocab_list.delete(0, "end")
        for w in self.dataset.vocabulary:
            self.vocab_list.insert("end", f"{w[:16]:<16} {self.dataset.count(w, self.settings.condition):>4}")
        if self.selected_word in self.dataset.vocabulary:
            i = self.dataset.vocabulary.index(self.selected_word)
            self.vocab_list.selection_clear(0, "end")
            self.vocab_list.selection_set(i)
            self.vocab_list.see(i)

    def _refresh_pad(self) -> None:
        w = self.selected_word
        if w is None:
            self.word_var.set("Add a word")
        elif core.is_noise_label(w):
            self.word_var.set("(noise: smile, yawn, swallow…)")
        else:
            self.word_var.set(f"“{w}”")
        verb = {"normal": "say", "whisper": "whisper", "mouthed": "silently mouth"}[self.settings.condition]
        if self.capturing and self.tabs.index("current") == 0:
            self.pad_hint.set(f"Capturing… {len(self.capture)} frames")
            self.pad.configure(bg="#fde2e2", highlightbackground="#d00")
        else:
            self.pad_hint.set(f"Hold Space or Right Ctrl, {verb} the word, release.")
            self.pad.configure(bg="#f2f2f2", highlightbackground="#ccc")
        for child in self.pad.winfo_children():
            child.configure(bg=self.pad.cget("bg"))

    # ------------------------------------------------------------------ camera

    def start_camera(self) -> None:
        from .lips import CameraWorker

        if self.worker:
            self.worker.stop()
        self.worker = CameraWorker(self._on_camera_frame, lambda msg: self.events.put(("error", msg)),
                                   camera_index=self.settings.camera_index, mirror=self.settings.mirror)
        self.worker.start()

    def _on_camera_frame(self, bgr, frame: Optional[LipFrame]) -> None:  # worker thread
        self._preview = bgr
        self.frames.append(frame)

    def _switch_camera(self) -> None:
        self.settings.camera_index = int(self.camera_var.get())
        self.save_settings()
        self.start_camera()

    def _toggle_mirror(self) -> None:
        self.settings.mirror = bool(self.mirror_var.get())
        if self.worker:
            self.worker.mirror = self.settings.mirror
        self.save_settings()

    # ------------------------------------------------------------------ main loop

    def _poll(self) -> None:
        try:
            while True:
                try:
                    f = self.frames.popleft()
                except IndexError:
                    break
                self._handle_frame(f)
            while True:
                try:
                    ev = self.events.get_nowait()
                except queue.Empty:
                    break
                self._handle_event(ev)
            self._draw_preview()
            self._update_live_labels()
        except Exception:
            traceback.print_exc()
        self.root.after(15, self._poll)

    def _handle_frame(self, f: Optional[LipFrame]) -> None:
        if f is None:
            if self.capturing:
                self.capture_missed += 1
            return
        self.face_seen = time.monotonic()
        if self.capturing:
            self.capture.append(f)
            if len(self.capture) > 300:
                self.end_capture()
        elif self.settings.auto_detect and self.tabs.index("current") == 2:
            seg = self.segmenter.process(f)
            if seg:
                self.decode(seg, "auto")

    def _handle_event(self, ev: tuple) -> None:
        kind = ev[0]
        if kind == "ptt":
            self.begin_capture() if ev[1] else self.end_capture()
        elif kind == "error":
            self.face_var.set(ev[1])
            messagebox.showerror(APP_NAME, ev[1])
        elif kind == "progress":
            self.eval_progress["value"] = ev[1]
            self.eval_status.set(ev[2])
        elif kind == "eval_done":
            self._show_evaluation(ev[1], ev[2])
        elif kind == "eval_error":
            self.evaluating = False
            self._set_eval_buttons(True)
            self.eval_status.set("")
            self._write_eval(str(ev[1]))

    def _draw_preview(self) -> None:
        bgr = self._preview
        if bgr is None:
            return
        self._preview = None
        try:
            import cv2
            from PIL import Image, ImageTk

            h, w = bgr.shape[:2]
            scale = min(self.PREVIEW_W / w, self.PREVIEW_H / h)
            small = cv2.resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))))
            canvas = np.zeros((self.PREVIEW_H, self.PREVIEW_W, 3), np.uint8)
            y0 = (self.PREVIEW_H - small.shape[0]) // 2
            x0 = (self.PREVIEW_W - small.shape[1]) // 2
            canvas[y0:y0 + small.shape[0], x0:x0 + small.shape[1]] = small
            rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
            self._photo = ImageTk.PhotoImage(Image.fromarray(rgb))
            self.preview.configure(image=self._photo, width=self.PREVIEW_W, height=self.PREVIEW_H)
        except Exception:
            traceback.print_exc()

    def _update_live_labels(self) -> None:
        if self.worker is not None:
            ok = time.monotonic() - self.face_seen < 0.5
            fps = self.worker.fps
            self.face_var.set(f"{'Face tracked' if ok else 'No face found'} · {fps:.0f} fps")
        self.rec_var.set(f"● REC {len(self.capture)}" if self.capturing else "")
        if self.capturing:
            self._refresh_pad()
        s = self.segmenter
        state = {"uncalibrated": "Not calibrated: click Calibrate",
                 "calibrating": f"Calibrating… {s.progress:.0%} (keep mouth closed)",
                 "idle": "Listening", "active": "Word in progress"}[s.state]
        self.seg_state.set(state if self.settings.auto_detect else "Auto-detect off")
        self.seg_meter.set(s.level, self.settings.sensitivity * 2.5, self.settings.sensitivity,
                           "#dc2626" if s.state == "active" else "#3b82f6")

    # ------------------------------------------------------------------ capture

    def _install_ptt_tags(self, widget) -> None:
        if not isinstance(widget, (tk.Entry, ttk.Entry, tk.Text, ttk.Combobox, ttk.Spinbox)):
            tags = widget.bindtags()
            if "PTT" not in tags:
                widget.bindtags(("PTT",) + tags)
        for child in widget.winfo_children():
            self._install_ptt_tags(child)

    def _focus_in_entry(self) -> bool:
        w = self.root.focus_get()
        return isinstance(w, (tk.Entry, ttk.Entry, tk.Text, ttk.Combobox, ttk.Spinbox)) and w not in (
            self.transcript, self.match_text, self.eval_text)

    def _on_space_down(self, e) -> Optional[str]:
        if self._focus_in_entry() or self.space_down:
            return None
        self.space_down = True
        self.begin_capture()
        return "break"

    def _on_space_up(self, e) -> Optional[str]:
        if not self.space_down:
            return None
        self.space_down = False
        self.end_capture()
        return "break"

    def begin_capture(self) -> None:
        tab = self.tabs.index("current")
        if self.capturing or tab not in (0, 2):
            return
        if tab == 0 and self.selected_word is None:
            return
        self.capturing = True
        self.capture = []
        self.capture_missed = 0
        self._refresh_pad()

    def end_capture(self) -> None:
        if not self.capturing:
            return
        self.capturing = False
        frames, missed = self.capture, self.capture_missed
        self.capture = []
        tab = self.tabs.index("current")
        self._refresh_pad()
        if len(frames) < 6:
            self.status_var.set("Capture too short (or no face found). Hold the key for the whole word.")
            return
        if tab == 0:
            take = core.Take(self.selected_word, self.settings.condition, frames)
            self.dataset.takes.append(take)
            self.last_take = take
            self.save_dataset()
            note = f" · {missed} frames without a face" if missed else ""
            self.take_info.set(f"Saved “{take.label}”: {len(frames)} frames, {take.duration:.2f} s{note}")
            if self.settings.balanced:
                self.selected_word = self.dataset.least_recorded(self.settings.condition, exclude=take.label)
            self._refresh_all()
        elif tab == 2:
            self.decode(frames, "key")

    # ------------------------------------------------------------------ train actions

    def _on_condition(self, e=None) -> None:
        label = self.condition_var.get()
        self.settings.condition = next(k for k, v in CONDITIONS.items() if v == label)
        self.save_settings()
        self.root.focus_set()
        self._refresh_all()

    def _on_vocab_select(self, e=None) -> None:
        sel = self.vocab_list.curselection()
        if sel:
            self.selected_word = self.dataset.vocabulary[sel[0]]
            self._refresh_pad()
        self.root.focus_set()

    def _add_word(self) -> None:
        w = self.dataset.add_word(self.new_word.get())
        self.new_word.set("")
        if w:
            self.selected_word = w
            self.save_dataset()
            self._refresh_all()
        self.root.focus_set()

    def _remove_word(self) -> None:
        w = self.selected_word
        if not w:
            return
        n = self.dataset.count(w)
        if n and not messagebox.askyesno(APP_NAME, f"Delete “{w}” and its {n} takes?"):
            return
        self.dataset.remove_word(w)
        self.selected_word = self.dataset.least_recorded(self.settings.condition)
        self.save_dataset()
        self._refresh_all()

    def _delete_last_take(self) -> None:
        if not self.last_take:
            return
        self.dataset.takes = [t for t in self.dataset.takes if t.id != self.last_take.id]
        self.take_info.set(f"Deleted last take of “{self.last_take.label}”.")
        self.last_take = None
        self.save_dataset()
        self._refresh_all()

    def _toggle_balanced(self) -> None:
        self.settings.balanced = bool(self.balanced_var.get())
        self.save_settings()

    # ------------------------------------------------------------------ evaluate

    def _on_eval_settings(self) -> None:
        s = self.settings
        s.groups = [g for g, v in self.group_vars.items() if v.get()]
        s.deltas = bool(self.deltas_var.get())
        label = self.eval_cond_var.get()
        s.eval_condition = next((k for k, v in CONDITIONS.items() if v == label), "all")
        try:
            s.k = max(1, min(5, int(self.k_var.get())))
            s.smoothing = max(1, int(self.smooth_var.get()))
            s.permutations = int(self.perm_var.get())
        except (ValueError, tk.TclError):
            pass
        s.band = round(float(self.band_var.get()), 3)
        self.save_settings()
        self.template_info.set(f"{len(self._training_takes())} templates")

    def _training_takes(self) -> list[core.Take]:
        cond = None if self.settings.eval_condition == "all" else self.settings.eval_condition
        return self.dataset.filtered(cond)

    def _set_eval_buttons(self, enabled: bool) -> None:
        state = "!disabled" if enabled else "disabled"
        self.eval_btn.state([state])
        self.ablate_btn.state([state])

    def _write_eval(self, text: str) -> None:
        self.eval_text.configure(state="normal")
        self.eval_text.delete("1.0", "end")
        self.eval_text.insert("end", text)
        self.eval_text.configure(state="disabled")

    def run_evaluation(self, ablate: bool) -> None:
        if self.evaluating:
            return
        self._on_eval_settings()
        if not self.settings.groups:
            self._write_eval("Select at least one feature group.")
            return
        takes = self._training_takes()
        frames = [t.frames for t in takes]
        labels = [t.label for t in takes]
        fcfg, ccfg, perms = self.settings.features, self.settings.classifier, self.settings.permutations
        self.evaluating = True
        self._set_eval_buttons(False)

        def work():
            try:
                post = lambda p, msg: self.events.put(("progress", p, msg))  # noqa: E731
                seqs = [core.extract(f, fcfg) for f in frames]
                report = core.evaluate(seqs, labels, ccfg, perms,
                                       progress=lambda p: post(p, f"DTW distances {p:.0%}"))
                rows = []
                if ablate:
                    combos = core.all_group_combinations()
                    for i, combo in enumerate(combos):
                        post(i / len(combos), f"Ablation {i + 1}/{len(combos)}: {', '.join(combo)}")
                        cfg = core.FeatureConfig(groups=combo, smoothing=fcfg.smoothing, deltas=fcfg.deltas)
                        r = core.evaluate([core.extract(f, cfg) for f in frames], labels, ccfg, min(perms, 200))
                        rows.append((combo, r.accuracy, r.p_value))
                    rows.sort(key=lambda x: -x[1])
                post(1.0, "Done")
                self.events.put(("eval_done", report, rows))
            except core.EvaluationError as e:
                self.events.put(("eval_error", e))
            except Exception as e:
                traceback.print_exc()
                self.events.put(("eval_error", f"Evaluation failed: {e}"))

        threading.Thread(target=work, daemon=True).start()

    def _show_evaluation(self, r: core.EvaluationReport, rows: list) -> None:
        self.evaluating = False
        self._set_eval_buttons(True)
        lines = [
            f"Accuracy        {r.accuracy:6.1%}   ({r.sample_count} takes, {len(r.labels)} words)",
            f"Chance (1/K)    {r.chance:6.1%}",
            f"Shuffled mean   {r.null_mean:6.1%}   ({r.permutations} permutations)",
            f"p-value         {r.p_value:8.4f}   {'SIGNIFICANT' if r.significant else 'not significant'}",
            "",
            r.verdict,
            "",
            "Null distribution (shuffled-label accuracies; | marks yours):",
            histogram(r.null_accuracies, r.accuracy),
            "",
            "Confusion matrix (rows = mouthed, columns = decoded):",
        ]
        w = max(6, max(len(l) for l in r.labels) + 1)
        lines.append(" " * w + "".join(f"{l[:w - 1]:>{w}}" for l in r.labels) + "  recall")
        for i, l in enumerate(r.labels):
            cells = "".join(f"{(str(n) if n else '.'):>{w}}" for n in r.confusion[i])
            lines.append(f"{l:<{w}}{cells}  {r.recall(l):5.0%}")
        if rows:
            lines += ["", "Feature ablation (which lip features carry the signal?):"]
            for combo, acc, p in rows:
                bar = "█" * int(round(acc * 15))
                lines.append(f"  {' + '.join(GROUP_TITLES[g] for g in combo):<46} {acc:6.1%}  p={p:.3f} {bar}")
        self._write_eval("\n".join(lines))

    # ------------------------------------------------------------------ decode

    def _on_decode_settings(self, save: bool = True) -> None:
        s = self.settings
        s.sensitivity = round(float(self.sens_var.get()), 2)
        s.max_distance = round(float(self.maxd_var.get()), 2)
        s.min_margin = round(float(self.margin_var.get()), 3)
        self.sens_label.set(f"Trigger sensitivity: {s.sensitivity:.1f} σ")
        self.maxd_label.set(f"Max distance: {s.max_distance:.2f}")
        self.margin_label.set(f"Min margin: {s.min_margin:.0%}")
        if save:
            self.save_settings()

    def _toggle_auto(self) -> None:
        self.settings.auto_detect = bool(self.auto_var.get())
        if self.settings.auto_detect and not self.segmenter.calibrated:
            self._calibrate()
        self.save_settings()

    def _calibrate(self) -> None:
        self.segmenter.config.calibration_frames = 60
        self.segmenter.begin_calibration()

    def _toggle_type(self) -> None:
        self.settings.type_into_apps = bool(self.type_var.get())
        if self.settings.type_into_apps and not sysinput.IS_WINDOWS:
            self.status_var.set("Typing into other apps is only supported on Windows.")
        self.save_settings()

    def classifier(self) -> core.TemplateClassifier:
        if self._classifier is None:
            fcfg = self.settings.features
            self._classifier = core.TemplateClassifier(
                [(t.label, core.extract(t.frames, fcfg)) for t in self._training_takes()], self.settings.classifier)
        return self._classifier

    def decode(self, frames: list[LipFrame], source: str) -> None:
        if not self.settings.groups:
            return
        p = self.classifier().classify(core.extract(frames, self.settings.features))
        self.decode_word.set(p.label or "—")
        self.decode_detail.set(p.rejection or f"margin {p.margin:.0%} · {len(frames)} frames · {source}")
        self.match_text.delete("1.0", "end")
        for i, (label, d) in enumerate(p.ranked[:8]):
            mark = "→" if i == 0 else " "
            self.match_text.insert("end", f"{mark} {label:<16} {d:7.3f}\n")
        if p.label:
            self.decoded.append(p.label)
            self.transcript.insert("end", p.label + " ")
            self.transcript.see("end")
            # Only inject into other apps: when HushCam has focus the transcript already shows it.
            if self.settings.type_into_apps and self.root.focus_displayof() is None:
                sysinput.type_text(p.label + " ")

    def _clear_transcript(self) -> None:
        self.decoded.clear()
        self.transcript.delete("1.0", "end")

    def _copy_transcript(self) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(self.transcript.get("1.0", "end").strip())

    # ------------------------------------------------------------------ shutdown

    def close(self) -> None:
        if self.worker:
            self.worker.stop()
        self.ptt.stop()
        self.save_settings()
        self.root.destroy()


def histogram(values: np.ndarray, marker: float, bins: int = 20, height: int = 5) -> str:
    counts = np.bincount(np.clip((np.asarray(values) * bins).astype(int), 0, bins - 1), minlength=bins)
    peak = max(1, counts.max())
    rows = []
    for level in range(height, 0, -1):
        rows.append("  " + "".join("▇▇ " if c / peak * height >= level - 0.5 else "   " for c in counts))
    m = min(bins - 1, int(marker * bins))
    rows.append("  " + "".join(" | " if i == m else "───" for i in range(bins)))
    rows.append("  0%" + " " * (bins * 3 - 8) + "100%")
    return "\n".join(rows)


def selftest(out: Path) -> int:
    """Packaging check used by CI: load the model, run the tracker, build the UI, round-trip the core."""
    result = {"ok": False}
    try:
        import cv2
        import mediapipe

        from .lips import LipTracker, model_path

        result["mediapipe"] = mediapipe.__version__
        result["opencv"] = cv2.__version__
        result["model"] = str(model_path())
        tracker = LipTracker(model_path())
        frame, _ = tracker.process(np.full((480, 640, 3), 128, np.uint8), 0.0)
        result["blank_frame_face"] = frame is not None
        tracker.close()

        rng = np.random.default_rng(0)
        seqs = [rng.normal(size=(20, 4)) + (i % 2) * np.linspace(0, 3, 20)[:, None] for i in range(10)]
        rep = core.evaluate(seqs, [f"w{i % 2}" for i in range(10)], permutations=20)
        result["core_accuracy"] = rep.accuracy

        root = tk.Tk()
        root.withdraw()
        app = HushCamApp(root, use_camera=False)
        root.update()
        app.ptt.stop()
        root.destroy()
        result["ui"] = True
        result["sendinput"] = sysinput.IS_WINDOWS
        result["ok"] = True
    except Exception:
        result["error"] = traceback.format_exc()
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0 if result["ok"] else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog=APP_NAME)
    parser.add_argument("--selftest", type=Path, help="write a packaging self-test report to this file and exit")
    parser.add_argument("--no-camera", action="store_true", help="start without opening the webcam")
    args = parser.parse_args(argv)
    if args.selftest:
        return selftest(args.selftest)
    if sys.platform == "win32":
        try:  # crisp text on high-DPI displays
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
    root = tk.Tk()
    HushCamApp(root, use_camera=not args.no_camera)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
