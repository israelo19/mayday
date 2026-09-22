# 03 - Perception and signal extraction

## Setup
- @mediapipe/tasks-vision PoseLandmarker (lite model) + HandLandmarker, WASM backend, `runningMode: 'VIDEO'`. Target 15-30 fps on a laptop, accept 10 on a phone.
- Model .task files are committed in /public/models and loaded from same-origin; `scripts/prepare-assets.mjs` downloads one only if it is missing. No runtime hotlinking (supply-chain rule + offline demo rule).
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
If no measurable shoulders for 3s: "I can't see you. Prop the phone so I can see your chest and shoulders." (the rescuer's shoulders are the signal, so the line addresses the rescuer; DECISIONS Sat 02:40). Too dark: "It's too dark. Turn on a light." Shoulder distance < 0.08 normalized: "Move the phone closer."; > 0.5: "Move the phone back a little." Emit via getCameraGuidance(); the session speaks it at most once per 10 s and only in the states that watch the rescuer.

## Who the camera watches
The camera sees the patient and the helper. The coaching signal is the HELPER: shoulder-y of the person doing compressions, palms of the person pressing the wound. The patient is what a scene classifier (docs/04 item 7) would look at; nothing in the coaching loop measures the patient.

Two people are usually in frame: the patient lying flat and the rescuer kneeling over the chest, or a second bystander holding the phone. The pose model therefore runs with `numPoses: 2` and `pickRescuer()` in signal.ts chooses the pose to measure: shoulders visible, hips below the shoulders by at least half a shoulder span (kneeling or standing), and the same person as last frame while that holds, so a swap between two candidates cannot fake a compression. A patient lying flat scores near zero and is never measured. The perception matrix row "second person lying in frame" (docs/perception-tests.md) is the check for this on the demo phone, fps included.

A handheld phone adds camera shake to the shoulder signal. The guidance and the machines both say to put the phone down; if a second bystander holds it, the rate is still measured but the perception matrix row for it is the honest number.

## Scene hint (on-device, docs/04 item 7's offline half)
`PerceptionFacts.sceneHint` is the camera's one word to triage: `'person_down'` or null. It is a cue, never a route.

- **Person down (shipped).** `PersonDownDetector` in signal.ts: a measurable pose (shoulders past the confidence gate, hips visible) whose shoulder-to-hip line is within 25 degrees of horizontal for 2 s. Kneeling reads as 70 degrees or more, so a helper bending in does not trip it, and the hold time filters a crouch. Runs on the pose the module already measures, so it costs nothing extra on the phone.
- **What the session does with it.** In `triage.listening`, with no suggestion open, it becomes the same Yes/No suggestion a heard phrase earns (`SCENE_HINTS` in src/protocol/phrases.ts): the app says "It looks like someone has collapsed. Say yes, or tap." and shows "Looks like collapsed? Yes / No". Yes routes by the keyword `collapsed`, which triage already accepts; No, or silence, and the camera waits 30 s before asking again. The engine never moves on the hint itself. `?fake=1` has a "person down" switch.
- **Hands at throat (not shipped).** The `ChokingGestureDetector` exists but runs only in `pose+hands` mode (bleeding states) and reaches only the debug screen. Tracking hands during triage costs a second model per frame, which is the kind of load that froze the phone on Sat 05:35; it stays off until the perception matrix has a number for it.

## What the camera can honestly tell a bystander (roadmap)
Live today, all on-device: compression rate and activity, recoil proxy, hands on or off the wound, blind and camera guidance, and the person-down cue above. Each one is a measurement the machine data turns into a line, or a question the human answers.

Next in order of value, each behind the same rule (a cue earns a question, never an instruction):
1. **Hands at throat** in triage, once hand tracking during triage has a phone fps number.
2. **Rescuer fatigue**: a rate that drifts down over a minute is a swap cue earlier than the fixed 120 s reminder. Machine rule on existing facts; no new perception.
3. **One frame to a vision model** for the unclear case (docs/04 item 7): closed label set, same suggestion row, flag off by default.
4. **Hand placement on the chest** needs the patient's pose and the rescuer's hands at once; two poses per frame froze the phone, so this waits for a Worker or a lighter model.

Never: blood-pixel detection (lighting and skin tone make it lie), depth in centimetres from one camera, any label that reads as a diagnosis. The bystander supports the patient; the app supports the bystander with a beat, a picture, a correction and a question, and the camera stays on the helper's hands.
