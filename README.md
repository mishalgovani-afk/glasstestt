# Hush

**Silent-speech input from AirPods head motion.** Hush is a macOS app that reads the motion sensors in AirPods Pro / Max (`CMHeadphoneMotionManager`). It learns what your jaw and head do when you *silently mouth* a small vocabulary of words, then decodes new mouthed words into text. It can optionally type them into whatever app is in front.

It also tests itself. Before you trust the decoder, the **Evaluate** screen runs leave-one-out cross-validation and a label-permutation test. These tell you whether the motion signal really separates your words, or whether you are fooling yourself.

> Honest framing: Apple doesn't expose the AirPods' speech-detecting accelerometer or inward mic. Hush only sees processed head motion at about 25 Hz. That catches jaw and head movement, not vocal-cord vibration. Small vocabularies that you train yourself are realistic. Open dictation is not.

## Get it

**Prebuilt:** every push builds `Hush.app` on GitHub Actions. Go to **Actions → CI → latest run → Artifacts → Hush-macOS** and unzip it. The build is ad-hoc signed, so the first time you open it, clear quarantine:

```sh
xattr -cr Hush.app && open Hush.app
```

**From source** (macOS 14+, Xcode 15+):

```sh
brew install xcodegen
xcodegen generate
open Hush.xcodeproj        # ⌘R
```

Core algorithm tests run anywhere Swift runs, Linux included:

```sh
cd Core && swift test
```

Hardware: AirPods Pro (any generation), AirPods Max, AirPods 3/4, or Beats with head tracking. Connect them as the Mac's audio output. Allow **Motion & Fitness** when asked.

## Workflow

| Screen | What you do |
|---|---|
| **Sensors** | Check the stream. You get live plots of acceleration, rotation rate and attitude change, plus the sample rate and a mic reference with on-device transcription. **Record Session** writes everything to disk for offline analysis. |
| **Train** | A word is shown. Hold **Space** (or **Right ⌥** from any app), mouth the word, and release. *Balanced prompting* moves to the least-recorded word on its own. Record 8–15 takes per word. Also record `_noise` takes: nods, head turns, swallowing. Anything whose label starts with `_` is a rejection class. |
| **Evaluate** | Choose channels (acceleration / rotation / attitude / gravity, ± deltas) and a condition filter, then run. You get accuracy against chance, a permutation p-value, a histogram of the null distribution, and a confusion matrix. **Channel ablation** runs every one of the 15 channel combinations and ranks them, showing which sensors carry the signal. |
| **Decode** | Use push-to-talk, or **auto-detect**: calibrate 3 s of stillness and just mouth words. Each segment is matched to your templates and accepted or rejected (too far, ambiguous, or noise). You can turn on **Type into frontmost app** for hands-free text entry. This needs Accessibility permission. |

The toolbar **Condition** (Normal / Whisper / Silent mouthing / Imagined) is stored with every take and session. That lets you run the real experiment: record the same words under each condition, then filter by condition in Evaluate.

## How it works

```
AirPods IMU ──► MotionFrame (25 Hz: user accel, rotation rate, attitude quat, gravity)
                   │
   push-to-talk ───┤ or MotionSegmenter: z-score vs calibrated noise floor,
                   │    EMA smoothing, hysteresis, pre-roll + hangover
                   ▼
            FeatureExtractor: trim quiet ends → per-frame channels
            (attitude & gravity relative to segment start) → moving-average
            smoothing → optional deltas → per-sequence mean-centering
                   ▼
            ChannelScaler (per-channel 1/σ over the training set)
                   ▼
            DTW (multivariate, Sakoe–Chiba band, path-normalised, early abandon)
                   ▼
            TemplateClassifier: mean of k nearest per word → reject if
            best is a `_` class, distance > max, or margin < min
                   ▼
            transcript / typed into the frontmost app (CGEvent unicode)
```

**Is it real?** `Evaluator` computes the DTW distance matrix once. It then measures leave-one-out accuracy and repeats the same procedure on 500 shuffled labelings, giving p = (1 + #null ≥ observed) / (N + 1). The scaler uses no labels, so fitting it on all data can't inflate accuracy relative to the null.

## Layout

```
Core/                       Swift package, no Apple-only APIs (builds on Linux)
  Sources/HushCore/         Geometry, MotionFrame, Features, DTW, Classifier,
                            Evaluation, Segmenter, Dataset/CSV
  Tests/HushCoreTests/      synthetic-signal tests for every stage
App/Sources/                macOS SwiftUI app
  Services/                 MotionService (CoreMotion), AudioService (AVAudioEngine +
                            Speech + CoreAudio device picker), SessionRecorder,
                            SystemInput (push-to-talk monitors, text injection)
  Views/                    Sensors, Train, Evaluate, Decode
project.yml                 XcodeGen spec
```

## Data

- Training set: `~/Library/Application Support/Hush/dataset.json`
- Sessions: `~/Documents/Hush/Sessions/<timestamp>-<condition>/`
  - `motion.csv`: `t,ax,ay,az,rx,ry,rz,qw,qx,qy,qz,gx,gy,gz` (t in seconds from session start)
  - `events.csv`: every take and decode, with start and end time, label and rejection reason
  - `audio.caf`: mic audio, if the mic was on
  - `meta.json`: condition, prompt, and `audioOffsetSeconds` to align audio with motion

## Tips and limits

- Keep your head still apart from the word. Head motion dominates the signal, which is why `_noise` training matters.
- Templates are specific to you and to a session. Taking the AirPods out and putting them back in can shift the signal, so add a few fresh takes.
- Picking AirPods as the **mic** switches them to the Bluetooth headset profile. Use the Mac's mic for the reference transcript.
- Whisper is a good, easier baseline. If whisper doesn't separate in Evaluate, silent mouthing won't either.
