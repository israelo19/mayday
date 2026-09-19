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
  TypeScript 7 (`typescript-eslint does not support TS 7.0`, no released fix yet). Not a
  warning, it refuses to run at all. Rather than downgrade TypeScript for the whole team,
  `npm run lint` is a zero-dependency script (`scripts/check-ai-boundaries.mjs`) that greps
  guarded dirs for a value import (not `import type`) reaching `src/ai` and fails the build.
  Same intent, same command, revisit if typescript-eslint ships TS7 support before Sun 09:00.
- **Sat 02:10 (P4)** `src/flags.ts` and `src/ai/{vision,narration,dispatcher,index}.ts` added
  per docs/07 task 4: both stubs return hardcoded demo data and never touch the network;
  `DispatcherSim` is interface-only, P3 implements it in `src/voice`. Pushed to a `face` branch
  rather than straight to `main`. The team moved to one short-lived branch per role
  (`eyes`/`brain`/`mouth`/`face`) instead of docs/07's "main only" so four people editing
  disjoint paths stop stepping on each other's half-finished commits; merge to `main` when a
  milestone gate goes green, not on every commit.
- **Sat 02:20 (P4)** `vite-plugin-pwa` added (task 7, second pre-approved no-new-libraries
  exception alongside `qrcode`). Precache is app-shell only (`**/*.{js,css,html,svg}`); the
  MediaPipe WASM runtime and models are runtime-cached (`CacheFirst`) on first successful fetch
  instead, because `public/wasm` ships three WASM variants at ~11-12 MB each (~35 MB) and a
  browser only ever loads one — precaching all of them would triple first-load size for bytes
  most sessions never touch. `public/icon.svg` is a placeholder (red cross on black, on-brand
  colors) standing in for a real app icon; swap before Devpost screenshots.
- **Sat 02:20 (P4)** `npm run build` fails on this machine independent of anything in this repo:
  `vite@8`'s rolldown bundler can't find its native binding for this platform
  (`Cannot find native binding ... @rolldown/binding-win32-x64-msvc`). Confirmed pre-existing by
  stashing all changes and re-running against the unmodified `main` tree. The error's own
  suggested fix (delete `node_modules` + `package-lock.json`, reinstall) touches the whole
  team's lockfile, so it's flagged here rather than done unilaterally — whoever hits this next
  should try that fix and commit the resulting lockfile deliberately, not as a side effect of an
  unrelated change. `npm run typecheck` is unaffected and passes.
- **Sat 02:35 (P4)** Four screens (docs/05: LAUNCH, COACH, SITREP, HANDOFF) scaffolded in
  `src/ui/*Screen.tsx`, wired in `App.tsx` with hardcoded mock data (`src/ui/mockDemoData.ts`)
  standing in for `session.ts`/the real engine, which don't exist yet (P2). `App.tsx` now gates
  the M0 debug view behind `?debug=1` instead of rendering it unconditionally (task 3), so the
  four screens are what a fresh load shows. Fullscreen + Screen Wake Lock requested on the
  LAUNCH tap (a real user gesture); `navigator.vibrate` fires on CALL 911. All of this is
  throwaway wiring at the `session.ts` boundary only — expect to swap `mockDemoData` for real
  `EngineOutput`/`Sitrep`/`HandoffReport` once P2 ships, the screen components themselves
  shouldn't need to change shape much.
- **Sat 02:50 (P4)** Root cause of the Sat 02:20 build failure found: this machine's Node was
  20.16.0, below what `vite@8`/`rolldown` require (`^20.19.0 || >=22.12.0`) — npm silently skips
  an optional native binding when the package's `engines` check fails, rather than erroring, so
  it looked like a lockfile problem. Upgraded Node to 24.19.0 LTS and reinstalled; the refreshed
  `package-lock.json` now carries `libc` metadata for optional platform binaries that the older
  npm didn't write. `npm run dev` and `npm run build` both work now. Anyone still on Node <20.19
  will hit the same failure regardless of this lockfile.
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
- **Sat 02:40** Step guides (`src/ui/guide`) are hand-drawn SVG pictograms keyed by
  `machine.state`, one step per docs/02 line, captions verbatim and tested against
  docs/02. No video, no generated media: a bundled SVG works with wifi off, scales to any
  screen, and cannot drift from the guideline text. Choking has no guide until docs/02
  names its states. The compression figure and the rhythm trace read one beat clock
  (`beat.ts`), so a `beatOriginMs` from the metronome puts the picture on the sound.
- **Sat 02:40** `vitest` added as dev tooling (the plan in docs/07 already calls for it);
  tests live next to their module as `*.test.ts` and type-check through
  `tsconfig.test.json` so Node types stay out of browser code. `npm test` runs them.
- **Sat 03:05** Mayday is framed as coaching any medical emergency with a published bystander
  protocol, with one machine data file per emergency and a generic engine. CPR and severe
  bleeding are the hackathon build and the demo cases, not the product boundary. CLAUDE.md,
  README, docs/01, docs/02 and the docs/05 pitch notes now say so in one place each; the
  scope walls list the machines that ship this weekend instead of naming emergencies we
  skip. START_PROMPT is marked historical since M0 is done.
- **Sat 03:10 (P4)** Merged `main`'s `?guide=1` gallery (Ricky) into the same `App.tsx` as the
  P4 four-screen flow instead of picking one: `?guide=<key>` still opens `GuideGallery`,
  `?debug=1` still opens the M0 `DebugScreen`, and a plain load now shows LAUNCH -> COACH ->
  SITREP -> HANDOFF instead of the bare debug view. These were never actually competing —
  the guide gallery is a dev preview surface for protocol pictures (same category as
  `?debug=1`), not a default end-to-end flow, so nothing here overrides anyone's work.
