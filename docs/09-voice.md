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

`CoachingEvent` currently carries no fact timestamp, so the orchestrator MUST call
`voice.out.noteFacts(f)` on every perception tick; each coaching line is attributed to the
newest fact and measured to the moment audio starts. If `types.ts` ever regains `t` on
`CoachingEvent`, that value wins automatically. Numbers land in `docs/latency.md`.

## Echo suppression (the M2 "app never hears itself" gate)

Two layers, both wired inside `voice.listen()`:
1. results are ignored while the app speaks and for `ECHO_TAIL_MS` (700 ms) after;
2. a transcript that reads back one of the app's own recent lines nearly verbatim
   (>= 4 words, >= 80% in order) is dropped even later than that.
A bystander's short answer ("not breathing") is never suppressed. If a demo room still
defeats this, the fallback is a HOLD TO TALK button — buttons are the floor regardless.

## Honesty note for the pitch (P4)

Chrome's `SpeechRecognition` sends audio to Google's servers. With wifi off, keyword
spotting stops; coaching, metronome, corrections, blind mode and WebSpeech output all keep
working. Say "voice input needs network; coaching and voice output are local" — never a
flat "works offline". Buttons twin every voice path, so the wifi-off demo stands either way.

## For whoever restores the protocol engine

P2's engine/machines/SITREP were lost with their deleted branch; `recovered/p2-brain`
(pushed from a local copy) holds all eight commits. The queue consumes plain
`CoachingEvent`s and already reads the richer optional fields (`t`, `cooldownMs`) that
P2's version added, so either restoring their work or rebuilding leaves this module as-is.
