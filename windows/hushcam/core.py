"""Decoder core: lip features, DTW template matching, honest evaluation, streaming segmentation.

Pure numpy, no camera or GUI code, so it is fully unit-testable on any OS.
Mirrors the algorithm in the macOS app's HushCore, with lip-landmark features in place of head motion.
"""

from __future__ import annotations

import json
import math
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional, Sequence

import numpy as np

# MediaPipe face blendshapes that describe the mouth and jaw (ARKit naming).
BLEND_NAMES: tuple[str, ...] = (
    "jawForward", "jawLeft", "jawRight", "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker",
    "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
    "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight", "mouthRollLower",
    "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthPressLeft", "mouthPressRight",
    "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight", "cheekPuff",
)

SHAPE_NAMES: tuple[str, ...] = ("width", "inner_height", "outer_height", "aspect", "jaw_drop")

# Lip points (MediaPipe face-mesh indices): 12 outer + 8 inner.
CONTOUR_POINTS: tuple[int, ...] = (61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91,
                                   78, 82, 13, 312, 308, 317, 14, 87)

GROUPS: dict[str, int] = {
    "shape": len(SHAPE_NAMES),
    "contour": len(CONTOUR_POINTS) * 2,
    "blend": len(BLEND_NAMES),
}
GROUP_TITLES = {"shape": "Lip geometry", "contour": "Lip contour", "blend": "Mouth blendshapes"}
DEFAULT_GROUPS: tuple[str, ...] = ("shape", "contour", "blend")


@dataclass
class LipFrame:
    """One webcam frame's mouth description. Coordinates are face-normalised
    (centred on the mouth, de-rolled, scaled by inter-ocular distance)."""

    t: float
    shape: np.ndarray
    contour: np.ndarray
    blend: np.ndarray

    def group(self, name: str) -> np.ndarray:
        return getattr(self, name)

    def to_json(self) -> dict:
        r = lambda a: [round(float(x), 5) for x in a]  # noqa: E731
        return {"t": round(self.t, 4), "s": r(self.shape), "c": r(self.contour), "b": r(self.blend)}

    @staticmethod
    def from_json(d: dict) -> "LipFrame":
        return LipFrame(
            t=float(d["t"]),
            shape=np.asarray(d["s"], dtype=float),
            contour=np.asarray(d["c"], dtype=float),
            blend=np.asarray(d["b"], dtype=float),
        )


def duration(frames: Sequence[LipFrame]) -> float:
    return frames[-1].t - frames[0].t if len(frames) > 1 else 0.0


# ----------------------------------------------------------------------------------------------
# Features


@dataclass(frozen=True)
class FeatureConfig:
    groups: tuple[str, ...] = DEFAULT_GROUPS
    trim_threshold: float = 0.12
    smoothing: int = 3
    deltas: bool = False

    @property
    def dimension(self) -> int:
        return sum(GROUPS[g] for g in self.groups) * (2 if self.deltas else 1)


def all_group_combinations() -> list[tuple[str, ...]]:
    names = list(GROUPS)
    out = []
    for mask in range(1, 1 << len(names)):
        out.append(tuple(n for i, n in enumerate(names) if mask & (1 << i)))
    return sorted(out, key=lambda c: (len(c), c))


def raw_matrix(frames: Sequence[LipFrame], groups: Iterable[str]) -> np.ndarray:
    groups = tuple(groups)
    if not frames or not groups:
        return np.zeros((0, sum(GROUPS[g] for g in groups)))
    return np.stack([np.concatenate([f.group(g) for g in groups]) for f in frames]).astype(float)


def activity(frames: Sequence[LipFrame]) -> np.ndarray:
    """Per-frame mouth deviation from the resting pose, rescaled to [0, 1].

    Rest is estimated from the first and last three frames: with push-to-talk and the
    auto-segmenter's pre-roll/hangover, a capture starts and ends with the mouth at rest.
    """
    x = raw_matrix(frames, ("shape", "blend"))
    if len(x) == 0:
        return np.zeros(0)
    ref = np.median(np.vstack([x[:3], x[-3:]]), axis=0)
    dev = smooth(np.linalg.norm(x - ref, axis=1)[:, None], 3)[:, 0]
    span = dev.max() - dev.min()
    return (dev - dev.min()) / span if span > 0 else np.zeros(len(x))


def trim(frames: Sequence[LipFrame], threshold: float, padding: int = 2, minimum: int = 6) -> list[LipFrame]:
    frames = list(frames)
    if threshold <= 0 or len(frames) <= minimum:
        return frames
    e = activity(frames)
    idx = np.flatnonzero(e >= threshold)
    if len(idx) == 0:
        return frames
    lo = max(0, idx[0] - padding)
    hi = min(len(frames) - 1, idx[-1] + padding)
    if hi - lo + 1 < minimum:
        return frames
    return frames[lo:hi + 1]


def smooth(x: np.ndarray, window: int) -> np.ndarray:
    if window <= 1 or len(x) < 2:
        return x
    half = window // 2
    out = np.empty_like(x)
    for i in range(len(x)):
        out[i] = x[max(0, i - half):min(len(x), i + half + 1)].mean(axis=0)
    return out


def extract(frames: Sequence[LipFrame], config: FeatureConfig = FeatureConfig()) -> np.ndarray:
    """Frames -> (T, D) feature sequence, mean-centred per channel."""
    if not config.groups:
        return np.zeros((0, 0))
    x = raw_matrix(trim(frames, config.trim_threshold), config.groups)
    if len(x) == 0:
        return np.zeros((0, config.dimension))
    x = smooth(x, config.smoothing)
    if config.deltas:
        d = np.zeros_like(x)
        d[1:] = np.diff(x, axis=0)
        x = np.hstack([x, d])
    return x - x.mean(axis=0)


class ChannelScaler:
    """Per-channel 1/sigma over training frames. Uses no labels, so it cannot leak them."""

    def __init__(self, scales: np.ndarray):
        self.scales = scales

    @staticmethod
    def fit(seqs: Sequence[np.ndarray]) -> "ChannelScaler":
        seqs = [s for s in seqs if len(s)]
        if not seqs:
            return ChannelScaler(np.ones(0))
        sd = np.vstack(seqs).std(axis=0)
        scales = np.ones_like(sd)
        ok = sd > 1e-9
        scales[ok] = 1 / sd[ok]
        return ChannelScaler(scales)

    def apply(self, s: np.ndarray) -> np.ndarray:
        if len(self.scales) != (s.shape[1] if s.ndim == 2 else -1):
            return s
        return s * self.scales


# ----------------------------------------------------------------------------------------------
# DTW


def dtw(a: np.ndarray, b: np.ndarray, band: float = 0.2, cutoff: float = math.inf) -> float:
    """Path-length- and dimension-normalised multivariate DTW with a Sakoe-Chiba band.

    The per-frame cost is the RMS difference across channels, so thresholds mean the same
    thing whichever feature groups are selected.

    Each row's recurrence cur[j] = c[j] + min(prev[j], prev[j-1], cur[j-1]) is solved in closed
    form with a running minimum, so the inner loop is vectorised.
    """
    n, m = len(a), len(b)
    if n == 0 or m == 0 or a.shape[1] != b.shape[1]:
        return math.inf
    cost = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).mean(axis=2))
    w = max(int(math.ceil(band * max(n, m))), abs(n - m), 1)
    norm = float(n + m)
    prev = np.full(m + 1, np.inf)
    prev[0] = 0.0
    for i in range(1, n + 1):
        lo, hi = max(1, i - w), min(m, i + w)
        cur = np.full(m + 1, np.inf)
        if lo <= hi:
            c = cost[i - 1, lo - 1:hi]
            tmp = c + np.minimum(prev[lo:hi + 1], prev[lo - 1:hi])
            s = np.cumsum(c)
            cur[lo:hi + 1] = s + np.minimum.accumulate(tmp - s)
            if cur[lo:hi + 1].min() / norm > cutoff:
                return math.inf
        prev = cur
    return float(prev[m] / norm)


def distance_matrix(seqs: Sequence[np.ndarray], band: float = 0.2, progress=None) -> np.ndarray:
    n = len(seqs)
    d = np.zeros((n, n))
    total = n * (n - 1) // 2
    done = 0
    for i in range(n):
        for j in range(i + 1, n):
            d[i, j] = d[j, i] = dtw(seqs[i], seqs[j], band)
            done += 1
        if progress and total:
            progress(done / total)
    return d


# ----------------------------------------------------------------------------------------------
# Classifier


@dataclass(frozen=True)
class ClassifierConfig:
    band: float = 0.2
    k: int = 1
    max_distance: float = 1.0
    min_margin: float = 0.08


def is_noise_label(label: str) -> bool:
    """Labels starting with "_" are rejection classes (e.g. "_noise": yawns, smiles, talking)."""
    return label.startswith("_")


@dataclass
class Prediction:
    label: Optional[str]
    ranked: list[tuple[str, float]]
    margin: float
    rejection: Optional[str]

    @property
    def best(self) -> Optional[tuple[str, float]]:
        return self.ranked[0] if self.ranked else None


class TemplateClassifier:
    def __init__(self, examples: Sequence[tuple[str, np.ndarray]], config: ClassifierConfig = ClassifierConfig()):
        usable = [(l, s) for l, s in examples if len(s)]
        self.scaler = ChannelScaler.fit([s for _, s in usable])
        self.templates = [(l, self.scaler.apply(s)) for l, s in usable]
        self.config = config

    @property
    def labels(self) -> list[str]:
        return sorted({l for l, _ in self.templates})

    def classify(self, raw: np.ndarray) -> Prediction:
        if not self.templates or len(raw) == 0:
            return Prediction(None, [], 0.0, "No templates")
        seq = self.scaler.apply(raw)
        per: dict[str, list[float]] = {}
        for label, t in self.templates:
            per.setdefault(label, []).append(dtw(seq, t, self.config.band))
        k = max(1, self.config.k)
        ranked = sorted(((l, float(np.mean(sorted(ds)[:k]))) for l, ds in per.items()), key=lambda x: (x[1], x[0]))
        best = ranked[0]
        if len(ranked) > 1 and math.isfinite(ranked[1][1]) and ranked[1][1] > 0:
            margin = (ranked[1][1] - best[1]) / ranked[1][1]
        else:
            margin = 1.0
        rejection = None
        if is_noise_label(best[0]):
            rejection = "Matched a noise template"
        elif not best[1] <= self.config.max_distance:
            rejection = "Too far from every template"
        elif margin < self.config.min_margin:
            rejection = "Too close to call"
        return Prediction(None if rejection else best[0], ranked, margin, rejection)


# ----------------------------------------------------------------------------------------------
# Evaluation


class EvaluationError(ValueError):
    pass


@dataclass
class EvaluationReport:
    labels: list[str]
    sample_count: int
    accuracy: float
    chance: float
    majority_baseline: float
    p_value: float
    permutations: int
    null_accuracies: np.ndarray
    confusion: np.ndarray  # [true, predicted]

    @property
    def null_mean(self) -> float:
        return float(self.null_accuracies.mean()) if len(self.null_accuracies) else self.chance

    @property
    def significant(self) -> bool:
        return self.p_value < 0.05

    def recall(self, label: str) -> float:
        i = self.labels.index(label)
        row = self.confusion[i]
        return float(row[i] / row.sum()) if row.sum() else 0.0

    @property
    def verdict(self) -> str:
        if self.significant:
            return (f"The lip signal separates these words: {self.accuracy:.0%} vs {self.null_mean:.0%} "
                    f"expected by chance (p = {self.p_value:.3f}).")
        return (f"No evidence yet: {self.accuracy:.0%} is within what shuffled labels reach "
                f"({self.null_mean:.0%}, p = {self.p_value:.3f}). Record more takes or try other features.")


def loo_predict(dist: np.ndarray, y: np.ndarray, classes: int, k: int = 1) -> np.ndarray:
    n = len(y)
    out = np.full(n, -1)
    for i in range(n):
        best, best_c = math.inf, -1
        for c in range(classes):
            mask = y == c
            mask[i] = False
            if not mask.any():
                continue
            ds = dist[i, mask]
            score = ds.min() if k == 1 else np.sort(ds)[:k].mean()
            if score < best:
                best, best_c = score, c
        out[i] = best_c
    return out


def evaluate_distances(dist: np.ndarray, labels: Sequence[str], k: int = 1,
                       permutations: int = 500, seed: int = 0x5EED) -> EvaluationReport:
    names = sorted(set(labels))
    index = {n: i for i, n in enumerate(names)}
    y = np.array([index[l] for l in labels])
    pred = loo_predict(dist, y, len(names), k)
    acc = float((pred == y).mean())
    conf = np.zeros((len(names), len(names)), dtype=int)
    for t, p in zip(y, pred):
        if p >= 0:
            conf[t, p] += 1
    rng = np.random.default_rng(seed)
    nulls = np.empty(permutations)
    for r in range(permutations):
        ys = rng.permutation(y)
        nulls[r] = (loo_predict(dist, ys, len(names), k) == ys).mean()
    p = (1 + int((nulls >= acc - 1e-12).sum())) / (permutations + 1)
    counts = np.bincount(y, minlength=len(names))
    return EvaluationReport(names, len(y), acc, 1 / len(names), float(counts.max() / len(y)), p,
                            permutations, nulls, conf)


def evaluate(seqs: Sequence[np.ndarray], labels: Sequence[str], config: ClassifierConfig = ClassifierConfig(),
             permutations: int = 500, seed: int = 0x5EED, progress=None) -> EvaluationReport:
    """Leave-one-out nearest-template accuracy plus a label-permutation test."""
    if len(seqs) != len(labels):
        raise ValueError("sequences and labels differ in length")
    names = sorted(set(labels))
    if len(names) < 2:
        raise EvaluationError("Record at least two different words.")
    short = [n for n in names if list(labels).count(n) < 2]
    if short:
        raise EvaluationError(f"Each word needs at least two takes. Short: {', '.join(short)}.")
    scaler = ChannelScaler.fit(seqs)
    scaled = [scaler.apply(s) for s in seqs]
    dist = distance_matrix(scaled, config.band, progress)
    return evaluate_distances(dist, labels, config.k, permutations, seed)


# ----------------------------------------------------------------------------------------------
# Streaming segmentation


@dataclass
class SegmenterConfig:
    sensitivity: float = 4.0       # RMS z-score vs resting mouth that starts a word
    release_ratio: float = 0.5
    min_on_frames: int = 2
    preroll_frames: int = 5
    hangover_frames: int = 8
    min_frames: int = 8
    max_frames: int = 150
    smoothing: float = 0.5
    calibration_frames: int = 60


class Segmenter:
    """Calibrate on a resting mouth, then emit spans where the mouth departs from rest."""

    def __init__(self, config: SegmenterConfig = None):
        self.config = config or SegmenterConfig()
        self.state = "uncalibrated"   # uncalibrated | calibrating | idle | active
        self.level = 0.0
        self.progress = 0.0
        self._cal: list[np.ndarray] = []
        self._mu: Optional[np.ndarray] = None
        self._sd: Optional[np.ndarray] = None
        self._pre: list[LipFrame] = []
        self._buf: list[LipFrame] = []
        self._above = 0
        self._below = 0

    @staticmethod
    def _vec(f: LipFrame) -> np.ndarray:
        return np.concatenate([f.shape, f.blend])

    @property
    def calibrated(self) -> bool:
        return self.state in ("idle", "active")

    def begin_calibration(self) -> None:
        self._cal = []
        self.state = "calibrating"
        self.progress = 0.0
        self.reset()

    def reset(self) -> None:
        self._pre, self._buf = [], []
        self._above = self._below = 0
        self.level = 0.0
        if self.state == "active":
            self.state = "idle"

    def set_rest(self, mu: np.ndarray, sd: np.ndarray) -> None:
        self._mu = mu
        # Floor the spread so tiny-variance channels do not explode the score.
        self._sd = np.maximum(sd, np.maximum(0.02 * np.abs(mu), 1e-3))
        self.state = "idle"
        self.reset()

    def process(self, f: LipFrame) -> Optional[list[LipFrame]]:
        c = self.config
        if self.state == "uncalibrated":
            return None
        if self.state == "calibrating":
            self._cal.append(self._vec(f))
            self.progress = len(self._cal) / c.calibration_frames
            if len(self._cal) >= c.calibration_frames:
                x = np.stack(self._cal)
                self.set_rest(x.mean(axis=0), x.std(axis=0))
            return None

        z = float(np.sqrt(np.mean(((self._vec(f) - self._mu) / self._sd) ** 2)))
        self.level += c.smoothing * (z - self.level)

        if self.state == "idle":
            self._pre.append(f)
            keep = c.preroll_frames + c.min_on_frames
            if len(self._pre) > keep:
                self._pre = self._pre[-keep:]
            self._above = self._above + 1 if self.level > c.sensitivity else 0
            if self._above >= c.min_on_frames:
                self.state = "active"
                self._buf, self._pre = self._pre, []
                self._below = 0
            return None

        self._buf.append(f)
        self._below = self._below + 1 if self.level < c.sensitivity * c.release_ratio else 0
        if self._below < c.hangover_frames and len(self._buf) < c.max_frames:
            return None
        seg = self._buf[:len(self._buf) - max(0, self._below - 2)]
        self._buf = []
        self._above = self._below = 0
        self.state = "idle"
        return seg if len(seg) >= c.min_frames else None


# ----------------------------------------------------------------------------------------------
# Dataset

CONDITIONS = {"normal": "Normal speech", "whisper": "Whisper", "mouthed": "Silent mouthing"}
STARTER_VOCABULARY = ["yes", "no", "hello", "stop", "next", "_noise"]


@dataclass
class Take:
    label: str
    condition: str
    frames: list[LipFrame]
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def duration(self) -> float:
        return duration(self.frames)

    def to_json(self) -> dict:
        return {"id": self.id, "label": self.label, "condition": self.condition, "created": self.created,
                "frames": [f.to_json() for f in self.frames]}

    @staticmethod
    def from_json(d: dict) -> "Take":
        return Take(d["label"], d["condition"], [LipFrame.from_json(f) for f in d["frames"]], d["id"], d["created"])


@dataclass
class Dataset:
    vocabulary: list[str] = field(default_factory=lambda: list(STARTER_VOCABULARY))
    takes: list[Take] = field(default_factory=list)

    def count(self, label: str, condition: Optional[str] = None) -> int:
        return sum(1 for t in self.takes if t.label == label and (condition is None or t.condition == condition))

    def filtered(self, condition: Optional[str] = None) -> list[Take]:
        return [t for t in self.takes if t.label in self.vocabulary and (condition is None or t.condition == condition)]

    def least_recorded(self, condition: Optional[str] = None, exclude: Optional[str] = None) -> Optional[str]:
        pool = [w for w in self.vocabulary if w != exclude] or self.vocabulary
        return min(pool, key=lambda w: self.count(w, condition)) if pool else None

    def add_word(self, word: str) -> Optional[str]:
        w = word.strip()
        if w and w not in self.vocabulary:
            self.vocabulary.append(w)
            return w
        return w or None

    def remove_word(self, word: str) -> None:
        self.vocabulary = [w for w in self.vocabulary if w != word]
        self.takes = [t for t in self.takes if t.label != word]

    def to_json(self) -> dict:
        return {"version": 1, "kind": "hushcam-lips", "vocabulary": self.vocabulary,
                "takes": [t.to_json() for t in self.takes]}

    @staticmethod
    def from_json(d: dict) -> "Dataset":
        return Dataset(list(d.get("vocabulary", STARTER_VOCABULARY)), [Take.from_json(t) for t in d.get("takes", [])])

    def save(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(self.to_json(), fh, separators=(",", ":"))
        os.replace(tmp, path)

    @staticmethod
    def load(path: Path) -> "Dataset":
        with open(path, encoding="utf-8") as fh:
            return Dataset.from_json(json.load(fh))
