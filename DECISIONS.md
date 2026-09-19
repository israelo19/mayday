# Decisions

Questions the docs did not answer, resolved by taking the simplest option that keeps the
five principles in CLAUDE.md intact. Newest at the bottom. Times are EDT.

- **Sat 01:20** The context docs were at the repo root; CLAUDE.md and START_PROMPT expect
  `docs/`. Moved them (`git mv`), CLAUDE.md stays at the root.
- **Sat 01:25** Three implementers instead of four. Roles, file ownership, interface seams
  and the re-based clock are in `docs/07-work-split.md`.
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
