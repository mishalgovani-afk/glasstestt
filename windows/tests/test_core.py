import math

import numpy as np
import pytest

from hushcam import core
from hushcam.core import (
    BLEND_NAMES, GROUPS, ClassifierConfig, Dataset, FeatureConfig, LipFrame, Segmenter, Take,
    TemplateClassifier, all_group_combinations, dtw, evaluate, extract,
)

FPS = 30.0
B = {n: i for i, n in enumerate(BLEND_NAMES)}


class Synth:
    """Synthetic mouth: each word is a different articulation trajectory, randomly
    time-stretched, amplitude-jittered and noisy, like repeated takes by one person."""

    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)

    def frame(self, t, jaw=0.0, pucker=0.0, stretch=0.0, close=0.0, noise=0.01):
        r = self.rng
        blend = np.abs(r.normal(0, noise, len(BLEND_NAMES)))
        blend[B["jawOpen"]] += jaw
        blend[B["mouthPucker"]] += pucker
        blend[B["mouthFunnel"]] += 0.6 * pucker
        blend[B["mouthStretchLeft"]] += stretch
        blend[B["mouthStretchRight"]] += stretch
        blend[B["mouthClose"]] += close
        width = 0.9 + 0.3 * stretch - 0.3 * pucker + r.normal(0, noise)
        inner = 0.02 + 0.35 * jaw + r.normal(0, noise)
        outer = 0.25 + 0.4 * jaw + r.normal(0, noise)
        shape = np.array([width, inner, outer, inner / width, 1.4 + 0.3 * jaw + r.normal(0, noise)])
        n = len(core.CONTOUR_POINTS)
        ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
        contour = np.empty(n * 2)
        contour[0::2] = np.cos(ang) * width / 2 + r.normal(0, noise, n)
        contour[1::2] = np.sin(ang) * outer / 2 + r.normal(0, noise, n)
        return LipFrame(t, shape, contour, blend)

    def rest(self, n, start=0.0, noise=0.01):
        return [self.frame(start + i / FPS, noise=noise) for i in range(n)]

    def word(self, w, start=0.0, noise=0.01):
        stretch_t = self.rng.uniform(0.8, 1.25)
        amp = self.rng.uniform(0.85, 1.15)
        n = int(24 * stretch_t)
        frames = self.rest(4, start, noise)
        for i in range(n):
            p = i / (n - 1)
            bump = math.sin(math.pi * p)
            kw = {}
            if w % 4 == 0:      # "yes": open then stretch
                kw = dict(jaw=0.5 * bump, stretch=0.4 * max(0, math.sin(2 * math.pi * p)))
            elif w % 4 == 1:    # "no": pucker
                kw = dict(jaw=0.3 * bump, pucker=0.6 * bump)
            elif w % 4 == 2:    # "hello": two openings
                kw = dict(jaw=0.5 * abs(math.sin(2 * math.pi * p)))
            else:               # "stop": close, then pop
                kw = dict(close=0.5 * bump, jaw=0.4 * p * p)
            kw = {k: v * amp for k, v in kw.items()}
            frames.append(self.frame(start + len(frames) / FPS, noise=noise, **kw))
        frames += self.rest(4, start + len(frames) / FPS, noise)
        return frames


def naive_dtw(a, b, band):
    n, m = len(a), len(b)
    w = max(int(math.ceil(band * max(n, m))), abs(n - m), 1)
    D = np.full((n + 1, m + 1), np.inf)
    D[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(max(1, i - w), min(m, i + w) + 1):
            c = np.linalg.norm(a[i - 1] - b[j - 1]) / math.sqrt(a.shape[1])
            D[i, j] = c + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    return D[n, m] / (n + m)


# --- DTW -----------------------------------------------------------------------------------

@pytest.mark.parametrize("seed", range(8))
def test_vectorised_dtw_matches_reference(seed):
    r = np.random.default_rng(seed)
    a = r.normal(size=(r.integers(5, 40), 3))
    b = r.normal(size=(r.integers(5, 40), 3))
    for band in (0.05, 0.2, 0.5):
        assert dtw(a, b, band) == pytest.approx(naive_dtw(a, b, band), rel=1e-9, abs=1e-12)


def test_dtw_properties():
    base = np.sin(np.linspace(0, np.pi, 30))[:, None]
    slow = np.sin(np.linspace(0, np.pi, 40))[:, None]
    other = -np.sin(np.linspace(0, 2 * np.pi, 30))[:, None]
    assert dtw(base, base) == pytest.approx(0)
    assert dtw(base, slow) < dtw(base, other) / 5
    assert dtw(base, slow) == pytest.approx(dtw(slow, base))
    assert dtw(np.zeros((20, 1)), np.full((20, 1), 10.0), cutoff=1) == math.inf
    assert dtw(np.zeros((20, 1)), np.full((20, 1), 10.0)) == pytest.approx(5)
    assert dtw(np.ones((5, 1)), np.ones((50, 1)), band=0.01) == pytest.approx(0)
    assert dtw(np.zeros((0, 1)), base) == math.inf


# --- Features ------------------------------------------------------------------------------

def test_feature_dimensions():
    frames = Synth(1).word(0)
    assert len(all_group_combinations()) == 7
    for groups in all_group_combinations():
        for deltas in (False, True):
            cfg = FeatureConfig(groups=groups, deltas=deltas)
            x = extract(frames, cfg)
            assert x.shape[1] == cfg.dimension == sum(GROUPS[g] for g in groups) * (2 if deltas else 1)
            assert len(x) >= 6
            np.testing.assert_allclose(x.mean(axis=0), 0, atol=1e-9)


def test_trim_drops_rest_padding():
    s = Synth(2)
    frames = s.rest(20) + s.word(1, start=20 / FPS) + s.rest(20, start=3)
    assert len(core.trim(frames, 0.12)) < len(frames) - 20


def test_frame_json_round_trip():
    f = Synth(3).word(0)[10]
    g = LipFrame.from_json(f.to_json())
    np.testing.assert_allclose(g.blend, f.blend, atol=1e-5)
    np.testing.assert_allclose(g.contour, f.contour, atol=1e-5)


# --- Classifier ----------------------------------------------------------------------------

def make_examples(seed, per_word, words=3, cfg=FeatureConfig()):
    s = Synth(seed)
    return [(f"w{w}", extract(s.word(w), cfg)) for w in range(words) for _ in range(per_word)]


def test_recognises_held_out_takes():
    clf = TemplateClassifier(make_examples(10, 5, 4), ClassifierConfig(max_distance=math.inf, min_margin=0))
    s = Synth(99)
    hits = sum(clf.classify(extract(s.word(w))).label == f"w{w}" for w in range(4) for _ in range(5))
    assert hits >= 18


def test_noise_class_rejected():
    ex = make_examples(11, 4, 2)
    s = Synth(12)
    ex += [("_noise", extract(s.word(3))) for _ in range(4)]
    p = TemplateClassifier(ex, ClassifierConfig(max_distance=math.inf, min_margin=0)).classify(extract(s.word(3)))
    assert p.label is None and p.best[0] == "_noise" and "noise" in p.rejection


def test_distance_gate_and_empty():
    clf = TemplateClassifier(make_examples(13, 3, 2), ClassifierConfig(max_distance=1e-9, min_margin=0))
    assert clf.classify(extract(Synth(14).word(0))).rejection == "Too far from every template"
    assert TemplateClassifier([]).classify(np.zeros((3, 5))).rejection == "No templates"


# --- Evaluation ----------------------------------------------------------------------------

def test_separable_words_significant():
    s = Synth(20)
    seqs, labels = [], []
    for w in range(4):
        for _ in range(6):
            seqs.append(extract(s.word(w)))
            labels.append(f"w{w}")
    r = evaluate(seqs, labels, permutations=200)
    assert r.accuracy > 0.85 and r.p_value < 0.01 and r.significant
    assert r.confusion.sum() == 24 and r.chance == 0.25 and r.null_mean < 0.45
    assert "separates" in r.verdict


def test_uninformative_labels_not_significant():
    s = Synth(21)
    seqs = [extract(s.word(0)) for _ in range(24)]
    labels = [f"w{i % 3}" for i in range(24)]
    r = evaluate(seqs, labels, permutations=200)
    assert r.accuracy < 0.7 and r.p_value > 0.01


def test_reproducible_and_validation():
    s = Synth(22)
    seqs = [extract(s.word(i % 2)) for i in range(12)]
    labels = [f"w{i % 2}" for i in range(12)]
    a = evaluate(seqs, labels, permutations=50, seed=7)
    b = evaluate(seqs, labels, permutations=50, seed=7)
    np.testing.assert_array_equal(a.null_accuracies, b.null_accuracies)
    with pytest.raises(core.EvaluationError):
        evaluate(seqs[:2], ["a", "a"])
    with pytest.raises(core.EvaluationError, match="b"):
        evaluate(seqs[:3], ["a", "a", "b"])


# --- Segmenter -----------------------------------------------------------------------------

def test_segmenter_finds_words():
    s = Synth(30)
    seg = Segmenter()
    seg.begin_calibration()
    stream = s.rest(80)
    for w in range(4):
        stream += s.word(w, start=len(stream) / FPS)
        stream += s.rest(40, start=len(stream) / FPS)
    out = [x for x in (seg.process(f) for f in stream) if x]
    assert seg.calibrated
    assert len(out) == 4
    assert all(12 <= len(x) < 60 for x in out)


def test_segmenter_quiet_and_uncalibrated():
    s = Synth(31)
    seg = Segmenter()
    seg.begin_calibration()
    assert not any(seg.process(f) for f in s.rest(600))
    seg2 = Segmenter()
    assert not any(seg2.process(f) for f in s.word(0))
    assert seg2.state == "uncalibrated"


# --- Dataset -------------------------------------------------------------------------------

def test_dataset_round_trip(tmp_path):
    s = Synth(40)
    d = Dataset(vocabulary=["yes", "no"])
    d.takes.append(Take("yes", "mouthed", s.word(0)))
    d.add_word("maybe")
    d.add_word("yes")
    assert d.vocabulary == ["yes", "no", "maybe"]
    assert d.least_recorded("mouthed") == "no"
    p = tmp_path / "sub" / "d.json"
    d.save(p)
    e = Dataset.load(p)
    assert e.vocabulary == d.vocabulary and e.takes[0].id == d.takes[0].id
    assert len(e.takes[0].frames) == len(d.takes[0].frames)
    d.remove_word("yes")
    assert not d.takes
