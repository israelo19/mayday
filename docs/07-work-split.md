# 07 - Work split for four people

Ownership is singular: every path in this repo has exactly one owner, and docs/06's roles
A/B/C/D are P1/P2/P3/P4 below. The seams between people are the interfaces in this file;
agree on them first, then nobody waits on anybody.

Every task below is meant to ship. Stretch items are marked, everything else is the plan.

## Roles at a glance

| Person | Name | Mission | Owns | Never touches | Primary gate |
|---|---|---|---|---|---|
| P1 | Eyes | Turn camera frames into trustworthy measurements on-device, and say so loudly when they stop being trustworthy. | `src/perception/**` (not `fake.ts`), `public/models`, `scripts/prepare-assets.mjs`, `CameraView`, `Waveform`, `DebugScreen`, `fixtures/**` | `src/protocol`, `src/voice`, `src/ai`, `src/session.ts` | M1 rate within 5 bpm; M2 blind fact within 1.2 s; M3 hands-off fact |
| P2 | Brain | Be the only source of medical instructions: typed machine data verified against guidelines, executed by a deterministic engine, proven by tests. | `src/types.ts`, `src/protocol/**`, `src/sitrep/**`, `tests/**`, `src/perception/fake.ts` | `src/perception` (except `fake.ts`), `src/voice`, `src/ui`, `src/ai` | M1 cardiac end to end on FakePerception; M2 SITREP; M3 bleeding machine |
| P3 | Mouth | Make every line audible at the right moment and every spoken keyword land, offline, with measured latency. | `src/voice/**` | `src/protocol/machines`, `src/perception`, `src/ui`, `src/ai` | M1 correction audible under 1 s; M2 blind line under 2 s; M4 dispatcher sim |
| P4 | Face and ship | Wire everything into four screens a judge can drive by tap alone, keep it deployed, and get it submitted. | `src/App.tsx`, `src/session.ts`, `src/ui/**` (except P1's three), `src/ai/**`, `src/flags.ts`, `api/**`, `vite.config.ts`, `package.json`, `README.md`, `DECISIONS.md`, `docs/pitch.md`, deploy | `src/perception`, `src/protocol`, `src/voice`, `src/sitrep` | M2 session spine; M4 flags and deploy; M5 submission |

## Clock (EDT), re-based from T0 = Sat 01:00

| Milestone | Deadline | Gate (from docs/06 and docs/05) |
|---|---|---|
| M0 skeleton with eyes | Sat 03:00 | waveform wiggles on a real camera, confidence on screen, metronome ticks |
| M1 THE closed loop | Sat 07:00 | untrained teammate audibly corrected to 100-120 without anyone touching the laptop |
| KILL CHECK | Sat 09:00 | M1 not green => all four on M1; bleeding CV downgraded to timer + verbal |
| M2 session spine | Sat 11:00 | triage -> cardiac by voice AND button, blind test < 2 s, SITREP with coords, handoff renders |
| M3 bleeding | Sat 15:00 | lift-hands-to-peek -> "Don't let go!" fast, continuous-pressure timer on screen |
| M4 enrichment | Sat 19:00 | each integration behind a flag, each reverts to its stub; STOP adding at 19:00 regardless |
| M5 polish, rehearse, submit | Sat 19:00 -> Sun 08:40 | video recorded by Sat 23:00, Devpost draft by 00:00, 6 rehearsals, submit 08:40, hands off |

Sleep in shifts. Between Sat 23:00 and Sun 07:00 at least one person is awake and owns main.
Last commit before Sun 09:00 ET, no exceptions, not even README fixes.

## Ownership map (edit only what you own; anyone else asks in chat first)

| Path | Owner |
|---|---|
| `src/perception/**` except `src/perception/fake.ts`, `public/models/**`, `scripts/prepare-assets.mjs`, `src/ui/CameraView.tsx`, `src/ui/Waveform.tsx`, `src/ui/DebugScreen.tsx`, `fixtures/**` | P1 |
| `src/types.ts`, `src/protocol/**`, `src/sitrep/**`, `tests/**`, `src/perception/fake.ts` | P2 |
| `src/voice/**` | P3 |
| `src/App.tsx`, `src/session.ts`, `src/ui/**` (except P1's three files), `src/ai/**`, `src/flags.ts`, `src/platform/**`, `mobile/**`, `scripts/mobile-tunnel.mjs`, `api/**`, `vite.config.ts`, `package.json`, `README.md`, `DECISIONS.md`, `docs/pitch.md`, deploy config | P4 |

Branching: main only. `git pull --rebase` before every commit. Commit at least hourly with a
message that says what demonstrably works. No PRs; ownership prevents conflicts, process does not.
Changes to `src/types.ts` are announced in chat before they land.

## Seams (agree by Sat 02:30)

Who provides, who consumes. `CoachingEvent` in `src/types.ts` is the P2 -> P3 contract: the
engine emits it, the voice queue plays it, nobody else shapes it.

```ts
// ---- P1 provides, P4 consumes : src/perception/index.ts (P2's fake.ts implements the same interface)
export interface Perception {
  start(video: HTMLVideoElement, overlay?: HTMLCanvasElement, opts?: { replayUrl?: string }): Promise<void>;
  stop(): void;
  subscribe(cb: (f: PerceptionFacts) => void): () => void;   // returns unsubscribe
  getCameraGuidance(): string | null;                          // null when the view is good; speak at most once per 10 s
  setMode(mode: 'pose' | 'pose+hands'): void;                  // hands only in bleeding states (perf)
  lockRoi(): void;                                             // orchestrator calls on bleeding.pressure entry
  unlockRoi(): void;
  roi(): { state: 'idle' | 'locking' | 'locked' | 'failed'; cx: number; cy: number; r: number; handsOn: boolean | null; handsOffMs: number | null; lockingMs: number };
                                                               // 'failed' after 10 s -> orchestrator announces voice-only for this state
  captureFrame(maxPx?: number): string | null;                 // JPEG base64; only src/ai may consume it, flagged
  debug: {
    series(windowMs: number): readonly { t: number; y: number }[];
    peaks(): readonly number[];
    fps(): number;
    status(): string;
  };
}

// ---- P2 provides, P4 and P3 consume : src/protocol/engine.ts (P3 consumes the CoachingEvent inside EngineOutput)
export interface Engine {
  start(machineId: string, stateId?: string): void;
  onFacts(f: PerceptionFacts): void;
  onKeyword(k: string): void;
  advance(): void;                                             // NEXT button, always legal
  tick(now: number): void;                                     // orchestrator calls every 100 ms; timers are pure
  currentState(): { machineId: string; state: State } | null;
  keywords(): string[];                                        // state keywords + globals, for the listener
  availableTransitions(): { label: string; keyword: string }[]; // button twins are generated from this
  subscribe(cb: (out: EngineOutput) => void): () => void;
}
export type EngineOutput =
  | { type: 'coach'; event: CoachingEvent }
  | { type: 'state_enter'; machineId: string; stateId: string; metronome: number | null }
  | { type: 'log'; entry: EventLogEntry };

// ---- P3 provides, P4 consumes : src/voice/out.ts, src/voice/in.ts
export interface SpeakerProvider { readonly name: string; speak(text: string): Promise<void>; cancel(): void }
export interface VoiceOut {
  unlock(): Promise<void>;                                     // call inside a user gesture (autoplay policy)
  enqueue(e: CoachingEvent): void;
  startMetronome(bpm: number): void;
  stopMetronome(): void;
  isSpeaking(): boolean;                                       // echo suppression for VoiceIn
  setProvider(p: SpeakerProvider): void;                       // WebSpeech default, ElevenLabs behind a flag
}
export interface VoiceIn {
  readonly available: boolean;
  start(o: {
    keywords: () => string[];
    onKeyword: (k: string) => void;
    onTranscript: (t: string) => void;
    suppress: () => boolean;                                   // true while the app itself is speaking
  }): void;
  stop(): void;
}

// ---- P2 provides, P4 consumes : src/sitrep
export interface EventLog {
  append(e: EventLogEntry): void;
  entries(): readonly EventLogEntry[];
  subscribe(cb: () => void): () => void;
}
export function buildSitrep(log: EventLog, geo: { lat: number; lon: number } | null, now: number): Sitrep;
export function buildHandoff(log: EventLog, now: number): HandoffReport;   // toJSON() feeds the QR

// ---- P4 provides, everyone consumes : src/flags.ts, src/ai/*
export const flags: { elevenLabs: boolean; dispatcherSim: boolean; visionDescribe: boolean; narrationFlavor: boolean };
// all default false; `?flag=visionDescribe` flips one for the session. Interfaces for src/ai are in docs/04.
```

## P1, Eyes

**Mission.** Turn camera frames into trustworthy measurements on-device, and say so loudly when they stop being trustworthy.

**You own.** `src/perception/**` except `fake.ts`, `public/models/**`, `scripts/prepare-assets.mjs`, `src/ui/CameraView.tsx`, `src/ui/Waveform.tsx`, `src/ui/DebugScreen.tsx`, `fixtures/**`, the physical rig.

**You never touch.** `src/protocol`, `src/voice`, `src/ai`, `src/session.ts`, the four product screens. If perception needs something from them, ask the owner.

**Your gates.** M0 (Sat 03:00) on the phone. M1 (Sat 07:00): rate within 5 bpm. M2 (Sat 11:00): low-confidence fact within 1.2 s of covering the lens. M3 (Sat 15:00): hands-off fact within 100 ms of the true moment.

**Tasks in order.**

1. **Take over M0 perception code** (Sat 03:00). Read `src/perception/*`, run it on the demo phone over LAN, fix whatever a real camera reveals. DONE = the M0 gate passes on the phone, not just the laptop.
2. **M1 signal extraction** (Sat 06:00). Peak detection on the EMA series: local max with prominence > 0.008 and a 250 ms refractory; rate = peaks in trailing 10 s x 6, null until 5 peaks; `compressionActive` = 2+ peaks in trailing 2 s; `recoilRatio` per cycle, averaged over the window, clamped 0..1; confidence gate: min visibility of landmarks 11/12 below 0.5 for more than 1 s nulls every derived metric and reports the low confidence. Debug sliders for alpha, prominence, refractory. DONE = the rate number tracks a metronome-paced teammate within 5 bpm at 100 and at 120, on a pillow.
3. **Replay harness** (Sat 08:00). `?replay=/fixtures/cpr-110.webm` runs a recorded clip through the exact same pipeline. Record three clips: good light at 110, slow at 80, phone-on-the-floor angle. Keep each under 5 MB. DONE = tuning no longer needs a live human.
4. **Camera guidance and the blind path** (Sat 10:00). No pose for 3 s -> "I can't see the patient. Prop the phone so I can see his chest." Shoulder distance < 0.08 -> "Move the phone closer." Mean luminance too low -> "Turn on a light." Cover-the-lens: low confidence must be emitted within 1.2 s of the cover so the whole pipeline hits the 2 s demo budget. DONE = blind line audible in under 2 s end to end with P3 and P4.
5. **Performance** (Sat 12:00). `requestVideoFrameCallback`, 640 px input, GPU delegate with CPU fallback, fps HUD. Targets: 15 fps laptop, 10 fps phone. Stretch: MediaPipe in a Web Worker with OffscreenCanvas so the UI never janks. DONE = targets measured and written in the debug footer.
6. **M3 hands and ROI** (Sat 15:00). HandLandmarker runs only in `pose+hands` mode. ROI lock: both hand centroids stable (variance under threshold for 1.5 s) -> circle around them, radius 1.5x hand span. `handsOnRegion` = at least one centroid inside; `handsOffMs` = continuous time both are outside. No stabilization in 10 s -> verbal-only for this state, announced. Draw the ROI on the overlay. DONE = lift hands to peek and the fact crosses the threshold within 100 ms of the true moment.
7. **Stretch flags** (after M3). Choking gesture: both hand centroids near the neck midpoint for 1.5 s -> a triage-suggestion fact only, never auto-starts a protocol. Amplitude proxy: shoulder-y amplitude over shoulder width, flag OFF, never a centimetre claim. DONE = both behind flags, both OFF by default, both demoable with `?flag=`.
8. **Failure-mode matrix** (Sat 20:00). Light (bright, dim, backlit), angle (side, 45 degrees, above), distance (1, 1.5, 2.5 m), clothing and skin tone. Results in `docs/perception-tests.md`, thresholds in `DECISIONS.md`. DONE = the "fail loud" evidence for judges is a table, not a claim.
9. **Own the rig** (Sat 18:00). Demo phone (Android + Chrome), stand, duffel or pillow, red cloth, lamp. Know the exact angle that works and mark the floor with tape. DONE = the rig is set up once and reproduced from the tape marks in under a minute.
10. **Pitch content** (Sat 22:00). The live waveform slide and the limits slide ("recoil is a proxy, no depth in centimetres from monocular video"). DONE = two slides handed to P4.

## P2, Brain

**Mission.** Be the only source of medical instructions: typed machine data verified against guidelines, executed by a deterministic engine, proven by tests.

**You own.** `src/types.ts`, `src/protocol/**`, `src/sitrep/**`, `tests/**`, `src/perception/fake.ts`.

**You never touch.** `src/perception` (except `fake.ts`), `src/voice`, `src/ui`, `src/ai`. If a machine needs a new fact, ask P1 for the measurement; if it needs a new sound, ask P3.

**Your gates.** M1 (Sat 07:00): cardiac runs end to end on FakePerception with buttons only, rules fire with cooldowns. M2 (Sat 11:00): SITREP with coordinates, handoff data. M3 (Sat 15:00): bleeding machine verified and wired.

**Tasks in order.**

1. **Types** (Sat 02:30). Extend `src/types.ts` with Machine, State, Rule, Transition. Rules carry `cooldownMs`, `forMs` (sustained, e.g. no compressions for 3000 ms) and `everyMs` (periodic, e.g. the 120 s swap reminder). Transition targets may cross machines (`cardiac.position`). Announce in chat, then land. DONE = P3 and P4 compile against the final shapes.
2. **FakePerception** `src/perception/fake.ts` (Sat 03:30). Implements `Perception` and emits synthetic `PerceptionFacts`: rate slider, stop toggle, cover-camera toggle, hands-off toggle. Enabled by `?fake=1`. The same generator feeds the engine tests. DONE = P4 and you can drive cardiac without a human on a pillow.
3. **Engine** (Sat 04:30). Under 120 lines, dependency free, time is an input via `tick(now)`. Triggers: keyword, timerMs, fact predicate, manualAdvance. Rules with cooldown per dedupeKey (default 6000 ms) plus `forMs` and `everyMs`. Cross-machine targets. Entry: log, say lines at narration priority, metronome per state config. `keywords()` for the listener, `availableTransitions()` so P4 can generate buttons. Predicates treat null facts as false, so nothing fires while blind. DONE = cardiac runs end to end on FakePerception with buttons only.
4. **Machines as data** (Sat 06:00). triage, cardiac, bleeding, choking (data only, detection disabled). Every line verified against AHA Hands-Only CPR, Stop the Bleed, Red Cross conscious choking, with the source URL in a comment next to the state. Tourniquet line only on the keyword 'tourniquet'. Scene safety has no timer. Keyword matching is phrase level, word bounded, longest match first, so 'no' never fires on 'no response' or 'not breathing'. DONE = every state has a cited URL and the cited tab was open when it was typed.
5. **Engine tests and machine linter** (Sat 08:00, vitest, fake clock). rate-low fires once per cooldown; 'stopped' after 3 s without compressions; confidence drop -> 'blind' and no other rule fires on null facts; timers advance; scene_safety never times out; every state reachable by button. Linter: no dead states, no duplicate keywords within a state, every non-terminal state has manualAdvance. DONE = green suite; this is the "authority is deterministic" evidence and becomes a pitch slide.
6. **EventLog and SITREP builder** (Sat 11:00). Append-only log with subscribe. Derived: CPR started at, average rate, pauses over 10 s, longest pause, continuous pressure time, current state. Read-aloud lines ("Say this to the dispatcher"). Report JSON and a QR of it (the `qrcode` package, exception recorded in DECISIONS). Geolocation captured once when the first non-triage machine starts; raw coordinates are fine. DONE = P4's SITREP and HANDOFF screens render from your data alone.
7. **Narration validator** `src/protocol/validate.ts` (Sat 12:00). Per-state required keywords (compressions must contain 'push'). Any miss -> canonical line. The flavor stub itself stays OFF. DONE = tests show a bad paraphrase is replaced by the canonical line.
8. **Bleeding machine live** (Sat 15:00). Wire `handsOffMs` and `handsOnRegion` rules with the thresholds decided below, the pack and handoff states, the continuous-pressure metric in the log. DONE = M3 gate with P1's facts, and with the fake's hands-off toggle.
9. **Stretch** (Sat 17:00). Generate a Mermaid diagram of each machine from the data for README and pitch. A test that greps `src/perception`, `src/protocol`, `src/voice` for `fetch(` and imports of `src/ai` and fails the build if any appear. DONE = diagram in README, grep test in the suite.
10. **Pitch content** (Sat 22:00). The deterministic-authority slide: the test list, the linter, the threat-model rows that point at your code. DONE = one slide handed to P4.

## P3, Mouth

**Mission.** Make every line audible at the right moment and every spoken keyword land, offline, with measured latency.

**You own.** `src/voice/**`: the queue, both speaker providers, the metronome, the keyword listener, the dispatcher sim, the voice tests.

**You never touch.** `src/protocol/machines` (you play lines, you never write them), `src/perception`, `src/ui`, `src/ai`. The text you speak arrives as `CoachingEvent`; if a line is wrong, tell P2.

**Your gates.** M1 (Sat 07:00): a correction is audible within 1 s of the triggering fact; metronome never stutters. M2 (Sat 11:00): blind line within 2 s of covering the lens; a keyword spoken by a human routes and the same words spoken by the app do not. M4 (Sat 19:00): dispatcher sim behind its flag, labelled SIMULATED.

**Tasks in order.**

1. **Voice out queue** (Sat 05:00). On top of the M0 `WebSpeechProvider` and `Metronome`: critical cancels and preempts, correction coalesces by dedupeKey, narration only when idle. Same dedupeKey at most once per cooldownMs. Metronome stays independent of speech. `unlock()` inside a gesture, `isSpeaking()`, `setProvider()`. DONE = spam 'rate-low' and hear it once per 6 s while the metronome never stutters.
2. **Audio quirks on real devices** (Sat 06:00). `voiceschanged` wait, chunk anything over 200 characters (Chrome cuts long utterances), `resume()` after `cancel()`, AudioContext unlock on first tap, iOS and Android behaviors checked on the demo phone. DONE = a line plays on the demo phone after one tap and never needs another tap for the rest of the session.
3. **Voice in** (Sat 09:00). SpeechRecognition continuous with interim results, restart on `end`, keyword spotting only against `engine.keywords()`. Echo suppression: ignore transcripts while `isSpeaking()` and for 700 ms after. Transcripts logged as kind 'user'. Feature detect, hide affordances when absent. DONE = "he's not breathing" said by a human routes; the same words spoken by the app do not.
4. **Latency measurement** (Sat 10:00). Instrument fact timestamp -> utterance start. Correction audible within 1 s of the triggering fact; blind line within 2 s of covering the lens. Numbers written in `docs/latency.md`, measured on the phone, not the laptop. DONE = the numbers exist and the stage claims match them.
5. **Voice tests** (Sat 12:00). A fake `SpeakerProvider` with a controllable clock: queue ordering, preemption, coalescing, cooldown, cancel semantics. DONE = green vitest suite next to P2's.
6. **SITREP read-aloud voice** (Sat 13:00). Speak P2's "Say this to the dispatcher" block on tap, pausable, never preempts a critical line. DONE = the SITREP screen can be read out loud by the app while coaching continues.
7. **DispatcherSim** (scripted stub Sat 15:00, ElevenLabs Agents Sat 17:00). Scripted local stub first: asks location, nature, patient status, accepts SITREP answers, always rendered under the red SIMULATED banner. Then ElevenLabs Agents behind `flags.dispatcherSim`, falling back to the script. DONE = a full simulated exchange with wifi on, and the scripted exchange with wifi off.
8. **ElevenLabsProvider** (Sat 17:00). Streaming TTS through P4's proxy, same cancel semantics as WebSpeech, fall back to WebSpeech if no audio within 800 ms. One warm authoritative voice. DONE = flag on gives the ElevenLabs voice; pulling wifi mid-sentence falls back without a gap longer than a second.
9. **Pitch content** (Sat 22:00). The latency numbers, on one slide, with how they were measured. DONE = one slide handed to P4.

## P4, Face and ship

**Mission.** Wire everything into four screens a judge can drive by tap alone, keep it deployed, and get it submitted.

**You own.** `src/App.tsx`, `src/session.ts`, `src/ui/**` except P1's three files, `src/ai/**`, `src/flags.ts`, `api/**`, `vite.config.ts`, `package.json`, `README.md`, `DECISIONS.md`, `docs/pitch.md`, deploy config, the Devpost page.

**You never touch.** `src/perception`, `src/protocol`, `src/voice`, `src/sitrep`. You call their interfaces; if an interface is missing something, ask the owner and record the seam here.

**Your gates.** M0 (Sat 03:00) on the phone. M2 (Sat 11:00): the session spine, triage to handoff by tap alone. M4 (Sat 19:00): every flag reverts to its stub, deployed. M5 (Sun 08:40): submitted.

**Tasks in order.**

1. **Take over the M0 skeleton now** (Sat 03:00). Run it on the demo phone over LAN, get the HTTPS certificate flow smooth, keep README current. DONE = the M0 gate passes on the phone with P1.
2. **Session orchestrator** `src/session.ts` (Sat 06:00). Perception -> `engine.onFacts`; engine outputs -> voice, log, metronome; 100 ms tick; listener fed by `engine.keywords()`; on `bleeding.pressure` entry call `setMode('pose+hands')` and `lockRoi()`, back to `pose` on exit; camera guidance spoken at most once per 10 s; SITREP starts and geolocation is requested when the first non-triage machine starts. Zero network calls in this file, enforced by P2's grep test. `?fake=1` swaps in P2's FakePerception. DONE = cardiac runs end to end through the real modules on the laptop.
3. **Debug panel** `?debug=1` (Sat 07:00). Engine state, latest facts, voice queue, log tail, flags. DONE = everyone integrates through this and stops adding console.logs.
4. **AI seams** (Sat 09:00). `src/flags.ts` (all OFF, `?flag=` override). `src/ai` stubs for VisionDescriber and NarrationFlavor with realistic demo data, and the DispatcherSim interface (P3 implements). ESLint `no-restricted-imports`: perception, protocol and voice may not import `src/ai`. Keep the TODO registry in docs/04 current. DONE = lint fails on a forbidden import; every stub returns demo data with its flag off.
5. **The four screens** (first cut Sat 11:00, iterate until 19:00). LAUNCH: one huge "I NEED HELP" button, dark, thumb reachable, "or just start talking". COACH: instruction text at least 48 px and readable at 1.5 m, live metric (rate or pressure timer), small camera thumbnail with overlay, CALL 911 persistent top, NEXT persistent bottom, red SIMULATED banner when the dispatcher panel is open. SITREP: read-aloud block plus live timeline. HANDOFF: headline metrics, timeline, QR. Plain CSS, portrait and landscape, Screen Wake Lock so a propped phone never sleeps, fullscreen on launch, `navigator.vibrate` on critical events. DONE = the demo script in docs/05 can be walked by tap alone.
6. **Button twins** (Sat 11:00). Generated from `engine.availableTransitions()`, nothing hand-coded per state. DONE = any wedge is recoverable with one tap, verified by a hostile teammate.
7. **First deploy** (Sat 13:00, then continuously). DigitalOcean App Platform static site plus one function, HTTPS. PWA precache of the app, wasm and models (vite-plugin-pwa, exception recorded) so an accidental reload with wifi off still loads. DONE = the public URL runs the current main, and a reload in airplane mode works.
8. **M4 integrations, in this order** (Sat 11:00 to 19:00). DigitalOcean Function proxy at `/api/proxy` with per-IP 30/min, keys only there. Gemini VisionDescriber on `bleeding.find_wound` entry using `perception.captureFrame()`; the model returns a noun list, the app filters it against a materials allowlist and slots it into the canonical template ("I can see a shirt. Grab it."), never free text. GoDaddy domain pointed at the DO app. DONE = each behind its flag, each reverts to its stub when the proxy is unreachable.
9. **Pitch and Devpost, editor-in-chief** (Sat 19:00 onward). `docs/pitch.md` -> slides: stats verified against heart.org and stopthebleed.org, lineage slide with ChatCPR, the threat-model table from docs/01, the limits slide. Collect P1's waveform and limits slides, P2's deterministic-authority slide, P3's latency slide. Devpost text from these docs, video recorded Sat 23:00 from a full run, track Bloomberg only, opt-ins checked, all four teammates added, repo public confirmed, submit Sun 08:40. DONE = submitted, alarm at 08:30, hands off.

## Whole team

- Kill check Sat 09:00. If M1 is not green, everyone is on M1 and nothing else exists.
- Rehearsals: three Sat evening after the M4 freeze, three Sun 06:30 to 08:15, one of them with a hostile volunteer, one with wifi off (airplane mode on the phone, not just wifi).
- The demo behaviors in docs/05 are the acceptance tests: wifi off, button twins, blind test under 2 s, correction under 1 s, don't-let-go fast.
- Every hour someone commits. If a feature can't demo, it doesn't merge.

## Decisions to make in the first hour (gaps found reading the docs)

1. **P2.** docs/02 uses a 'system' priority that `CoachingEvent` does not have. Blind lines are priority 'critical' with dedupeKey 'blind' and a 20 s cooldown, logged as kind 'system'.
2. **P2.** Rules need `forMs` and `everyMs` semantics; the engine spec only has `when` + `cooldownMs`. Add both to the Rule type.
3. **P2.** Transitions cross machines (`triage -> cardiac.scene_check`, `choking -> cardiac.position`). The engine supports switching machines.
4. **P2.** Keyword 'no' collides with 'no response', 'not breathing', 'no pulse'. Phrase-level matching, longest first, per state.
5. **P2.** The hands-off rule fires at `handsOffMs > 1500` but the demo script promises the line "within 1.5 s". Set the threshold to 1000 ms, have P3 measure end to end, and only claim on stage what was measured.
6. **P4.** CALL 911 opens the SIMULATED dispatcher panel in every hackathon build. A `tel:` link exists behind a build flag that stays off. Never a real line.
7. **P4.** `qrcode` and `vite-plugin-pwa` are the only exceptions to the no-new-libraries rule. Both recorded in DECISIONS.
8. **P1.** Demo device is an Android phone with Chrome (SpeechRecognition and MediaPipe both behave). Laptop is the backup. iOS only if time remains.
9. **P4.** CLAUDE.md says team of four, which is correct. docs/06 roles A/B/C/D map to P1/P2/P3/P4 in this file; nothing else in docs/06 changes.
