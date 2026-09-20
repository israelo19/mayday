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
- **Sat 02:05** The no-network grep test from docs/07 task 9 would have failed P3's own M4
  work, because docs/04 plans ElevenLabs streaming TTS inside `src/voice`. One exemption now
  exists, `src/voice/providers/`, on the grounds that the default speaker is local and the
  upgrade falls back to it. The voice queue may not import from that directory, so the local
  default cannot quietly become a networked one.
- **Sat 04:15 (P1, `listen`)** P2's engine, machines, SITREP and tests were merged from
  `recovered/p2-brain`. Two seam mismatches resolved on merge: `CoachingEvent.t` is optional
  (the engine always sets it; voice-internal lines and the guide gallery's demo events do not,
  and the queue falls back to the newest fact it was told about), and the reflex-path boundary
  test now skips test files and type-only imports, the same policy as `npm run lint`.
- **Sat 04:20 (P1, `listen`)** `web/session.ts` is the orchestrator from docs/08 and docs/09,
  with one addition each: camera guidance is spoken only in the states that watch the rescuer,
  at most once per ten seconds, never the "I can't see you" variant (the engine's blind rule
  owns that line); and a hands-never-settled line is spoken once per bleeding state. Neither is
  a medical instruction. "Ambulance is here" is a standing session action (`finish()`), so a
  state's own `ambulance here` keyword is not listed a second time as a button twin.
- **Sat 04:30 (P1, `listen`)** The live screen is camera-first: the preview fills the viewport
  and every control floats on it (the team's redesign direction). Step-guide pictures render
  inside the instruction card at a fixed height. When a state has a picture, the guide caption
  carries the engine's correction and no banner repeats it; without a picture the banner does.
  `?fake=1` runs the whole loop on the pretend rescuer with floating controls.
- **Sat 03:40 (P4)** The phone runs Mayday through Expo Go as a shell, not a port. Expo Go
  runs React Native only, and the eyes and voice are browser APIs (MediaPipe WASM,
  getUserMedia, Web Audio, Web Speech), so `mobile/` is a full-screen WebView around the same
  web app plus what a WebView cannot do: speech on the phone's own engine (a WebView has no
  usable Web Speech API; Android's object exists and never speaks), haptics on iOS (no
  vibrate API), keep-awake, and camera, microphone and location granted to the page because
  the app holds them. The shell holds no screens, no protocol and no instruction text; the
  CLAUDE.md scope wall now reads "no native app logic" and names this exception. The page
  and the shell share one protocol file, `src/platform/bridge.ts`; the page side is
  `src/platform/shell.ts`, which installs nothing outside the shell. Speech reaches the
  shell as a `SpeakerProvider` (`ShellSpeakerProvider`) handed to the voice queue through the
  docs/07 `setProvider()` seam, chosen by shell identity, never by capability sniffing, for
  the Android reason above. Voice in stays off in the shell: WebViews have no
  SpeechRecognition and native recognition needs a development build, not Expo Go. Buttons
  carry the demo there, which docs/04 already requires.
- **Sat 03:40 (P4)** The page reaches the phone through Expo's own tunnel. WebViews refuse
  self-signed certificates on both platforms (Android cancels the load, iOS trusts only what
  the system trusts) and the camera needs a secure context, so the LAN address that Chrome
  accepts after a warning is no use to the shell. `npm run mobile:tunnel` builds the web app
  with `base: '/app/'` (`MAYDAY_VIA_EXPO=1`, plain http, no HMR), serves the build locally
  with `vite preview`, and starts `expo start --tunnel`; `mobile/metro.config.js` proxies
  `/app/*` to that server through Metro's `enhanceMiddleware`, so the same
  `https://*.exp.direct` URL Expo Go loads the shell from serves the page over a real
  certificate. `mobile:tunnel:dev` swaps in the Vite dev server for iteration (reload the
  phone by hand; the HMR websocket cannot cross Metro's proxy). The proxy only wins because
  the shell declares `platforms: ['ios', 'android']`: with web listed, Expo's dev server
  answers every unknown path with its own web index before any config middleware runs. A
  static copy of the build under `mobile/public` was tried and rejected for the same reason.
  `expo login` is required once because both Expo tunnel backends sign the URL with the
  account. `EXPO_PUBLIC_MAYDAY_WEB_URL` points the shell at the deployed site instead. The
  default is a production build on purpose: the demo runs the bundle the deploy ships.
- **Sat 03:40 (P4)** `src/platform` is guarded by `npm run lint` like perception, protocol and
  voice: the bridge is a reflex path and may never import `src/ai`. `mobile/` has its own
  `package.json` and lockfile rather than an npm workspace so the root install stays what it
  was for the three people who never touch the phone; `npm run mobile:install` is opt-in.
- **Sat 04:30 (P4)** `src/` is the engine, `web/` is the browser app. `src/App.tsx`, `main.tsx`,
  `index.css` and `ui/**` moved to `web/` with `git mv` (history follows); `src/` keeps types,
  flags, protocol, sitrep, perception, voice, ai and platform. The frontend moved rather than
  the engine because every role branch adds files under `src/` and a moved `src/` would
  mis-land all of them; `web/` was new, so only `App.tsx` could conflict. Vite's root stays the
  repo root (`public/`, `dist/`, `.do/app.yaml` and the PWA globs assume it); only the script
  tag in `index.html` changed. Imports across the seam are relative (`../../src/...`), not an
  alias: it is fifteen lines, twelve of them `import type`, and an alias would need matching
  entries in tsconfig, vite, vitest and metro. `web/ui/guide` sits at the same depth as
  `src/ui/guide` did on purpose: `guides.test.ts` reads docs/02 by a relative URL. The three
  test globs (`src`, `web`, and P2's `tests/` when it lands) all run from the repo root because
  the boundary tests resolve paths from the CWD. `DebugScreen` now takes any `SpeakerProvider`
  (P1's file, two lines) so the shell's speaker reaches `?debug=1` too; `App.tsx` picks
  `ShellSpeakerProvider` when `shellInfo()` is non-null and `WebSpeechProvider` otherwise.
  `web/session.ts` is still to be written once `p2-brain` is on main.
- **Sat 05:00 (P4)** Expo Go dropped; the phone runs the PWA. On the current SDK, Expo Go
  sends a signature request with every load and the CLI can only answer it with a
  certificate fetched for a logged-in Expo account, on the laptop and in Expo Go on the
  phone; no flag, offline mode or LAN setting avoids it (checked in the CLI source, and
  confirmed on the demo phone: "You need to be signed in to Expo Go and Expo CLI"). Ricky
  does not want an Expo account for a hackathon demo, and neither should a judge. So the
  shell (`mobile/`), its bridge (`src/platform/`), the tunnel script and the `mobile:*`
  scripts are removed in full rather than left as dead code; the Sat 03:40 entries stay as
  history. What replaces them is what docs/07 planned from the start: Chrome on the Android
  demo phone, "Add to Home Screen" through `vite-plugin-pwa`, and a QR of the LAN URL that
  `npm run dev` and `npm run preview` now print under Vite's URL list (`qrcode`, the package
  P2 already sanctioned). Chrome has the camera, Web Speech, vibrate and wake lock the app
  needs; the shell's only extras were native speech and haptics on iOS. The `src` versus
  `web` split (Sat 04:30) stays: it was about ownership and a clean engine, not about the
  shell. Capacitor is the route if a native shell is ever wanted: the page ships inside the
  app, so no server, certificate or account, at the cost of Xcode and Android Studio builds.
- **Sat 05:20 (P1, `listen`)** Merged main's `src`/`web` split into `listen`. The session and
  the live screens landed under `web/` (`web/session.ts`, `web/ui/live/**`) because they are the
  browser app: they own the clock, geolocation and the DOM, and P4's Sat 04:30 entry reserved
  that path for them. `src/` still holds only engine modules. P2's `tests/` suite runs from the
  repo root alongside the `src` and `web` globs.
- **Sat 05:40 (P4, touching P3's providers with their seam)** ElevenLabs reaches the phone
  through Vite itself. `src/voice/providers/devproxy.mjs` now exports `createKeyProxy()`, and
  `vite.config.ts` mounts it at `/api/proxy` on the dev and preview servers whenever
  `.env.local` holds `ELEVENLABS_API_KEY`. The reason is mixed content: an https page on the
  phone may not call an http port on the laptop, so the separate proxy process could only
  ever serve laptop Chrome. Same origin also means the browser code needs no dev-only
  `baseUrl`, so `ElevenLabsProvider`'s default of `/api/proxy` is what runs everywhere, and
  the DigitalOcean Function takes over the path unchanged (docs/04 TODO 1). The proxy exposes
  exactly two routes, TTS and the dispatcher session, not the API.
- **Sat 05:40 (P4)** `?flag=` accepts a comma list. One phone URL has to flip the ElevenLabs
  voice and the ElevenLabs dispatcher together for the judged run; typing two URLs on a
  phone under stage lights is how a demo dies. Defaults stay OFF and nothing persists.
- **Sat 05:40 (P3 task 7 done by P4)** The live dispatcher is ElevenLabs Agents over a raw
  WebSocket, no SDK: the `@elevenlabs/client` package would be a fourth library exception and
  the protocol is a dozen JSON event names. The agent id stays server-side: the proxy trades
  it for a signed session URL, the same way the key never leaves the proxy. The agent was
  created by script (`scripts/create-dispatcher-agent.mjs`) rather than in the dashboard so
  its prompt, voice and PCM16/16 kHz formats are in the repo; English agents must use
  `eleven_flash_v2`, the API rejects v2.5. Its opening line arrives as audio without an
  `agent_response` event, so the session route returns the configured text for the panel.
  Fallback to the scripted dispatcher happens on every miss, including a refused mic: a
  call-taker who cannot hear is worse than the script.
- **Sat 05:40 (P4)** Voices are code, not config (`src/voice/providers/voices.ts`): Brian for
  the coach, Sarah for the dispatcher, both ElevenLabs premade voices present in every
  account, so every laptop and the deploy sound the same. The coach step line is now spoken
  on entry in `App.tsx` even on mock data, because otherwise the only audible ElevenLabs
  moment on the phone was the SITREP read-aloud; session.ts replaces that effect with the
  queue.
- **Sat 05:55 (P1, `listen`)** The Sat 05:40 flag wiring moved out of `App.tsx` into
  `web/providers.ts` and into the session: `createVoice({ provider: createSpeaker() })` puts the
  flagged ElevenLabs voice under the queue (so cooldowns, preemption and echo suppression still
  apply to it), and `createSession({ dispatcher })` lets the flagged agent wrap the scripted
  call-taker with the panel's status chip and the bystander transcript fed back into the
  snapshot. The ElevenLabs cache is warmed on the first tap with every canonical line from the
  machines instead of the mock steps. Nothing about the flags' defaults changed.
- **Sat 06:20 (P1, `polish`)** Understanding is deterministic and lives in
  `src/protocol/language.ts`: a light stemmer (choke, choked, choking are one word), one letter
  of recognizer slack between two stems of five letters or more (never on answer words like
  "no", "not", "shot"), apostrophes dropped, word-bounded phrase matching, longest phrase first.
  The engine and P3's listener share it, so an interim result routes the same way a final does.
  No model, no network: this is still keyword spotting under docs/01's threat model.
- **Sat 06:20 (P1, `polish`)** Triage vocabulary is data in `src/protocol/phrases.ts`, one
  block per emergency, and `triage.ts` generates its transitions from it. Keywords must be
  distinct after stemming; the linter refuses two that are not. When nothing matches, weighted
  cue words score the sentence and the session asks "It sounds like he is choking. Say yes, or
  tap." The route is entered only on yes, by its first keyword, so the engine still moves on a
  keyword or a tap and nothing free-text ever selects a protocol. Suggestions exist in triage
  only and expire after twenty seconds. An LLM could later propose the same suggestion through
  `src/ai` behind a flag; the confirmation step is what would make that acceptable.
- **Sat 06:20 (P1, `polish`)** The listening chip says "Speaking, then listening" while the
  app talks, because the mic is muted for echo then (docs/09) and a judge who answers over the
  prompt would otherwise believe the app ignored them.
- **Sat 06:20 (P1, `polish`)** The instruction card shrinks to its caption once a state has
  been read (four seconds plus four and a half per line), reopens while a correction is active,
  and toggles on tap. The camera is the product; the card was hiding the rescuer.
- **Sat 06:20 (P1, `polish`)** Choking has pictures. docs/02 now lists the choking states
  verbatim from `src/protocol/machines/choking.ts`, which is what lets the guide tests hold
  every caption to the doc. Same-target keyword edges collapse to one arrow in the generated
  diagrams so the vocabulary does not bury the structure.
- **Sat 05:20 (Ricky, `flow`)** Repo-wide flow check. Typecheck, 204 tests, the AI boundary
  script and the production build were green before and after. Fixed: the choking machine
  never said "call 911" (docs/02 requires it in the first two states of every medical
  machine, and the test exempted choking); it now has a `call_911` state second and a
  `handoff` terminal, with `resolved` no longer terminal so "Ambulance is here" lands on a
  handoff line instead of "wait for the ambulance". The machines test no longer exempts
  choking. `tests/boundaries.test.ts` gained a principle 5 check: no `tel:` link and no
  telephony API anywhere in `src` or `web`, and the live screen must label the dispatcher
  SIMULATED. The 911 call is a button and a simulated call-taker for the demo only; the app
  never dials a real line, and now a test says so.
- **Sat 05:20 (Ricky, `flow`, P1's area, needs the phone check)** The pose model now runs with
  `numPoses: 2` and `pickRescuer()` in `signal.ts` decides which pose to measure: shoulders
  visible, hips at least half a shoulder span below the shoulders (kneeling or standing), and
  the same person as last frame while that holds. Reason: the camera sees the patient lying
  flat and the rescuer kneeling over the chest; with one pose the model could lock onto the
  patient, the shoulder signal goes flat and the app nags "don't stop" at someone who is
  pushing. Pure function, four tests. Cost is a second landmark pass per frame; the
  perception matrix row "second person lying in frame" is where the phone fps gets written
  before the demo. If fps drops under 10, drop `numPoses` back to 1 and keep the selector.
- **Sat 05:20 (Ricky, `flow`)** The first-cut mock screens (`CoachScreen`, `SitrepScreen`,
  `HandoffScreen`, `mockDemoData`) were imported by nothing since the live app landed and are
  deleted; `LaunchScreen` stays. The per-state `call911` flag in the machine data was read by
  no UI; the CALL 911 button now pulses in those states. It still opens the simulated
  dispatcher and nothing else.
- **Sat 05:20 (Ricky, `flow`)** Docs caught up with the merges: README no longer says the app
  runs on mock data; docs/09 points at `web/providers.ts`, drops the "restore the engine"
  section and the "no fact timestamp" note; docs/latency is unblocked; docs/04 lists the real
  global keywords and says plainly that no `src/ai` stub is wired yet; docs/03 and docs/07
  match the code's "I can't see you" guidance; docs/07 records the branch-per-role practice;
  docs/02 names the choking states and the engine's real size; pitch-authority has today's
  numbers. Still open: `.do/app.yaml` has no `/api/proxy` function, so both ElevenLabs flags
  fall back to the script on the deployed URL (docs/04 TODO 1).
- **Sat 05:20 (Ricky, `flow`)** Emergency classification by camera is designed, not built:
  docs/04 items 7 (one frame, closed label set, picks a pre-written triage line and highlights
  a button, the human confirms, never transitions) and 8 (a missed transcript mapped to one of
  the current state's keywords, confirmed the same way), plus the on-device scene hint in
  docs/03. Framing rule written down in docs/03: the camera sees the patient and the helper,
  the coaching loop measures the helper, a classifier looks at the patient. Provider choice
  is a proxy route: Gemini for the sponsor opt-in, Featherless (OpenAI-compatible, image input
  on some models) as a one-line swap; Featherless is not a listed sponsor.
- **Sat 05:55 (Ricky, `flow`)** The simulated dispatcher no longer loops. The scripted
  call-taker acknowledges once after its four questions and then stays quiet on the line;
  the panel folds itself when the script is done (header reads "On the line · Show") and
  stops offering reply buttons, so the coaching card underneath is visible again; the open
  panel is capped at 48vh and scrolls. A `call911` state entered while the call is already
  open is skipped on the next tick with a system log line: telling someone on the line to
  call is noise, and the state's lines go stale unplayed when the engine moves on. None of
  this changes what the machines say; it changes when the phone repeats itself.
- **Sat 06:15 (Ricky, `mobile-polish`)** The live screen's top is one column in normal flow
  (chip row, metric, dispatcher panel) instead of three absolutely positioned boxes, so the
  folded dispatcher can no longer sit on the pressure timer. Buttons are one size: NEXT and
  "Ambulance is here" 50 px and equal width, twins 44 px, the picture strip 18vh. The mic
  chip is a button when the mic is off: it shows the recognizer's error code (`onError` on
  `VoiceInOptions`) and tapping it calls `session.retryListening()`, because iOS Safari only
  grants recognition that starts inside a user gesture and the first attempt may have raced
  the speech that started in the same tap. The reason lands in the log as a system line.
- **Sat 06:15 (Ricky, `mobile-polish`)** The camera's first triage cue ships: `sceneHint:
  'person_down'` on the facts, from a torso-angle detector on the pose the module already
  measures (25 degrees from horizontal, held 2 s, hips visible). In triage it earns the same
  Yes/No suggestion the polish branch built for unmatched speech, with its own line ("It looks
  like someone has collapsed. Say yes, or tap."), and yes routes by `collapsed`. The engine
  never moves on the hint; a rejected or ignored hint waits 30 s. Hands-at-throat stays off
  (a second model per frame is what froze the phone). Roadmap in docs/03.
- **Sat 06:30 (Ricky, `mobile-polish`)** Dispatcher replies answer the question asked.
  `repliesFor()` in `src/voice/dispatcher.ts` maps each scripted question to its answers from
  the SITREP: the address for "where", the emergency and how long ago for "what happened",
  and per-protocol patient-status statements for "is he awake, is he breathing" (two choices
  where the app cannot know, so the bystander picks the true one). The last script line and
  the acknowledgement offer nothing, which is what folds the panel. Before this the panel
  offered the same four read-aloud lines under every question, so the address came up again
  after "what happened" and nothing answered the status question.
- **Sat 17:55 (P4)** iPhone runs the PWA fullscreen from the home screen, not a Simulator or
  a WKWebView shell. The Simulator has no camera and a WKWebView has no SpeechRecognition,
  and Sat 05:00 already dropped the shell. `index.html` carries the three Apple meta tags
  (iOS before 16.4 ignores the manifest's `display`) and a PNG `apple-touch-icon`, because
  Safari ignores SVG there and would screenshot the page for the icon. The manifest sets no
  `start_url`: `vite-plugin-pwa` defaults it to `/`, which made an icon launch drop the
  `?flag=` the phone was added with. Adding the icon from the flagged URL is the phone's
  bookmark; flags still do not persist in storage.
- **Sat 06:40 (Ricky, `review`)** The CPR beat that "never stops" was a hidden page, not a
  missed stop(): the session and voice seams already stop the metronome on handoff and restart
  (tests green), but a backgrounded tab throttles `setInterval` to once a second or less while
  the audio clock keeps running, so each firing scheduled every missed beat at once, ten at a
  time, with nobody looking at the screen to end it. `Metronome` now pauses on
  `visibilitychange` hidden, resumes on visible if it was running, and when the interval falls
  behind the audio clock it skips the missed beats instead of bursting them. The beat belongs
  to a screen someone is looking at; the wake lock keeps that screen on during coaching.
  `src/voice/metronome.test.ts` drives the class on a fake audio clock.
- **Sat 06:50 (Ricky, `review`)** The camera's work was invisible outside four states, so the
  live screen now says what the eyes are doing. `SessionSnapshot.eyes` (status, fps, rescuer in
  view, wound-region state, the last thing the camera did) feeds an eyes chip under the mic
  chip; a camera that is refused or missing gets a red "Camera off. Coaching by voice and
  buttons." banner in every phase (principle 4 covered triage only by accident before: a denied
  camera was a black screen). The engine logs a `fact_transition` when a `fact` trigger moves
  the machine, and the session speaks `CAMERA_SAW_LINE` ("I can see you pushing.") at
  correction priority, dedupe `camera-saw`; it is about the camera, never the card's
  correction. The compression trace finally gets the bystander's real shoulder series and
  peaks (docs/05's wiring, never passed before); `?fake=1` samples are shifted from `Date.now()`
  to `performance.now()` in LiveApp only. Camera-sourced suggestions carry an eye icon.
- **Sat 06:50 (Ricky, `review`)** A correction leaves the card the moment its rule stops
  holding (`clearResolvedCoaching` re-evaluates the rule's `when` on every fact), not after an
  8 s timer: "Don't let go!" next to a mint "pressure held" was the screen contradicting
  itself. The top column (chips, metric, dispatcher panel) is not drawn over the handoff, which
  it used to cover. The handoff timeline turns state ids into step titles ("CPR: Hand position")
  and keeps recognizer errors and dispatcher plumbing in the log but off the paramedic's screen.
  The launch screen names the app, says the camera is about to watch, and labels the demo's
  simulated 911 call.
- **Sat 06:55 (Ricky, `review`, from the first iPhone run)** Two things the phone showed. The mic
  chip read `service-not-allowed`, which is WebKit's code for the OS speech service, not the
  site permission: Siri & Dictation off, the Speech Recognition privacy toggle denied for
  Safari, no internet for the recognizer, or a home-screen app, which iOS gives no recognizer
  at all. The chip now names the fix (`voiceOffLabel` in `web/ui/live/hints.ts`, tested) and
  the README carries the iPhone caveat: demo voice in Safari itself. And triage put the
  question card and three buttons over the camera the instant the eyes opened. Triage now
  opens camera-first for three seconds (`TRIAGE_LOOK_MS`, `isLooking`): the person-down
  detector needs two seconds of a still pose and the spoken prompt takes about as long, so a
  "Looking at the scene" card stands in for the question until a tap, a suggestion from the
  camera or the mic, the timer, or a missing camera ends it. Voice routes throughout, the tap
  is one, so docs/05's zero-navigation launch still holds. The eyes chip reads "Looking at the
  scene" or "Someone in view" in triage instead of "Watching you", and "Saw: a person lying
  still" while the camera's own suggestion is up.
- **Sat 06:58 (Ricky, `review`)** Three bugs the eyes commit left on the table. (1) `CAMERA_SAW_LINE`
  was correction-priority, so the voice queue played "I can see you pushing" *before* the
  remaining "Push hard and fast" line; it is narration now, after the state's own lines, and
  the chip still shows what the camera did. (2) `matchKeyword` treated "it's not safe" as
  `safe` and "he's not coughing" as `coughing` because a short keyword is a substring of its
  negation. A keyword that does not itself start with no/not/never/can't/don't is skipped
  when that word sits immediately before it; "not breathing" and "can't cough" are unchanged.
  (3) Idle-before-start was reported as `eyes.status: 'off'`, so the new camera-first triage
  look flashed the question card for one paint. Idle is `starting`. SITREP also claimed
  "I have not stopped for more than ten seconds" (and, with the fake rescuer still oscillating,
  "I started CPR") in `scene_check`: `cprStartedAt` is the compressions state entry, and the
  pause line only speaks after that.
- **Sat 07:10 (Ricky, `review`)** The microphone prompt was appearing after the looking card, not
  on I NEED HELP. CameraView's getUserMedia is video-only and runs in useEffect (after the
  tap). SpeechRecognition.start raced the triage prompt in the same turn, so iOS dropped it
  and the next tap (the looking card) was what finally asked. The launch tap now calls
  `primeMediaPermissions()` (one getUserMedia for audio and video, tracks released so the
  live camera can reopen them), `unlock()` speaks the silent utterance before waiting for
  voices, and `listen()` runs before `engine.start()`.

- **Sat 07:40 (Ricky, `review`, second iPhone run)** "Voice only reacts to 'not breathing'" was
  WebKit's continuous mode: iOS and macOS Safari send interim results only, each one the whole
  utterance so far, and no final until the session stops, while the listener handed only finals
  to the app. Keywords still routed (they are spotted on interims); the chip text, the user log
  line and the "sounds like X?" suggestion, all gated on finals, never happened. `src/voice/in.ts`
  now treats an interim unchanged for `INTERIM_SETTLE_MS` (1.2 s) as the sentence, flushes an
  unsettled one on `end`, skips a later identical final, shows interims on the chip through
  `onInterim`, and fires a keyword once per occurrence by comparing a grown transcript with the
  words that were already there (a cumulative transcript used to re-fire an old keyword after
  the 1.5 s window, which could walk a state ahead on words said earlier). The replay is
  `in.test.ts`, "a recognizer that never sends a final". Also: `?trace=1` (web/trace.ts, the
  `/__trace` sink in vite.config.ts, `micTrace` on the session) posts every recognizer event, mic
  status, transcript, speaking state and JS error from a phone to the dev server log, because a
  phone has no console the laptop can read.
- **Sat 07:55 (Ricky, `review`, from the first `?trace=1` run on the iPhone)** The trace
  confirmed the WebKit diagnosis on the device (interim-only, cumulative transcripts; the
  settle logged "Choking" 1.2 s after the last interim and the chip showed words live) and
  exposed the bigger loss: the app spoke for 37 of the run's 45 seconds, and the time gate
  dropped everything said meanwhile. On a phone the person talks over the coach; that is the
  normal case. The gate is now keyword-level: while the app speaks and for the 700 ms tail,
  only a keyword the app itself just said is held back (its own words are the only echo the
  mic can hear), the sentence is shown on the chip but not logged (an echo of our prompt must
  never become a "sounds like" suggestion), and any other keyword routes. A held-back keyword
  is judged again once the app is quiet. docs/09 and docs/10 say so; `in.test.ts` holds it.
- **Sat 08:40 (Ricky, `scene-assessment` worktree)** The scene layer, docs/11 tiers 1 and 2,
  built as one seam per principle. On-device: `SceneTracker` (`src/perception/scene.ts`) boxes
  every pose, reads lying or upright from the torso angle, and counts stillness by following
  box centres across frames; the overlay draws a dashed box and a word per person, and the
  facts carry `scene`. Cloud, episodic: `src/ai/assess.ts` sends one 640 px frame with a
  closed-vocabulary question and parses the answer into `SceneAssessment` (label, one
  sentence, the patient's box, awake/breathing/pain cues, materials); anything outside the set
  is `unclear`, a sentence that coaches is dropped, a box is read on the 0 to 1000 scale, or in
  pixels for Qwen2.5-VL. The session sends a frame 1.2 s into triage while facts are fresh,
  once more after 6 s if the answer was unclear, never a third time; the label earns the same
  Yes/No suggestion a heard phrase does, spoken from `ASSESSMENT_HINTS` in phrases.ts, and the
  engine never moves on it. The model's sentence is shown, never spoken. A camera question the
  person says no to waits the docs/03 30 s before either camera source asks about that route
  again. The proxy gained `POST /vision/assess` on Featherless (OpenAI-compatible chat
  completions, the image as a data URL part); development default `Qwen/Qwen2.5-VL-7B-Instruct`
  (small, warm, answers with boxes), `Qwen/Qwen3-VL-8B-Instruct` or `google/gemma-3-27b-it` for
  the judged run via `FEATHERLESS_VISION_MODEL`. Gemini would be one more adapter in the same
  route. Behind `?flag=sceneAssess`; `?fake=1` gets a canned assessor driven by a "model says"
  control. The prompt lives in TypeScript so `scripts/assess-frame.mjs` runs the app's exact
  question on a photo. Cards, buttons and NEXT are untouched: the model proposes, the human
  disposes, and the tap path is the same as before for anyone who prefers it.
- **Sat 19:40 (Ricky, `gemini-api` worktree)** Gemini is the scene model, the adapter DECISIONS
  Sat 08:40 said would be one more row in the same route. `devproxy.mjs` now holds a
  `VISION_PROVIDERS` table instead of a Featherless constant: both providers speak OpenAI chat
  completions, so one request body serves both and only the URL, the key and the model name
  differ (Gemini through `v1beta/openai/chat/completions`, ai.google.dev/gemini-api/docs/openai).
  `resolveVisionProvider()` picks one, and the Vite mount, the standalone server and
  `scripts/assess-frame.mjs` all call it, so they can never disagree about which model ran.
  Order: `VISION_PROVIDER` if it names one with a key, else Gemini, else Featherless, else
  nothing and the route 404s as before. Default `gemini-3.6-flash`, overridable by
  `GEMINI_VISION_MODEL`. Not one line of `src/ai/assess.ts` changed: it already asked for boxes
  on the 0 to 1000 scale, which is Gemini's own convention, and it already collapsed every
  failure to null. The LM seams (docs/04 items 5 and 8) are untouched and still stubs.
- **Sat 19:45 (Ricky, `11labs-voice-config`)** The coach's ElevenLabs voice is configurable
  next to the key, not in the app. `ELEVENLABS_COACH_VOICE` in `.env.local` takes a voice id or
  a library name; the proxy resolves it once and serves `GET /api/proxy/voice`, the app asks
  while LAUNCH is on screen and swaps the provider's voice with `setVoice()` before warming.
  Brian stays the default and any miss keeps Brian. An in-app voice picker was built first and
  removed the same evening: a bystander opens the app and taps once, and a settings layer,
  however small, is a layer between them and "I NEED HELP". Sarah, the dispatcher, is fixed.
- **Sat 19:55 (Ricky, `gemini-api` worktree)** The intent router, docs/04 item 8, on the same
  Gemini key and the same proxy: `POST /intent/route` is the vision route without a picture, so
  `assessWithVisionModel` became `askModel` with an optional `image` and there is still one
  upstream call in the file. Two narrowings against the doc. First, the options are the button
  twins of the current state, not `engine.keywords()`: the model only ever sees moves the screen
  is already offering, which drops `repeat`, `next` and the keyword answers from its reach and
  makes the suggestion match a button the person can see. Second, the model answers with the
  NUMBER of an option, not its keyword, and `parseIntent` returns the option object the engine
  minted, so inventing a step is not expressible rather than merely rejected. Low confidence is a
  miss, like no answer at all: an unsure question while someone is counting compressions is worse
  than silence. It runs in any phase but only after `matchKeyword` and `suggestRoute` have both
  missed, one sentence in flight, 8 s between tries. `RouteSuggestion.source` gained `'model'`,
  which the amber bar already renders as "Sounds like" since it is not the camera. The dead
  `route: TriageRoute` field on the stored suggestion went with it: nothing had read it since it
  was added. Behind `?flag=intentRoute`, `?fake=1` gets a word overlap stub.
- **Sat 20:05 (Ricky, `gemini-api` worktree)** The provider layer lost its `vision` prefix now
  that it serves the intent route too: `MODEL_PROVIDERS`, `resolveProvider()`, `MODEL_PROVIDER`.
  Switching models is that one environment variable and nothing else; no app code names a
  provider. A blind rename also rewrote the `/vision/assess` route constant, which the tests
  did not catch because nothing tests the proxy. Caught by curling both routes against the real
  upstream with a bad key, which is now the check to run after any edit to devproxy.mjs.
- **Sat 20:15 (Ricky, `gemini-api` worktree)** Three things a real Gemini key found that no test
  could. One: gemini-3.x thinks before it answers and the thinking tokens come out of
  `max_tokens`, so at this app's budgets the reply arrived truncated (`completion_tokens: 3`,
  `finish_reason: length`) or empty. Both calls here are classification against a closed list,
  not reasoning, so the gemini row carries `body: { reasoning_effort: 'none' }`, which the
  request spreads in per provider; Featherless never sees a field it might reject. 907 ms and 88
  tokens for the intent call, down from 3.4 s and 471. Two: `ASSESS_TIMEOUT_MS` 4 s to 6 s, since
  one 640 px frame measured 2.7 s on a laptop and a phone on venue wifi gets to be twice that;
  nothing waits on that call. Three: the intent prompt stacked two abstention mechanisms, "pick 0
  rather than guess" in the prompt AND the parser dropping low confidence, and Gemini answered 0
  to "the poor man went down in the hallway and he is grey", the exact sentence the feature
  exists to catch. Now 0 means only "not about any of these" and doubt goes in `confidence`, so
  `parseIntent` is the single gate: 4 of 4 on three emergencies plus one genuinely ambiguous
  sentence. The free tier 429s after roughly six calls a minute, which is the demo's real
  constraint, not cost; both routes already return null on a 429 and the app carries on.
- **Sat 20:15 (Ricky, `first-card-permissions-flow`)** The camera is an open question, not an
  instant, and the screen now says so. Sat 07:10 moved the prompt onto I NEED HELP with
  `primeMediaPermissions()`; an instrumented run showed what that left behind. One tap issues
  three `getUserMedia` calls (the prime, then `openCamera`'s ideal constraints, then its plain
  fallback), and nothing sequences them: the camera call is fired by CameraView's mount effect
  behind `await this.poseLoad`, so it lands 83 ms after the tap on loopback and several seconds
  later on a phone pulling 17.5 MB of WASM and model over the LAN. Browsers queue the
  overlapping request rather than refuse it, so this is not the double-prompt it looks like,
  but every opening deadline was anchored to the tap while the three things it describes had
  not happened yet. Four changes, no new screen. (1) `PerceptionStatus` gains
  `awaiting-permission`, set around `openCamera` and cleared by its new `onGranted`, so the
  session can stop folding a modal sheet, a 17.5 MB download and a camera opening into one
  `starting`; `EyesStatus` gains `awaiting` and the chip reads "Waiting for camera permission".
  (2) `SessionSnapshot.eyesReadyAt` stamps the moment the camera settled either way, and
  `isLooking` measures from it, so the three-second look no longer burns down behind a sheet;
  `CAMERA_WAIT_MAX_MS` (12 s) is the valve, because audio-and-buttons is the floor and a
  prompt nobody answers must never sit below it. (3) The camera-off banner carries its reason
  and a Try again that remounts CameraView, and the MediaPipe loaders stop memoising their own
  rejections, so one dropped fetch on hackathon wifi is no longer fatal for the life of the
  page. Before this a person who tapped Allow a beat late stayed blind until they reloaded,
  which is the whole product. DebugScreen had the button all along; the live screen did not.
  (4) The launch card said "or just start talking" over a screen where nothing listens and, on
  iOS, nothing can: `SpeechRecognition.start()` is only granted inside a tap. It now reads
  "Camera and microphone turn on when you tap", which is the warning people were not getting.
  Its `height: 100dvh` also double-counted the safe-area inset that `index.css` already pads
  onto body, so on a notched phone the card overflowed by the notch and body became a scroll
  container, which is enough to cancel a drifting thumb's tap on the one button that matters.
  Ask-then-commit (a readiness step in front of I NEED HELP) was designed and deliberately not
  built: it retires more of this at the cost of docs/05's zero-navigation launch, and that is
  the team's call, not a bug fix.
- **Sat 20:20 (Ricky, `gemini-api` worktree)** Measured the intent router's variance on one
  sentence, five identical calls at temperature 0: three matched, one abstained with `choice: 0`
  and *high* confidence, one 429'd. So roughly three in four, the confidence field does not
  separate the miss, and a retry is not affordable against this rate limit. Left as is, because
  the failure mode is the designed one: no suggestion appears, the three buttons are still on
  the screen, and the human was always going to confirm. The scene assessment is the steadier
  Gemini demo and should lead. Featherless answered the same sentence correctly in 1.5 s if a
  rehearsal needs determinism, one `MODEL_PROVIDER` away.
