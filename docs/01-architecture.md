# 01 - Architecture

## Data flow (the only diagram that matters)
```
camera frames ──> Perception (MediaPipe, on-device, 15-30 fps)
                    │  emits PerceptionFacts
                    v
mic keywords ──> Protocol Engine (deterministic state machines)
                    │  current state = one ProtocolState
                    │  emits CoachingEvents + logs EventLog entries
                    v
                 Voice Out (priority queue -> TTS + metronome)
                    │
                 UI overlays (state title, big instruction text, live metrics)

EventLog ──> SITREP builder ──> SITREP screen / handoff report
Episodic AI (one scene photo, one unmatched sentence, one reworded line) hangs OFF the
protocol engine as optional enrichment: web/session.ts turns its answers into a question,
a suggestion or a validated paraphrase. It can never emit a CoachingEvent.
```

## Core types (define these first, in /src/types.ts)
```ts
// Facts are measurements, never advice.
export type PerceptionFacts = {
  t: number;                    // ms epoch
  poseConfidence: number;       // 0..1, min visibility across used landmarks
  compressionRate: number|null; // per minute, sliding 10s window
  compressionActive: boolean;   // oscillation detected in last 2s
  recoilRatio: number|null;     // 0..1, trough return quality proxy
  handsOnRegion: boolean|null;  // bleeding module: hands within wound ROI
  handsOffMs: number|null;      // continuous ms hands have been off ROI
};

export type CoachingEvent = {
  priority: 'critical'|'correction'|'narration';
  text: string;                 // canonical line from the state machine
  stateId: string;
  dedupeKey?: string;           // e.g. 'rate-low' so we can rate-limit nags
};

export type EventLogEntry = {
  t: number;
  kind: 'state_enter'|'metric'|'coach'|'user'|'system';
  detail: string;               // human-readable, goes into handoff report
};
```

## Module contracts
- Perception exposes `subscribe(cb: (f: PerceptionFacts) => void)` and `getCameraGuidance(): string|null` ("move back", "can't see the patient", null when good). It knows NOTHING about protocols.
- Protocol engine exposes `start(machineId)`, `onFacts(f)`, `onKeyword(k)`, `advance()`, `currentState()`. It is a pure function of (machine data, facts, keywords, timers). It knows NOTHING about MediaPipe or TTS, and nothing about any particular emergency: every emergency-specific line, threshold and transition lives in a machine file under /src/protocol/machines. A new emergency is a new machine file that passes the machine linter; the engine, perception and voice stay untouched.
- Voice out exposes `enqueue(e: CoachingEvent)`, `startMetronome(bpm)`, `stopMetronome()`. Priority rules in docs/04.
- The ONLY module allowed to call cloud AI is /src/ai, and its only consumer is web/session.ts: the scene photo (src/ai/assess.ts) becomes a question the human answers, the sentence router (src/ai/intent.ts) becomes a suggestion the human confirms, and the rewording (src/ai/narration.ts) passes src/protocol/validate.ts or the canonical line plays. Perception, protocol and voice may not import /src/ai: enforced by `npm run lint` (`scripts/check-ai-boundaries.mjs`, DECISIONS.md Sat 02:05, in place of the ESLint rule first planned) and by tests/boundaries.test.ts.

## Threat model mapped to code (this becomes a pitch slide)
| Threat | Structural mitigation | Where |
|---|---|---|
| Prompt injection via panicked speech / bystander audio | Speech is keyword-spotted data to the engine; LLM has no authority over next-step selection; narration output validated against current state's approved set | /src/voice/in.ts, /src/ai/narration.ts + /src/protocol/validate.ts |
| Privacy: filming a medical emergency | Frames processed in-browser and discarded; only derived metrics persist; nothing leaves device except episodic single frames (feature-flagged) and SITREP text | /src/perception |
| Privacy: the location fix | Reverse geocoding sends the GPS fix to nominatim.openstreetmap.org from the phone, once per session and not behind a flag, so the SITREP can read out a street address. A known network hop, outside the coaching loop; on any failure the raw coordinates are read instead | /web/geocode.ts |
| Perception failure -> wrong coaching | Confidence gate: below threshold, facts are null and engine runs audio-only branch, announced out loud | /src/perception, engine guards |
| Swatting / false 911 reports | No autonomous dialing anywhere in the codebase; the dispatcher is disclosed as simulated on the LAUNCH screen | /web/ui, /src/sitrep |
| Tampering with medical content | Machines are static typed data compiled into the bundle, never fetched at runtime | /src/protocol/machines |
| API key theft from demo QR | Keys only in the key proxy (`src/voice/providers/devproxy.mjs`, mounted by the dev and preview servers; its serverless version is docs/04 TODO 1), which enforces a per-IP limit of 120 requests a minute, a same-origin gate and request body caps | /src/voice/providers, /src/ai |
