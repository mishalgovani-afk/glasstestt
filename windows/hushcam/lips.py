"""Webcam -> LipFrame using MediaPipe Face Landmarker (landmarks + blendshapes)."""

from __future__ import annotations

import math
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np

from .core import BLEND_NAMES, CONTOUR_POINTS, LipFrame

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/"
             "face_landmarker/float16/1/face_landmarker.task")
MODEL_NAME = "face_landmarker.task"

# Landmark indices used for normalisation and geometry.
L_EYE_OUTER, R_EYE_OUTER = 33, 263
MOUTH_L, MOUTH_R = 61, 291
UPPER_INNER, LOWER_INNER = 13, 14
UPPER_OUTER, LOWER_OUTER = 0, 17
NOSE_TIP, CHIN = 1, 152
LIP_OUTLINE = (61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146)
LIP_INNER = (78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95)


def app_data_dir() -> Path:
    base = os.environ.get("APPDATA") or os.path.join(Path.home(), ".local", "share")
    return Path(base) / "HushCam"


def model_path() -> Path:
    """Bundled model (PyInstaller), then a dev copy next to the package, then the user data dir."""
    candidates = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(Path(sys._MEIPASS) / "hushcam" / "models" / MODEL_NAME)
    candidates.append(Path(__file__).parent / "models" / MODEL_NAME)
    candidates.append(app_data_dir() / MODEL_NAME)
    for c in candidates:
        if c.exists():
            return c
    return candidates[-1]


def ensure_model() -> Path:
    p = model_path()
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".part")
        urllib.request.urlretrieve(MODEL_URL, tmp)
        os.replace(tmp, p)
    return p


def lip_frame_from_landmarks(points: np.ndarray, blend: dict[str, float], t: float) -> LipFrame:
    """points: (468+, 3) array in pixel units (x, y) plus relative z."""
    le, re = points[L_EYE_OUTER, :2], points[R_EYE_OUTER, :2]
    iod = float(np.linalg.norm(re - le)) or 1.0
    roll = math.atan2(re[1] - le[1], re[0] - le[0])
    c, s = math.cos(-roll), math.sin(-roll)
    rot = np.array([[c, -s], [s, c]])
    centre = (points[MOUTH_L, :2] + points[MOUTH_R, :2]) / 2

    def norm(i: int) -> np.ndarray:
        return rot @ (points[i, :2] - centre) / iod

    def dist(i: int, j: int) -> float:
        return float(np.linalg.norm(points[i, :2] - points[j, :2]) / iod)

    width = dist(MOUTH_L, MOUTH_R)
    inner = dist(UPPER_INNER, LOWER_INNER)
    outer = dist(UPPER_OUTER, LOWER_OUTER)
    shape = np.array([width, inner, outer, inner / width if width > 0 else 0.0, dist(NOSE_TIP, CHIN)])
    contour = np.concatenate([norm(i) for i in CONTOUR_POINTS])
    b = np.array([float(blend.get(n, 0.0)) for n in BLEND_NAMES])
    return LipFrame(t, shape, contour, b)


class LipTracker:
    """Wraps MediaPipe FaceLandmarker in VIDEO mode."""

    def __init__(self, model: Optional[Path] = None):
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        self._mp = mp
        options = vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(model or ensure_model())),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,
            min_face_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(options)
        self._last_ms = -1

    def process(self, rgb: np.ndarray, t: float) -> tuple[Optional[LipFrame], Optional[np.ndarray]]:
        """rgb: HxWx3 uint8. Returns (LipFrame or None if no face, pixel landmarks or None)."""
        h, w = rgb.shape[:2]
        ms = max(int(t * 1000), self._last_ms + 1)
        self._last_ms = ms
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self._landmarker.detect_for_video(image, ms)
        if not result.face_landmarks:
            return None, None
        lm = result.face_landmarks[0]
        pts = np.array([[p.x * w, p.y * h, p.z * w] for p in lm])
        blend = {}
        if result.face_blendshapes:
            blend = {c.category_name: c.score for c in result.face_blendshapes[0]}
        return lip_frame_from_landmarks(pts, blend, t), pts

    def close(self) -> None:
        self._landmarker.close()


class CameraWorker(threading.Thread):
    """Reads the webcam, runs the tracker, and hands (bgr_preview, LipFrame|None) to a callback."""

    def __init__(self, on_frame, on_error, camera_index: int = 0, mirror: bool = True):
        super().__init__(daemon=True)
        self.on_frame = on_frame
        self.on_error = on_error
        self.camera_index = camera_index
        self.mirror = mirror
        self._stop = threading.Event()
        self.fps = 0.0

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        import cv2

        try:
            tracker = LipTracker()
        except Exception as e:  # model download / load failure
            self.on_error(f"Could not load the face model: {e}")
            return
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        cap = cv2.VideoCapture(self.camera_index, backend)
        if not cap.isOpened():
            self.on_error(f"Could not open camera {self.camera_index}. Is another app using it?")
            tracker.close()
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
        t0 = time.perf_counter()
        last = t0
        try:
            while not self._stop.is_set():
                ok, bgr = cap.read()
                if not ok:
                    time.sleep(0.01)
                    continue
                if self.mirror:
                    bgr = cv2.flip(bgr, 1)
                now = time.perf_counter()
                dt = now - last
                last = now
                if dt > 0:
                    self.fps = 0.9 * self.fps + 0.1 * (1 / dt) if self.fps else 1 / dt
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                frame, pts = tracker.process(rgb, now - t0)
                if pts is not None:
                    draw_lips(bgr, pts)
                self.on_frame(bgr, frame)
        finally:
            cap.release()
            tracker.close()


def draw_lips(bgr: np.ndarray, pts: np.ndarray) -> None:
    import cv2

    for loop, color in ((LIP_OUTLINE, (80, 220, 80)), (LIP_INNER, (60, 160, 255))):
        poly = np.round(pts[list(loop), :2]).astype(np.int32)
        cv2.polylines(bgr, [poly], isClosed=True, color=color, thickness=1, lineType=cv2.LINE_AA)


def list_cameras(max_index: int = 5) -> list[int]:
    import cv2

    found = []
    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    for i in range(max_index):
        cap = cv2.VideoCapture(i, backend)
        if cap.isOpened():
            found.append(i)
        cap.release()
    return found or [0]
