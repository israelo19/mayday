# 09 - Wiring the voice module

For P4's orchestrator (and whoever rebuilds the protocol engine — see the note at the end).
Everything under `src/voice` is offline by construction: `src/voice/boundaries.test.ts` fails
the suite if a network token appears outside `src/voice/providers/`, and the queue never
imports that directory — `setProvider()` injects upgrades, so the default stays local.

## What P4 calls

```ts
import { createVoice } from './voice';

const voice = createVoice(); // WebSpeech + metronome + latency log, assembled

// Inside the first tap (I NEED HELP): audio and speech unlock once, never again.
await voice.out.unlock();

// Engine outputs -> the queue. State-entry metronome config drives start/stop.
engine.subscribe((out) => {
  if (out.type === 'coach') voice.out.enqueue(out.event);
  if (out.type === 'state_enter') {
    out.metronome === null ? voice.out.stopMetronome() : voice.out.startMetronome(out.metronome);
  }
});

// Perception facts pass through so latency is measured fact -> audible (see below).
perception.subscribe((f) => {
  voice.out.noteFacts(f);
  engine.onFacts(f);
});

// The listener: echo suppression is already composed in; do not add your own.
voice.listen({
  keywords: () => engine.keywords(),
  onKeyword: (k) => engine.onKeyword(k),
  onTranscript: (t) => log.append({ t: Date.now(), kind: 'user', detail: t }),
  onStatus: (s) => {/* hide voice affordances when s === 'unavailable' */},
});

// SITREP screen: speak the read-aloud block on tap. Criticals interrupt it and win.
voice.readAloud.start(sitrep.readAloud);

// CALL 911 button: the SIMULATED panel. Render the red banner yourself.
const call = voice.dispatcher.connect((line) => panel.show(line));
call.sayToDispatcher(whatTheBystanderSaid);
call.hangup();

// Debug panel: voice.stats() -> { all, byKind } with p50/p95/worst per priority.
```

## Rules the queue enforces (so nobody re-implements them upstream)

- `critical` preempts anything non-critical; a critical never chops another critical.
- A chopped **narration** line replays in full when the queue is next idle.
- `correction` coalesces by `dedupeKey` (newest text wins, queue position kept).
- The same `dedupeKey` is audible at most once per cooldown window (default 6000 ms,
  `event.cooldownMs` wins if present), checked at enqueue AND at play time.
- Narration is **held until idle, never discarded** — except narration for a state the
  protocol has already left, which is dropped unplayed. The queue infers the current state
  from the newest enqueued event; `voice:`-prefixed stateIds (read-aloud, dispatcher) are
  exempt and never count as protocol state.
- Repeats of the same correction escalate **delivery** (rate/pitch/volume, plus an earcon
  before criticals). The words are never altered: prosody is P3's, text is the machine's.

## Latency (docs/07 P3 task 4)

`CoachingEvent.t` is the timestamp of the fact that triggered the line and the engine always
sets it (DECISIONS Sat 02:00). The orchestrator still calls `voice.out.noteFacts(f)` on every
perception tick: lines without a `t` (read-aloud, dispatcher, the guide gallery) are attributed
to the newest fact. Latency is measured to the moment audio starts. Numbers land in
`docs/latency.md`.

## Echo suppression (the M2 "app never hears itself" gate)

Two layers, both wired inside `voice.listen()`:
1. results are ignored while the app speaks and for `ECHO_TAIL_MS` (700 ms) after;
2. a transcript that reads back one of the app's own recent lines nearly verbatim
   (>= 4 words, >= 80% in order) is dropped even later than that.
A bystander's short answer ("not breathing") is never suppressed. If a demo room still
defeats this, the fallback is a HOLD TO TALK button — buttons are the floor regardless.

## ElevenLabs behind the flag (docs/04 item 2, `flags.elevenLabs`)

Wired in `web/providers.ts` (`createSpeaker`, `createDispatcher`) and handed to the session by
`LiveApp` (DECISIONS Sat 05:55); this is the shape:

```ts
import { ElevenLabsProvider } from './voice/providers/elevenlabs';
import { COACH_VOICE_ID, COACH_VOICE_NAME, DISPATCHER_VOICE_ID } from './voice/providers/voices';

if (flags.elevenLabs) {
  const el = new ElevenLabsProvider({
    voiceId: COACH_VOICE_ID,               // Brian: calm, low, authoritative
    voiceName: COACH_VOICE_NAME,           // what the ?debug=1 voice chip shows
    dispatcherVoiceId: DISPATCHER_VOICE_ID, // Sarah: clearly a second person on stage
    fallback: new WebSpeechProvider(1.05), // omit dispatcherVoiceId and those lines use its second voice
    // baseUrl defaults to '/api/proxy': the key proxy, which vite.config.ts mounts on the dev
    // and preview servers themselves when .env.local holds ELEVENLABS_API_KEY, and which the
    // DigitalOcean Function will own in production (docs/04 TODO 1).
  });
  voice.out.setProvider(el);
  void el.warm(allCanonicalLines); // ~1.8k credits once; replays are then free AND offline
}
```

- The key lives in the proxy's environment only. Never `VITE_`-prefix it: Vite inlines
  `VITE_*` into the public bundle, which is the threat-model row about the demo QR.
- Same origin matters on the phone: an https page cannot call an http port on the laptop
  (mixed content), so a separate proxy process was never going to work there. The
  standalone `node src/voice/providers/devproxy.mjs` remains for laptop console sessions.
- Model `eleven_flash_v2_5` (lowest latency, 0.5 credits/char), `mp3_22050_32`. Measured
  through the proxy from the laptop: ~510 ms for a 50-character line, inside the budget.
- No audio within 800 ms -> that line speaks on WebSpeech; three misses in a row -> the
  session stops trying until a `warm()` succeeds. Pulling wifi mid-demo costs at most one
  line's gap, and warmed lines keep playing in the ElevenLabs voice with the wifi off.
- `unlock()` now resumes the provider's own AudioContext too, so call it inside the first
  tap (I NEED HELP): later lines start from fetch callbacks, which mobile Chrome would mute.
- Rehearse with the flag OFF; flip it for the judged run. The cache makes that cheap.
  `?flag=elevenLabs,dispatcherSim` flips both ElevenLabs features at once (src/flags.ts).

## The live dispatcher (docs/04 item 3, `flags.dispatcherSim`)

`createAgentDispatcher` in `src/voice/providers/elevenlabs-agent.ts` implements the same
`DispatcherSim` shape as the script, with the scripted dispatcher as its `fallback`:

```ts
const scripted = createScriptedDispatcher(voice.out);
const dispatcher = flags.dispatcherSim
  ? createAgentDispatcher({ fallback: scripted, onStatus: panel.setStatus, onTranscript: log.user })
  : scripted;
const call = dispatcher.connect((line) => panel.show(line)); // under the red SIMULATED banner
```

- The browser holds no agent id. `GET /api/proxy/dispatcher/session` returns a signed
  WebSocket URL plus the agent's configured opening line (the socket delivers that line as
  audio only). The proxy reads `ELEVENLABS_AGENT_ID` from `.env.local`;
  `scripts/create-dispatcher-agent.mjs` creates the agent and prints that line.
- Audio both ways is base64 PCM16 at 16 kHz. The mic runs in an `AudioContext` pinned to
  16 kHz with echo cancellation on, because the phone speaker is inches from it. The agent's
  chunks are scheduled back to back on one context; an `interruption` event flushes them.
- Falls back to the script, with the same panel callback, on: no agent configured, mic
  refused, socket refused or dropped, no initiation metadata within 4 s. Replies typed
  meanwhile are replayed to whichever side wins. `onStatus` reports connecting / live /
  fallback / ended for the panel's chip.
- The agent's prompt forbids medical instructions ("keep following the coaching you are
  hearing"). It is a stage character; the machines stay the only authority (principle 1).
- Voice input needs network, same honesty note as below. The scripted call works with wifi off.

## Honesty note for the pitch (P4)

Chrome's `SpeechRecognition` sends audio to Google's servers. With wifi off, keyword
spotting stops; coaching, metronome, corrections, blind mode and WebSpeech output all keep
working. Say "voice input needs network; coaching and voice output are local" — never a
flat "works offline". Buttons twin every voice path, so the wifi-off demo stands either way.

## History

P2's engine was briefly lost with a deleted branch and restored from `recovered/p2-brain`
(merged to `listen` Sat 04:15, on `main` since PR #14). This module needed no change.
