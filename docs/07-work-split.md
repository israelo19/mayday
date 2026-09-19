# 07 - Work split for three people

docs/06 assumed four roles (A perception, B protocol, C voice, D UI). We are three.
Ownership stays singular. The seams between people are the interfaces in this
file; agree on them first, then nobody waits on anybody.

- **P1, Eyes**: perception, camera, signal extraction, hands/ROI, the physical rig.
- **P2, Brain and mouth**: types, engine, machines, voice out/in, event log, SITREP, dispatcher sim.
- **P3, Face and ship**: orchestration, the four screens, AI seams and integrations, deploy, pitch, Devpost.

Every task below is meant to ship. Stretch items are marked, everything else is the plan.

## Clock (EDT), re-based from T0 = Sat 01:00

| Milestone | Deadline | Gate (from docs/06 and docs/05) |
|---|---|---|
| M0 skeleton with eyes | Sat 03:00 | waveform wiggles on a real camera, confidence on screen, metronome ticks |
| M1 THE closed loop | Sat 07:00 | untrained teammate audibly corrected to 100-120 without anyone touching the laptop |
| KILL CHECK | Sat 09:00 | M1 not green => all three on M1; bleeding CV downgraded to timer + verbal |
| M2 session spine | Sat 11:00 | triage -> cardiac by voice AND button, blind test < 2 s, SITREP with coords, handoff renders |
| M3 bleeding | Sat 15:00 | lift-hands-to-peek -> "Don't let go!" fast, continuous-pressure timer on screen |
| M4 enrichment | Sat 19:00 | each integration behind a flag, each reverts to its stub; STOP adding at 19:00 regardless |
| M5 polish, rehearse, submit | Sat 19:00 -> Sun 08:40 | video recorded by Sat 23:00, Devpost draft by 00:00, 6 rehearsals, submit 08:40, hands off |

Sleep in shifts. Between Sat 23:00 and Sun 07:00 at least one person is awake and owns main.
Last commit before Sun 09:00 ET, no exceptions, not even README fixes.

## Ownership map (edit only what you own; anyone else asks in chat first)

| Path | Owner |
|---|---|
| `src/perception/**`, `public/models/**`, `scripts/prepare-assets.mjs`, `src/ui/CameraView.tsx`, `src/ui/Waveform.tsx`, `src/ui/DebugScreen.tsx`, `fixtures/**` | P1 |
| `src/types.ts`, `src/protocol/**`, `src/voice/**`, `src/sitrep/**`, `tests/**` | P2 |
| `src/App.tsx`, `src/session.ts`, `src/ui/**` (except P1's three), `src/ai/**`, `src/flags.ts`, `api/**`, `vite.config.ts`, `package.json`, `README.md`, `DECISIONS.md`, `docs/pitch.md`, deploy config | P3 |

Branching: main only. `git pull --rebase` before every commit. Commit at least hourly with a
message that says what demonstrably works. No PRs; ownership prevents conflicts, process does not.
Changes to `src/types.ts` are announced in chat before they land.

## Seams (agree by Sat 02:30)

```ts
// ---- P1 -> P3 : src/perception/index.ts
export interface Perception {
  start(video: HTMLVideoElement, overlay?: HTMLCanvasElement): Promise<void>;
  stop(): void;
  subscribe(cb: (f: PerceptionFacts) => void): () => void;   // returns unsubscribe
  getCameraGuidance(): string | null;                          // null when the view is good
  setMode(mode: 'pose' | 'pose+hands'): void;                  // hands only in bleeding states (perf)
  lockRoi(): void;                                             // orchestrator calls on bleeding.pressure entry
  unlockRoi(): void;
  captureFrame(maxPx?: number): string | null;                 // JPEG base64; only src/ai may consume it, flagged
  debug: {
    series(windowMs: number): readonly { t: number; y: number }[];
    peaks(): readonly number[];
    fps(): number;
    status(): string;
  };
}

// ---- P2 -> P3 : src/protocol/engine.ts
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

// ---- P2 -> P3 : src/voice/out.ts, src/voice/in.ts
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

// ---- P2 -> P3 : src/sitrep
export interface EventLog {
  append(e: EventLogEntry): void;
  entries(): readonly EventLogEntry[];
  subscribe(cb: () => void): () => void;
}
export function buildSitrep(log: EventLog, geo: { lat: number; lon: number } | null, now: number): Sitrep;
export function buildHandoff(log: EventLog, now: number): HandoffReport;   // toJSON() feeds the QR

// ---- P3 -> everyone : src/flags.ts, src/ai/*
export const flags: { elevenLabs: boolean; dispatcherSim: boolean; visionDescribe: boolean; narrationFlavor: boolean };
// all default false; `?flag=visionDescribe` flips one for the session. Interfaces for src/ai are in docs/04.
```

## P1, Eyes

1. **Take over M0 perception code** (Sat 03:00). Read `src/perception/*`, run it on the demo phone over LAN, fix whatever a real camera reveals. DONE = the M0 gate passes on the phone, not just the laptop.
2. **M1 signal extraction** (Sat 06:00). Peak detection on the EMA series: local max with prominence > 0.008 and a 250 ms refractory; rate = peaks in trailing 10 s x 6, null until 5 peaks; `compressionActive` = 2+ peaks in trailing 2 s; `recoilRatio` per cycle, averaged over the window, clamped 0..1; confidence gate: min visibility of landmarks 11/12 below 0.5 for more than 1 s nulls every derived metric and reports the low confidence. Debug sliders for alpha, prominence, refractory. DONE = the rate number tracks a metronome-paced teammate within 5 bpm at 100 and at 120, on a pillow.
3. **Replay harness** (Sat 08:00). `?replay=/fixtures/cpr-110.webm` runs a recorded clip through the exact same pipeline. Record three clips: good light at 110, slow at 80, phone-on-the-floor angle. Keep each under 5 MB. DONE = tuning no longer needs a live human.
4. **Camera guidance and the blind path** (Sat 10:00). No pose for 3 s -> "I can't see the patient. Prop the phone so I can see his chest." Shoulder distance < 0.08 -> "Move the phone closer." Mean luminance too low -> "Turn on a light." Cover-the-lens: low confidence must be emitted within 1.2 s of the cover so the whole pipeline hits the 2 s demo budget. DONE = blind line audible in under 2 s end to end with P2 and P3.
5. **Performance** (Sat 12:00). `requestVideoFrameCallback`, 640 px input, GPU delegate with CPU fallback, fps HUD. Targets: 15 fps laptop, 10 fps phone. Stretch: MediaPipe in a Web Worker with OffscreenCanvas so the UI never janks.
6. **M3 hands and ROI** (Sat 15:00). HandLandmarker runs only in `pose+hands` mode. ROI lock: both hand centroids stable (variance under threshold for 1.5 s) -> circle around them, radius 1.5x hand span. `handsOnRegion` = at least one centroid inside; `handsOffMs` = continuous time both are outside. No stabilization in 10 s -> verbal-only for this state, announced. Draw the ROI on the overlay. DONE = lift hands to peek and the fact crosses the threshold within 100 ms of the true moment.
7. **Stretch flags** (after M3). Choking gesture: both hand centroids near the neck midpoint for 1.5 s -> a triage-suggestion fact only, never auto-starts a protocol. Amplitude proxy: shoulder-y amplitude over shoulder width, flag OFF, never a centimetre claim.
8. **Failure-mode matrix** (Sat 20:00). Light (bright, dim, backlit), angle (side, 45 degrees, above), distance (1, 1.5, 2.5 m), clothing and skin tone. Results in `docs/perception-tests.md`, thresholds in `DECISIONS.md`. This is the "fail loud" evidence for judges.
9. **Own the rig.** Demo phone (Android + Chrome), stand, duffel or pillow, red cloth, lamp. Know the exact angle that works and mark the floor with tape.
10. **Pitch content.** The live waveform slide and the limits slide ("recoil is a proxy, no depth in centimetres from monocular video").

## P2, Brain and mouth

1. **Types and engine** (Sat 04:00). Extend `src/types.ts` with Machine, State, Rule, Transition. Engine under 120 lines, dependency free, time is an input via `tick(now)`. Triggers: keyword, timerMs, fact predicate, manualAdvance. Rules with cooldown per dedupeKey (default 6000 ms) plus `forMs` (sustained, e.g. no compressions for 3000 ms) and `everyMs` (periodic, e.g. the 120 s swap reminder). Cross-machine targets like `cardiac.position`. Entry: log, say lines at narration priority, metronome per state config. `availableTransitions()` so P3 can generate buttons. DONE = cardiac runs end to end on P3's FakePerception with buttons only.
2. **Machines as data** (Sat 06:00). triage, cardiac, bleeding, choking (data only, detection disabled). Every line verified against AHA Hands-Only CPR, Stop the Bleed, Red Cross conscious choking, with the source URL in a comment next to the state. Tourniquet line only on the keyword 'tourniquet'. Scene safety has no timer. Keyword matching is phrase level, word bounded, longest match first, so 'no' never fires on 'no response' or 'not breathing'.
3. **Engine tests** (Sat 08:00, vitest, fake clock). rate-low fires once per cooldown; 'stopped' after 3 s without compressions; confidence drop -> 'blind' and no other rule fires on null facts; timers advance; scene_safety never times out; every state reachable by button; a machine linter: no dead states, no duplicate keywords within a state, every non-terminal state has manualAdvance. This is the "authority is deterministic" evidence and becomes a pitch slide.
4. **Voice out** (Sat 05:00). Priority queue: critical cancels and preempts, correction coalesces by dedupeKey, narration only when idle. `WebSpeechProvider`: en-US voice, rate 1.05, cancel, wait for `voiceschanged`, chunk anything over 200 characters (Chrome cuts long utterances). Metronome stays independent of speech and uses the M0 lookahead scheduler. `unlock()` inside a gesture. `isSpeaking()`. DONE = spam 'rate-low' and hear it once per 6 s while the metronome never stutters.
5. **Voice in** (Sat 09:00). SpeechRecognition continuous with interim results, restart on `end`, keyword spotting only against `engine.keywords()`. Echo suppression: ignore transcripts while `isSpeaking()` and for 700 ms after. Transcripts logged as kind 'user'. Feature detect, hide affordances when absent. DONE = "he's not breathing" said by a human routes; the same words spoken by the app do not.
6. **EventLog and SITREP builder** (Sat 11:00). Append-only log with subscribe. Derived: CPR started at, average rate, pauses over 10 s, longest pause, continuous pressure time, current state. Read-aloud lines ("Say this to the dispatcher"). Report JSON and a QR of it (the `qrcode` package, exception recorded in DECISIONS). Geolocation captured once when the first non-triage machine starts; raw coordinates are fine.
7. **DispatcherSim** (Sat 17:00). Scripted local stub first: asks location, nature, patient status, accepts SITREP answers, always rendered under the red SIMULATED banner. Then ElevenLabs Agents behind `flags.dispatcherSim`, falling back to the script.
8. **ElevenLabsProvider** (Sat 17:00). Streaming TTS through P3's proxy, same cancel semantics as WebSpeech, fall back to WebSpeech if no audio within 800 ms. Pick one warm authoritative voice.
9. **Narration validator** (`src/protocol/validate.ts`). Per-state required keywords (compressions must contain 'push'). Any miss -> canonical line. The flavor stub itself stays OFF.
10. **Stretch.** Generate a Mermaid diagram of each machine from the data for README and pitch. A test that greps `src/perception`, `src/protocol`, `src/voice` for `fetch(` and imports of `src/ai` and fails the build if any appear.

## P3, Face and ship

1. **Take over the M0 skeleton now.** Run it on the demo phone over LAN, get the HTTPS certificate flow smooth, keep README current. Move the docs into `docs/` is done; update CLAUDE.md headcount if three is final.
2. **FakePerception** (Sat 03:30). Implements `Perception` and emits synthetic facts: rate slider, stop toggle, cover-camera toggle, hands-off toggle. `?fake=1`. This is what lets P2 and you build M1 and M2 without a human on a pillow.
3. **Session orchestrator** `src/session.ts` (Sat 06:00). Perception -> `engine.onFacts`; engine outputs -> voice, log, metronome; 100 ms tick; listener fed by `engine.keywords()`; on `bleeding.pressure` entry call `setMode('pose+hands')` and `lockRoi()`, back to `pose` on exit; camera guidance spoken at most once per 10 s; SITREP starts and geolocation is requested when the first non-triage machine starts. Zero network calls in this file, enforced by P2's grep test.
4. **The four screens** (first cut Sat 11:00, iterate until 19:00). LAUNCH: one huge "I NEED HELP" button, dark, thumb reachable, "or just start talking". COACH: instruction text at least 48 px and readable at 1.5 m, live metric (rate or pressure timer), small camera thumbnail with overlay, CALL 911 persistent top, NEXT persistent bottom, red SIMULATED banner when the dispatcher panel is open. SITREP: read-aloud block plus live timeline. HANDOFF: headline metrics, timeline, QR. Plain CSS, portrait and landscape, Screen Wake Lock so a propped phone never sleeps, fullscreen on launch, `navigator.vibrate` on critical events.
5. **Button twins generated from `engine.availableTransitions()`**, nothing hand-coded per state. Any wedge is recoverable with one tap.
6. **Debug panel** `?debug=1`: engine state, latest facts, voice queue, log tail, flags. Everyone integrates through this.
7. **AI seams** (Sat 09:00). `src/flags.ts` (all OFF, `?flag=` override). `src/ai` stubs for VisionDescriber and NarrationFlavor with realistic demo data, and the DispatcherSim interface (P2 implements). ESLint `no-restricted-imports`: perception, protocol and voice may not import `src/ai`. Keep the TODO registry in docs/04 current.
8. **M4 integrations, in this order** (Sat 11:00 to 19:00). DigitalOcean Function proxy at `/api/proxy` with per-IP 30/min, keys only there. Gemini VisionDescriber on `bleeding.find_wound` entry using `perception.captureFrame()`; the model returns a noun list, the app filters it against a materials allowlist and slots it into the canonical template ("I can see a shirt. Grab it."), never free text. GoDaddy domain pointed at the DO app.
9. **Deploy** (first deploy Sat 13:00, then continuously). DigitalOcean App Platform static site plus one function, HTTPS. PWA precache of the app, wasm and models (vite-plugin-pwa, exception recorded) so an accidental reload with wifi off still loads.
10. **Pitch and Devpost** (Sat 19:00 onward). `docs/pitch.md` -> slides: stats verified against heart.org and stopthebleed.org, lineage slide with ChatCPR, the threat-model table from docs/01, the limits slide. Devpost text from these docs, video recorded Sat 23:00 from a full run, track Bloomberg only, opt-ins checked, all teammates added, repo public confirmed, submit Sun 08:40.

## Whole team

- Kill check Sat 09:00. If M1 is not green, everyone is on M1 and nothing else exists.
- Rehearsals: three Sat evening after the M4 freeze, three Sun 06:30 to 08:15, one of them with a hostile volunteer, one with wifi off (airplane mode on the phone, not just wifi).
- The demo behaviors in docs/05 are the acceptance tests: wifi off, button twins, blind test under 2 s, correction under 1 s, don't-let-go fast.
- Every hour someone commits. If a feature can't demo, it doesn't merge.

## Decisions to make in the first hour (gaps found reading the docs)

1. docs/02 uses a 'system' priority that `CoachingEvent` does not have. P2: blind lines are priority 'critical' with dedupeKey 'blind' and a 20 s cooldown, logged as kind 'system'.
2. Rules need `forMs` and `everyMs` semantics; the engine spec only has `when` + `cooldownMs`. P2 adds both to the Rule type.
3. Transitions cross machines (`triage -> cardiac.scene_check`, `choking -> cardiac.position`). The engine supports switching machines.
4. Keyword 'no' collides with 'no response', 'not breathing', 'no pulse'. Phrase-level matching, longest first, per state.
5. The hands-off rule fires at `handsOffMs > 1500` but the demo script promises the line "within 1.5 s". Set the threshold to 1000 ms, measure end to end, and only claim on stage what was measured.
6. CALL 911 opens the SIMULATED dispatcher panel in every hackathon build. A `tel:` link exists behind a build flag that stays off. Never a real line.
7. `qrcode` and `vite-plugin-pwa` are the only exceptions to the no-new-libraries rule. Both recorded in DECISIONS.
8. Demo device is an Android phone with Chrome (SpeechRecognition and MediaPipe both behave). Laptop is the backup. iOS only if time remains.
9. CLAUDE.md still says team of four. Update it if three is final.
