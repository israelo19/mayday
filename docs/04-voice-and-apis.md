# 04 - Voice I/O and the API stub registry

## Voice out (/src/voice/out.ts)
Single speaker queue with priorities:
- 'critical' preempts: cancel current utterance, speak immediately.
- 'correction' plays next, coalescing by dedupeKey (a newer 'rate-low' replaces a queued 'rate-low').
- 'narration' plays when idle only.
- Metronome is INDEPENDENT of speech (Web Audio oscillator tick, 60/bpm interval, slight accent every 4th beat). Speech never pauses it. Start/stop only by state config.
- Rate limiting: same dedupeKey max once per cooldownMs (engine passes it through).
- Implementation: `SpeakerProvider` interface with two impls:
  - `WebSpeechProvider` (default, works offline, zero keys): `speechSynthesis`, rate 1.05, prefer an en-US voice, cancel() support.
  - `ElevenLabsProvider` (LATER, behind stub): streaming TTS via proxy. Must implement the same cancel semantics. Falls back to WebSpeech on any error within 800ms.

## Voice in (/src/voice/in.ts)
- Web Speech API SpeechRecognition, continuous, interimResults on. KEYWORD SPOTTING ONLY: lowercase transcript, match against the active state's keyword list + the global keywords (`next`, `repeat`; 'ambulance here' is a per-state keyword and a standing button). No free-text goes anywhere near the protocol engine or any LLM authority path.
- Chrome-only reality: feature-detect; if unavailable, hide voice affordances, buttons carry the demo. Buttons ALWAYS exist for every transition regardless.
- Mic transcript lines are logged to EventLog as kind:'user' (they enrich the handoff report).

## Episodic AI (/src/ai) - ALL STUBBED NOW
Status: `VisionDescriber` and `NarrationFlavor` stubs live in `src/ai/vision.ts` and
`src/ai/narration.ts`, both returning hardcoded demo data, both flag-gated (`src/flags.ts`,
default OFF). `DispatcherSim` is interface-only in `src/ai/dispatcher.ts` for P3 to implement in
`src/voice` (docs/07 P3 task 7) via `import type` only. Boundary enforced by
`npm run lint` (`scripts/check-ai-boundaries.mjs`). DECISIONS.md records why that script exists
instead of ESLint.

Every function here has: an interface, a hardcoded stub returning realistic demo data, a feature flag (default OFF), and a TODO entry below. Build the app against stubs; wire keys later without touching call sites.

As of Sat 05:20 none of `VisionDescriber`, `NarrationFlavor` or `validateNarration` is called by the session, and `perception.captureFrame()` has no consumer; `visionDescribe` and `narrationFlavor` parse from the URL and nothing reads them. Items 4, 5, 7 and 8 below all start by wiring one of them in `web/session.ts`.

```ts
export interface VisionDescriber {
  // ONE frame in, called on bleeding.find_wound entry and cardiac.handoff.
  describeScene(frameJpegB64: string): Promise<{ sceneLine: string; materials: string[] }>;
}
export interface NarrationFlavor {
  // Paraphrases the canonical line. MUST return one of state.approvedLines
  // semantically; validator checks output contains required keywords for the
  // state (e.g. compressions: 'push'); on any miss, caller uses canonical text.
  flavor(canonical: string, stateId: string): Promise<string>;
}
export interface DispatcherSim {
  // Demo-only simulated 911 dispatcher. Disclosed on the LAUNCH screen, never on the panel.
  connect(onDispatcherLine: (t: string) => void): { sayToDispatcher(t: string): void; hangup(): void };
}
```

## TODO registry (implement later, in this order)
| # | What | Provider | Where it plugs in | Notes |
|---|---|---|---|---|
| 1 | Serverless key proxy | DigitalOcean Function | /api/proxy | Per-IP rate limit 30/min. Keys live ONLY here. Do first, everything below depends on it. |
| 2 | ElevenLabs streaming TTS | ElevenLabs | ElevenLabsProvider | Pick ONE warm authoritative voice; latency budget 400ms to first audio or fall back. Sponsor prize x2. |
| 3 | Simulated dispatcher agent | ElevenLabs Agents | DispatcherSim | Dispatcher persona; asks location, nature, patient status; our SITREP answers. Disclosed on LAUNCH, not on the panel. |
| 4 | Vision scene describe | Gemini API (sponsor prize) | VisionDescriber | Prompt: strictly describe visible scene + list cloth/materials usable for bleeding control; no advice, no diagnosis. Temperature low. |
| 5 | Narration flavor | Claude Haiku or Gemini | NarrationFlavor | OPTIONAL. Cut first if time is short; canonical lines are already written to be spoken. |
| 6 | Domain | GoDaddy (sponsor prize) | DNS -> DO app | 10 minutes, do during a lull. |
| 7 | Emergency suggestion from one frame, SHIPPED | Gemini API, `gemini-3.6-flash` (sponsor prize), through `/vision/assess` in the proxy; Featherless is the fallback provider in the same route | `EmergencyClassifier` in src/ai; session calls it once on `triage.listening` entry with `captureFrame()` | Closed label set {collapsed, bleeding, choking, unclear}; any other output is unclear. The label picks which pre-written triage line plays ("It looks like someone is down and not moving. Is he breathing?") and which button is highlighted; the human answers by voice or tap and the machine transitions. It never transitions by itself and never speaks model text. 3 s timeout, no effect on a miss. The on-device person-down cue in docs/03 is shipped and feeds the same suggestion row; this item is the cloud upgrade for the unclear case. |
| 8 | Intent to keyword, SHIPPED | Gemini API through `/intent/route` in the same proxy, no picture | `IntentRouter` in `src/ai/intent.ts`, called from `considerTranscript` only after `matchKeyword` AND `suggestRoute` have both missed | Narrowed from `engine.keywords()` to the button twins the current state offers, which is the same list the screen is showing. The model answers with the NUMBER of one of them and `parseIntent` returns the option object the engine minted, so an invented step is not expressible, not merely rejected. 0, out of range, low confidence, bad JSON or a 3 s timeout all mean null and nothing happens. The suggestion is the same amber Yes/No bar a heard phrase earns; the engine moves only on the confirmed keyword. One sentence in flight at a time, 8 s between tries. Behind `?flag=intentRoute`. |

## Sponsor prize mapping (so nobody forgets why a dependency exists)
ElevenLabs opt-ins: items 2+3. Gemini opt-in: item 7 is the shipped one (one frame to `gemini-3.6-flash`, closed-label JSON, patient box on the 0 to 1000 scale); items 4 and 5 fold into it or stay stubs. DigitalOcean opt-in: item 1 + hosting. GoDaddy opt-in: item 6. If any integration is not stable by Sat 11 PM, its flag stays OFF and the stub ships; a working demo outranks every opt-in prize.
