# 03 - Perception and signal extraction

## Setup
- @mediapipe/tasks-vision PoseLandmarker (lite model) + HandLandmarker, WASM backend, `runningMode: 'VIDEO'`. Target 15-30 fps on a laptop, accept 10 on a phone.
- Model .task files downloaded at build time into /public/models and loaded from same-origin. No runtime hotlinking (supply-chain rule + offline demo rule).
- Rear camera on phones (`facingMode: 'environment'`), any camera on laptop. Mirror-flip overlay only for front camera.

## Compression rate (the keystone signal, build FIRST)
1. Per frame take pose landmarks 11 and 12 (shoulders). Signal s(t) = average of their y, in normalized image coords.
2. EMA smooth with alpha ~0.3.
3. Peak detection on the smoothed series: a peak = local max with prominence > 0.008 (tune on real video; expose as a debug slider) and refractory period 250ms (physical ceiling ~240/min, we cap sane range at 160).
4. Rate = peaks in trailing 10s window * 6. Report null until >=5 peaks collected. `compressionActive` = >=2 peaks in trailing 2s.
5. `recoilRatio`: for each compression cycle, (s_peak - s_trough_after) / (s_peak - s_trough_before) clamped 0..1; average over window. It is a PROXY for full chest recoil, and we call it a proxy on stage. We never claim depth in centimeters from monocular video.
6. Confidence: min visibility score across landmarks 11,12; if <0.5 for >1s, emit poseConfidence low, null all derived metrics.

Debug view (build alongside, it IS the M0 deliverable): live waveform of s(t) with detected peaks marked, current rate big, confidence bar. This chart also goes in the pitch deck.

## Hands-on-region (bleeding module)
No blood detection. The user is told to press the wound; we define ROI as the region where their hands settle:
1. In `pressure` state entry, wait for both hand centroids to be stable (variance < threshold over 1.5s) => lock ROI as bounding circle around them, radius ~1.5x hand span.
2. `handsOnRegion` = at least one hand centroid inside ROI. `handsOffMs` = continuous time both are outside.
3. If hands never stabilize in 10s, fall back to verbal-only coaching for this state (announce it).
Justification for judges: the killer behavior is releasing pressure to peek; hand presence is robust to lighting and skin tone in a way blood-pixel detection is not.

## Choking gesture (STRETCH, behind flag)
Both hand centroids within radius of pose neck midpoint (avg of landmarks 11,12 shifted up toward 0) for >1.5s => fact for triage suggestion only ("It looks like he might be choking. Can he speak or cough?"). Never auto-starts a protocol.

## Camera guidance
If zero poses detected for 3s: "I can't see the patient. Prop the phone so I can see his chest." If pose too small (shoulder distance < 0.08 normalized): "Move the phone closer." Emit via getCameraGuidance(), UI speaks it max once per 10s.
