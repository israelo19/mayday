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
