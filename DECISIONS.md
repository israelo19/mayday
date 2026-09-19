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
- **Sat 02:00** `CoachingEvent` gains two fields. `t` is the timestamp of the fact that
  triggered the line, so P3 can measure fact-to-audible latency without a second channel.
  `cooldownMs` is the engine passing docs/04's per-dedupeKey rate limit through to the queue.
- **Sat 02:00** docs/07 decisions 1, 2, 4 and 5 are landed as written. Blind lines are
  priority `critical`, dedupeKey `blind`, 20 s cooldown, logged as kind `system`. `Rule`
  carries `forMs` and `everyMs`. The hands-off rule fires above 1000 ms, not 1500, so P3 has
  room to measure the end-to-end number before anyone claims 1.5 s on stage.
- **Sat 02:00** Blindness is engine policy, not a per-rule predicate. The engine is blind when
  confidence is below 0.5, when the newest facts are more than 2 s old, or when perception has
  never reported and the state has been active 3 s. While blind only rules marked `blindSafe`
  may fire. The stale-facts case matters: a frozen number that keeps coaching is the one
  unacceptable state in principle 4, and a crashed perception loop produces exactly that.
- **Sat 02:00** `Rule` also carries `requires`, a list of fact fields that must be measured
  before the rule is even evaluated. Without it the rate rules would fire on the null rate that
  perception reports for the first few seconds of compressions.
- **Sat 02:00** Keyword collisions are handled by phrase-level, word-bounded, longest-first
  matching in `src/protocol/keywords.ts`, plus a test asserting every keyword in a state
  resolves to itself. `breathing normally` was dropped as a keyword: it is longer than
  `not breathing`, so it would have won on "he's not breathing normally" and routed a dying
  patient to the recovery branch.
- **Sat 02:00** `EventLogEntry` gains an optional `data` twin, machine readable, alongside the
  human-readable `detail`. The SITREP builder folds over `data` and never parses prose.
- **Sat 02:00** `SitrepMetrics` gains `unmeasuredMs`. Time the camera could not see is reported
  as unmeasured, never as a pause. Telling a paramedic "you stopped for 14 seconds" because the
  lens was covered is a false claim, and the handoff report is the one artefact that leaves the
  app.
- **Sat 02:00** `HandoffReport` is plain data. The seam sketch in docs/07 gave it a `toJSON()`
  returning a string, which would make `JSON.stringify(report)` doubly encode. P4 calls
  `handoffJson(report)` for the full report and `handoffQrPayload(report)` for the QR, which
  drops metric heartbeats and trims the timeline until it fits under 2000 characters.
- **Sat 02:00** `next` and `repeat` are global keywords handled by the engine in any state,
  after the state's own keywords get first refusal. `repeat` re-speaks the current state's
  lines, which is the cheapest recovery when a judge misses an instruction.
- **Sat 02:00** Test runner is vitest, no DOM environment needed because the engine is pure.
  `qrcode` added as the sanctioned exception from docs/07 decision 7, loaded with a dynamic
  import so the encoder never sits in the critical bundle. `tsconfig.test.json` typechecks
  `tests/` and is run by `npm run typecheck` after the app build.
- **Sat 02:00** The Red Cross conscious-choking URL in docs/02 returns 410 Gone. The choking
  machine cites the live adult/child choking page instead. The compressions state cites 2025
  AHA Guidelines Part 7, which is where 100 to 120 a minute and at least two inches come from;
  the hands-only pages do not state the numbers. All five cited pages were opened before they
  landed.
- **Sat 02:00** Machine diagrams are generated from the data by `npm run diagrams`, and a test
  fails when the committed `docs/protocol-diagrams.md` drifts from it.
