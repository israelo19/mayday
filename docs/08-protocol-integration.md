# 08 - Wiring the protocol and SITREP modules

For P3 and P4. The shapes below are final; `src/types.ts` changes are announced before they
land. Everything here is pure and offline: no network call, no clock read, no randomness, and
a test in `tests/boundaries.test.ts` fails the build if that stops being true.

## What P4 calls

```ts
import { createEngine, machines, matchKeyword } from './protocol';
import { createEventLog, buildSitrep, buildHandoff, handoffQrPayload, qrDataUrl } from './sitrep';
import { createFakePerception } from './perception/fake';

const log = createEventLog();
const engine = createEngine(machines);

engine.subscribe((out) => {
  if (out.type === 'coach') voice.enqueue(out.event);
  if (out.type === 'log') log.append(out.entry);
  if (out.type === 'state_enter') {
    out.metronome === null ? voice.stopMetronome() : voice.startMetronome(out.metronome);
  }
});

perception.subscribe((facts) => engine.onFacts(facts));
setInterval(() => engine.tick(Date.now()), 100);   // the engine never reads the clock itself
engine.start('triage');
```

Two things the orchestrator owns, because the engine deliberately does not:

- **The clock.** `tick(now)` is the only way timers advance. Call it every 100 ms.
- **Perception mode.** On entering `bleeding.pressure` or `bleeding.pack`, call
  `perception.setMode('pose+hands')` and `perception.lockRoi()`; call `setMode('pose')` and
  `unlockRoi()` on the way out. The engine does not know MediaPipe exists.

Buttons come from `engine.availableTransitions()`, which returns `{ label, keyword }` for every
keyword transition in the current state. `engine.advance()` is the NEXT button and is legal in
every non-terminal state; the linter enforces that.

`?fake=1` should swap in `createFakePerception()`. It implements the same `Perception`
interface and takes `{ rate, compressing, cameraCovered, handsOn }` controls, which is what the
debug panel should expose.

## What P3 calls

`engine.keywords()` is the whole list the listener should spot for in the current state, state
keywords plus `next` and `repeat`. Feed raw transcripts straight to `engine.onKeyword(text)`:
matching is phrase level, word bounded and longest first, so "he's not breathing" resolves to
`not breathing` and never to `no`. `matchKeyword(transcript, keywords)` is exported if you want
to filter before calling in.

`CoachingEvent` now carries `t`, the timestamp of the fact that triggered the line. Latency is
`utteranceStart - event.t`; no second channel needed.

`cooldownMs` on the event is the engine asking the queue to drop a repeat of the same
`dedupeKey` inside that window. The engine already applies its own cooldown, so the queue's job
is only to coalesce what is already queued.

## One rule my tests enforce on your files

`tests/boundaries.test.ts` fails the build if a network call appears in `src/perception`,
`src/protocol`, `src/sitrep` or `src/voice`. That is docs/07 task 9, and it is what keeps the
wifi-off demo honest.

P3: there is exactly one exemption, `src/voice/providers/`. Put `ElevenLabsProvider` and the
ElevenLabs dispatcher agent there and the test leaves you alone. The voice queue in
`src/voice/out.ts` must not import from that directory; `setProvider()` injects the upgrade, so
the default stays local. If a network call lands anywhere else on the path, the failure message
names the file and where it belongs.

## Two open questions

1. **P3: narration must not be dropped.** State-entry lines are enqueued at `narration`
   priority, as docs/02 specifies. docs/04 says narration "plays when idle only". If that means
   discarded while busy, a state's instructions can be lost when a critical line lands at the
   same moment. The queue should hold narration until idle rather than drop it.
2. **P4: geolocation timing.** `buildSitrep(log, geo, now)` takes the fix as an argument. The
   orchestrator should request it once, when the first non-triage machine starts, and pass the
   last known fix thereafter. The SITREP says plainly that it has no fix rather than inventing
   one.

## What the report says, and what it refuses to say

`buildSitrep` produces `readAloud`, the lines the bystander reads to the dispatcher, in the
order a dispatcher asks for them. `buildHandoff` produces `headline`, the metrics a paramedic
wants.

Every number is folded out of the event log, so the report can only claim what the session
recorded. Time the camera could not see is reported as `unmeasuredMs` and never as a pause.
