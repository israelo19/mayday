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
  - `ElevenLabsProvider` (shipped, behind `?flag=elevenLabs`): streaming TTS via proxy. Same cancel semantics. Falls back to WebSpeech when no audio arrives within 800 ms.

## Voice in (/src/voice/in.ts)
- Web Speech API SpeechRecognition, continuous, interimResults on. KEYWORD SPOTTING ONLY: lowercase transcript, match against the active state's keyword list + the global keywords (`next`, `repeat`; 'ambulance here' is a per-state keyword and a standing button). No free-text goes anywhere near the protocol engine or any LLM authority path.
- Chrome-only reality: feature-detect; if unavailable, hide voice affordances, buttons carry the demo. Buttons ALWAYS exist for every transition regardless.
- A final transcript nothing spotted falls through, in order: triage cue scoring (src/protocol/phrases.ts) -> the intent router (`?flag=intentRoute`, src/ai/intent.ts) with the state's moves and the machine's approved answers -> a spoken acknowledgment. Each layer can only ever ASK or speak an approved answer; the engine still moves on keywords and taps alone (DECISIONS.md Sat 07:45, 21:55).
- Mic transcript lines are logged to EventLog as kind:'user' (they enrich the handoff report).

## Episodic AI (/src/ai), status by code
Shipped, each behind its flag and each with a local fallback: item 2, the ElevenLabs voice
(`src/voice/providers/elevenlabs.ts`); item 3, the dispatcher agent
(`src/voice/providers/elevenlabs-agent.ts`, created once by `scripts/create-dispatcher-agent.mjs`);
item 5, the rewording (`ModelNarrationFlavor` in `src/ai/narration.ts`, chosen in `web/providers.ts`,
validated by `src/protocol/validate.ts`); item 7, the scene photo (`src/ai/assess.ts`, called
once from `web/session.ts` with `perception.captureFrame()`); item 8, the intent router
(`src/ai/intent.ts`). Not shipped: item 1, the serverless proxy (the dev proxy
`src/voice/providers/devproxy.mjs` does the job on the dev and preview servers); item 4, vision
describe (`src/ai/vision.ts` is still the stub, and `flags.visionDescribe` is parsed by
`src/flags.ts` and read nowhere); item 6, the domain. `DispatcherSim` is an interface in
`src/ai/dispatcher.ts`, implemented in `src/voice` (the scripted stub, then the agent) via
`import type` only. Boundary enforced by `npm run lint` (`scripts/check-ai-boundaries.mjs`);
DECISIONS.md Sat 02:05 records why that script exists instead of ESLint.

Every function here has: an interface, a local fallback that never touches the network, a feature flag (default OFF), and a row in the registry below. The session is built against the fallbacks, so a missing key or a dead network changes nothing it says.

The flags that do something: `elevenLabs`, `dispatcherSim`, `sceneAssess`, `intentRoute`, `narrationFlavor`. `visionDescribe` is reserved for item 4 and does nothing. `perception.captureFrame()` has one consumer, the scene photo in `web/session.ts`.

```ts
export interface VisionDescriber {
  // ONE frame in, called on bleeding.find_wound entry and cardiac.handoff.
  describeScene(frameJpegB64: string): Promise<{ sceneLine: string; materials: string[] }>;
}
export interface NarrationFlavor {
  // Rewords ONE canonical line for the moment: what the person just said, what the
  // camera measures (plain phrases, numbers listed), how often the line has been said,
  // and the validator's length budget. Returns one line or null. The session runs
  // validateNarration (numbers kept and none invented, required words, length, no
  // forbidden terms) and speaks the canonical line on any miss (docs/04 item 5).
  flavor(canonical: string, ctx: FlavorContext): Promise<string | null>;
}
export interface DispatcherSim {
  // Demo-only simulated 911 dispatcher. Disclosed on the LAUNCH screen, never on the panel.
  connect(onDispatcherLine: (t: string) => void): { sayToDispatcher(t: string): void; hangup(): void };
}
```

## TODO registry (implement later, in this order)
| # | What | Provider | Where it plugs in | Notes |
|---|---|---|---|---|
| 1 | Serverless key proxy, NOT SHIPPED | DigitalOcean Function | /api/proxy | Today the dev proxy (`src/voice/providers/devproxy.mjs`) is mounted at /api/proxy by the dev and preview servers and enforces a per-IP limit of 120 requests a minute (not 30: the app warms about sixty canonical lines in its first minute, `DEFAULT_RATE_PER_MINUTE`), a same-origin gate and request body caps; the serverless version inherits all three. Keys live ONLY in the proxy. Everything below depends on it. |
| 2 | ElevenLabs streaming TTS, SHIPPED | ElevenLabs | ElevenLabsProvider | ONE warm authoritative voice (Brian); latency budget 800 ms to first audio (`firstAudioTimeoutMs`) or fall back to WebSpeech. Sponsor prize x2. |
| 3 | Simulated dispatcher agent, SHIPPED | ElevenLabs Agents | DispatcherSim | Dispatcher persona; asks location, nature, patient status; our SITREP answers. Disclosed on LAUNCH, not on the panel. |
| 4 | Vision scene describe, NOT SHIPPED | Gemini API (sponsor prize) | VisionDescriber | Prompt: strictly describe visible scene + list cloth/materials usable for bleeding control; no advice, no diagnosis. Temperature low. `src/ai/vision.ts` is the stub; item 7 took the one photo instead. |
| 5 | Narration flavor, SHIPPED | Whichever provider the proxy holds, through `/text/complete` (Gemini, Featherless, or xAI/Grok on the HopHacks credits) | `ModelNarrationFlavor` in `src/ai/narration.ts`; the validated cache in `web/session.ts` | Behind `?flag=narrationFlavor` (DECISIONS.md Sat 20:40). ONE canonical line plus the moment (what the person just said, the camera's numbers as plain phrases, how often the line has been said, a length budget) goes to the model; `validateNarration` keeps the line's numbers, refuses any number it was not shown, keeps the required words, bounds the length and bans the forbidden terms; the canonical line speaks on any miss. Never late: a step's own lines are reworded before the step is reached; a nag is canonical the first time and personal on its repeat. |
| 6 | Domain, NOT DONE | GoDaddy (considered, not entered) | DNS -> DO app | Never got its lull; no domain exists. |
| 7 | Emergency suggestion from one frame, SHIPPED | Gemini API, `gemini-3.6-flash` (sponsor prize), through `/vision/assess` in the proxy; Featherless is the fallback provider in the same route | `EmergencyClassifier` in src/ai; session calls it once on `triage.listening` entry with `captureFrame()` | Closed label set {collapsed, bleeding, choking, unclear}; any other output is unclear. The label picks which pre-written triage line plays ("It looks like someone is down and not moving. Is he breathing?") and which button is highlighted; the human answers by voice or tap and the machine transitions. It never transitions by itself and never speaks model text. Sent about 1.2 s into triage (`ASSESS_AFTER_MS`), 6 s timeout (`ASSESS_TIMEOUT_MS`), one retry at 6 s, two tries at most, no effect on a miss. The on-device person-down cue in docs/03 is shipped and feeds the same suggestion row; this item is the cloud upgrade for the unclear case. |
| 8 | Intent to keyword, SHIPPED | Gemini API through `/intent/route` in the same proxy, no picture | `IntentRouter` in `src/ai/intent.ts`, called from `considerTranscript` only after `matchKeyword` AND `suggestRoute` have both missed | Narrowed from `engine.keywords()` to the button twins the current state offers, which is the same list the screen is showing. The model answers with the NUMBER of one of them and `parseIntent` returns the option object the engine minted, so an invented step is not expressible, not merely rejected. 0, out of range, low confidence, bad JSON or a 3 s timeout all mean null and nothing happens. The suggestion is the same amber Yes/No bar a heard phrase earns; the engine moves only on the confirmed keyword. One sentence in flight at a time, 8 s between tries. Behind `?flag=intentRoute`. Since Sat 21:55 the list also carries the machine's approved answers, marked Question (`KeywordResponse.label`; 26 across cardiac and bleeding, 14 and 12), and the state's own keyword to the terminal step: an answer the model picks speaks at once, since nothing moves, and a sentence nothing could place earns one spoken acknowledgment. xAI/Grok serves the same route when it is the configured provider. |

## Sponsor challenge mapping (so nobody forgets why a dependency exists)
Three challenges entered, the ones CLAUDE.md names. ElevenLabs: items 2 and 3. Gemini API: item 7 (one frame to `gemini-3.6-flash`, closed-label JSON, patient box on the 0 to 1000 scale); item 4 stayed a stub, and item 5 runs on whichever text provider the proxy holds. SpaceXAI: the xAI provider row serving items 5 and 8 on the HopHacks credits, `MODEL_PROVIDER=xai`. DigitalOcean (item 1 plus hosting), GoDaddy (item 6) and Auctor were considered and not entered: no function and no domain shipped. The rule that held: if an integration is not stable by Sat 11 PM, its flag stays OFF and the fallback ships; a working demo outranks every opt-in prize.
