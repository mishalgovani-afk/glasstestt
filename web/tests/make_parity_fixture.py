"""Generate tests/fixtures/parity.json from the Python core (windows/hushcam/core.py).

The JS port must reproduce these numbers. Run from the repo root:
    python web/tests/make_parity_fixture.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "windows"), str(ROOT / "windows" / "tests")]

import numpy as np  # noqa: E402
from hushcam import core  # noqa: E402
from test_core import Synth  # noqa: E402

s = Synth(123)
takes = [(f"w{w}", s.word(w)) for _ in range(3) for w in range(4)]
cfgs = {
    "default": core.FeatureConfig(),
    "shape_deltas": core.FeatureConfig(groups=("shape",), deltas=True, smoothing=5),
    "blend_contour": core.FeatureConfig(groups=("contour", "blend"), smoothing=1),
}
out = {"takes": [{"label": l, "frames": [f.to_json() for f in fr]} for l, fr in takes], "configs": {}}
# Use the JSON-rounded frames so both sides start from identical inputs.
frames = [[core.LipFrame.from_json(f) for f in t["frames"]] for t in out["takes"]]
labels = [t["label"] for t in out["takes"]]
for name, cfg in cfgs.items():
    seqs = [core.extract(f, cfg) for f in frames]
    scaler = core.ChannelScaler.fit(seqs)
    scaled = [scaler.apply(x) for x in seqs]
    D = core.distance_matrix(scaled, 0.2)
    rep = core.evaluate_distances(D, labels, k=1, permutations=0)
    rep3 = core.evaluate_distances(D, labels, k=2, permutations=0)
    clf = core.TemplateClassifier(list(zip(labels[4:], seqs[4:])), core.ClassifierConfig(max_distance=99, min_margin=0))
    preds = [clf.classify(x) for x in seqs[:4]]
    out["configs"][name] = {
        "groups": list(cfg.groups), "deltas": cfg.deltas, "smoothing": cfg.smoothing,
        "trim_lengths": [len(core.trim(f, cfg.trim_threshold)) for f in frames],
        "seq_shapes": [list(x.shape) for x in seqs],
        "seq_sums": [float(np.abs(x).sum()) for x in seqs],
        "scales": scaler.scales.tolist(),
        "D": D.tolist(),
        "loo_accuracy": rep.accuracy, "confusion": rep.confusion.tolist(), "loo_accuracy_k2": rep3.accuracy,
        "predictions": [{"ranked": [[l, d] for l, d in p.ranked], "margin": p.margin} for p in preds],
    }

stream = s.rest(80)
for w in range(3):
    stream += s.word(w, start=len(stream) / 30)
    stream += s.rest(40, start=len(stream) / 30)
stream_json = [f.to_json() for f in stream]
seg = core.Segmenter()
seg.begin_calibration()
segs = [x for x in (seg.process(core.LipFrame.from_json(f)) for f in stream_json) if x]
out["stream"] = stream_json
out["segments"] = [[f.t for f in x] for x in segs]

dest = ROOT / "web" / "tests" / "fixtures" / "parity.json"
dest.write_text(json.dumps(out, separators=(",", ":")))
print(dest, dest.stat().st_size, "bytes;", len(segs), "segments")
