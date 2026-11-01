# HushCam: silent speech from your webcam (Windows)

HushCam is the Windows version of Hush. Windows can't read AirPods head motion, so the sensor here is your **webcam**. MediaPipe tracks your lips and mouth: 20 lip contour points, mouth geometry and 28 mouth/jaw blendshapes, at about 30 fps. You silently mouth words from a vocabulary you train yourself. HushCam decodes them and can type them into whatever app has focus.

It uses the same honest workflow as the Mac app: **Train → Evaluate → Decode**. Evaluate tells you whether the signal really separates your words before you rely on it.

## Run it

**Prebuilt (no Python needed):** on GitHub, go to **Actions → CI → latest run → Artifacts → HushCam-Windows**. Unzip it and run `HushCam\HushCam.exe`. Windows SmartScreen may warn because the app is unsigned. Click *More info → Run anyway*.

**From source** (Python 3.10–3.12):

```powershell
cd windows
pip install -r requirements.txt
python fetch_model.py          # downloads the 3.7 MB face model (checksum verified)
python HushCam.py
```

If the model is missing, the app downloads it on first launch to `%APPDATA%\HushCam`.

## Use it

1. **Camera.** Face the webcam with even light on your mouth. The preview draws the tracked outer lip (green) and inner lip (orange). Change *Camera* if you have more than one.
2. **Train.** Pick a condition (*Silent mouthing*, *Whisper* or *Normal speech*). Hold **Space** (in HushCam) or **Right Ctrl** (from any app), mouth the word shown, then release. Auto-advance cycles through the least-recorded words. Record 8–15 takes per word. Start and end each take with your mouth closed and relaxed. Also record **`_noise`** takes: smiling, yawning, swallowing, talking to someone. Anything closest to a `_` word is rejected.
3. **Evaluate.** This runs leave-one-out accuracy against a 500× shuffled-label null and gives you a p-value, a null histogram and a confusion matrix. *Feature ablation* tries every combination of lip geometry, contour and blendshapes, and ranks them.
4. **Decode.** Hold Right Ctrl and mouth a word, or turn on **Auto-detect**: click *Calibrate*, keep your mouth closed for 2 s, then just mouth words. Turn on **Type decoded words into the active app**, click into Notepad or a browser, and your silent words get typed there.

Data lives in `%APPDATA%\HushCam\` (`dataset.json`, `settings.json`).

## How it works

```
webcam ─► MediaPipe Face Landmarker (VIDEO mode, blendshapes on)
            ─► LipFrame: 5 geometry + 40 contour (centred on the mouth, de-rolled,
                         scaled by eye distance) + 28 mouth/jaw blendshapes
push-to-talk or auto Segmenter (RMS z-score vs calibrated resting mouth,
                                EMA, hysteresis, pre-roll and hangover)
            ─► trim to the moving part ─► smooth ─► (+deltas) ─► mean-centre
            ─► per-channel scaling ─► DTW (Sakoe–Chiba, normalised by path length and dimension)
            ─► nearest template per word ─► reject if `_` class / too far / ambiguous
            ─► transcript + SendInput (Unicode) into the focused app
```

The algorithm is the same as the macOS app's `HushCore`, ported to numpy. `tests/test_core.py` checks the vectorised DTW against a naive reference. It also tests every stage on synthetic mouth movements.

```powershell
python -m pytest tests
```

## Limits

- The vocabulary is personal and small. Lighting, camera angle and facial hair change the signal, so add fresh takes if accuracy drops.
- Global push-to-talk and typing into other apps don't work in apps running as administrator unless HushCam also runs as administrator. That's a Windows security rule.
