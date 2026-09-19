# Decisions

Questions the docs did not answer, resolved by taking the simplest option that keeps the
five principles in CLAUDE.md intact. Newest at the bottom. Times are EDT.

- **Sat 01:20** The context docs were at the repo root; CLAUDE.md and START_PROMPT expect
  `docs/`. Moved them (`git mv`), CLAUDE.md stays at the root.
- **Sat 01:25** Roles redefined for four implementers (docs/06's A/B/C/D become P1 Eyes,
  P2 Brain, P3 Mouth, P4 Face and ship) with singular file ownership, interface seams and a
  re-based clock, all in `docs/07-work-split.md`. A three-person draft existed for ten minutes.
- **Sat 01:30** Model files (`pose_landmarker_lite.task` 5.8 MB, `hand_landmarker.task`
  7.8 MB) are committed in `public/models` so a fresh clone runs with no network.
  `scripts/prepare-assets.mjs` downloads only if a file is missing. The WASM runtime is
  copied from `node_modules/@mediapipe/tasks-vision/wasm` into `public/wasm` (gitignored)
  on install, dev and build. Everything loads same-origin; nothing is hotlinked.
- **Sat 01:30** Latest toolchain as installed today: Vite 8, TypeScript 7, React 19,
  `@mediapipe/tasks-vision` 1.0.1. Nothing pinned older; nothing beyond react,
  tasks-vision, vite and dev tooling.
- **Sat 01:35** HTTPS in dev via `vite-plugin-mkcert` as START_PROMPT suggests. It needs
  the macOS password once. ngrok is the documented fallback. Phones get a certificate
  warning unless the CA is installed; clicking through is fine for the demo.
- **Sat 01:45** Metronome ticks are scheduled on the Web Audio clock with a 200 ms
  lookahead instead of firing oscillators from `setInterval`, so MediaPipe jank on the main
  thread cannot make the beat stutter. Accent every fourth beat. Independent of speech.
- **Sat 01:45** Frame loop uses `requestVideoFrameCallback` where available (Chrome,
  Safari) and `requestAnimationFrame` elsewhere. A frame is processed at most once per
  new video frame. `detectForVideo` uses the callback overload (no result copy).
- **Sat 01:45** GPU delegate first, CPU fallback, decided once at load and shown in the
  debug footer.
- **Sat 01:50** The waveform draws larger shoulder-y (chest pushed down) upward, so a
  compression reads as a peak, matching the peak language in docs/03.
- **Sat 01:50** Perception emits `PerceptionFacts` on every processed frame from M0 on,
  with `poseConfidence` populated and every derived metric `null`/`false` until M1. The
  full `Perception` interface from docs/07 exists now with no-op `setMode`, `lockRoi`,
  `unlockRoi`, `captureFrame` so P3's orchestrator and FakePerception compile against the
  final shape.
- **Sat 01:50** Camera auto-starts on page load (getUserMedia needs permission, not a
  gesture). Audio needs a tap, so the voice and metronome buttons call `unlock()` first.
- **Sat 01:50** `WebSpeechProvider` picks the best en-US voice by a small score (locale,
  known good voice names, local, default) and re-picks on `voiceschanged`. The priority
  queue is M1 (P2).
- **Sat 01:50** `start()` on the perception module is generation-guarded so React
  StrictMode's mount/unmount/mount in dev cannot leave two camera streams or two frame
  loops running.
- **Sat 01:40** `vite-plugin-mkcert` aborts the dev server when its one-time `mkcert -install`
  cannot get a sudo password (no terminal, or a teammate who declines). Dev HTTPS now defaults
  to `@vitejs/plugin-basic-ssl` (self-signed, zero setup, click through the warning once per
  device); mkcert stays available behind `MAYDAY_MKCERT=1`. Camera works on either because a
  secure context is about the https scheme, not certificate trust.
- **Sat 02:05 (P4)** docs/07 task 4 calls for ESLint's `no-restricted-imports` to stop
  perception/protocol/voice from importing `src/ai`. `typescript-eslint` hard-errors on our
  TypeScript 7 (`typescript-eslint does not support TS 7.0`, no released fix yet) — not a
  warning, it refuses to run at all. Rather than downgrade TypeScript for the whole team,
  `npm run lint` is a zero-dependency script (`scripts/check-ai-boundaries.mjs`) that greps
  guarded dirs for a value import (not `import type`) reaching `src/ai` and fails the build.
  Same intent, same command, revisit if typescript-eslint ships TS7 support before Sun 09:00.
- **Sat 02:10 (P4)** `src/flags.ts` and `src/ai/{vision,narration,dispatcher,index}.ts` added
  per docs/07 task 4: both stubs return hardcoded demo data and never touch the network;
  `DispatcherSim` is interface-only, P3 implements it in `src/voice`. Pushed to a `face` branch
  rather than straight to `main` — the team moved to one short-lived branch per role
  (`eyes`/`brain`/`mouth`/`face`) instead of docs/07's "main only" so four people editing
  disjoint paths stop stepping on each other's half-finished commits; merge to `main` when a
  milestone gate goes green, not on every commit.
- **Sat 02:40 (P1)** Compression rate is the median of the last five intervals between
  confirmed peaks, reported once five peaks exist in the trailing 10 s, capped at 160. docs/03
  says "peaks in 10 s x 6"; that count lags a change of pace by up to 10 s, the median reacts
  within five pushes, which is what makes a live correction feel immediate. Both numbers show
  on the eyes screen so the team can compare on real clips.
- **Sat 02:40 (P1)** Peaks come from a streaming hysteresis detector: a peak is confirmed once
  the smoothed signal has fallen `prominence` (0.008) below its running maximum, a trough once
  it has risen the same amount; peaks within 250 ms of the previous one are discarded. Same
  thresholds as docs/03, no lookahead, so the rate exists as the push happens.
- **Sat 02:40 (P1)** Blind gate: confidence below 0.5 for 1 s nulls every derived metric and
  emits the low value; recovery needs 300 ms of sustained good frames, so flicker around the
  threshold cannot delay blind mode. While sighted the emitted confidence never dips below 0.5.
- **Sat 02:40 (P1)** Camera guidance says "I can't see you", not "the patient": the pose the
  app needs is the rescuer's shoulders (a duffel has no pose). Guidance also covers darkness
  (mean frame luminance under 40 of 255) and distance from the shoulder span.
- **Sat 02:40 (P1)** Wound region: palm centres (wrist plus finger bases) rather than fingertip
  averages, ROI radius 1.5 x hand span with a 0.08 floor, hands undetected for 700 ms count as
  off (a hand lifted out of frame is also off the wound), no lock within 10 s -> `failed` and
  the orchestrator announces voice-only. The hand model runs only in `pose+hands` mode and the
  pose model drops to every other frame there.
- **Sat 02:40 (P1)** Replay harness: `?replay=<url>` or a file picked on the eyes screen plays a
  clip through the identical pipeline. Fixture clips are not committed yet; the team records
  them on the demo phone (M1 task 3).
- **Sat 02:40 (P1)** WebSpeechProvider gained a watchdog (P3 to keep or replace): on the demo
  iPhone an utterance sometimes never fires end/error, which left the M0 button stuck on
  "Speaking". Speech is also started synchronously inside the tap, which iOS requires.
