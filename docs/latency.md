# Voice latency (docs/07 P3 task 4)

The two stage claims and how they are measured. Rule: the slide says only what this file
records, and this file records only phone runs — laptop numbers do not count.

## What is measured

`fact time -> audio start`, per priority. The orchestrator feeds every perception tick to
`voice.out.noteFacts(f)`; when a line becomes audible (`SpeechSynthesisUtterance.onstart`,
or first decoded ElevenLabs audio), the queue records `start - newestFactTime` into the
ring buffer behind `voice.stats()`.

To read the numbers during a run: the debug panel, or `voice.stats()` in the console —
`{ all, byKind: { critical, correction, narration } }`, each `{ count, p50, p95, worst }`.

## Budgets (docs/05, docs/07)

| Claim | Budget | Measured by |
|---|---|---|
| Correction audible after the triggering fact | < 1 s | `byKind.correction.p95` |
| Blind line after covering the lens | < 2 s end to end | stopwatch on video + `byKind.critical` |

The blind budget includes P1's detection time (their gate: fact within 1.2 s of the cover),
so it is measured end to end on camera, not from this module alone.

## Protocol for a measurement run

1. Demo phone (Android + Chrome), same LAN, `?fake=1` for the correction runs.
2. One tap on I NEED HELP (unlocks audio), reach `compressions`, metronome on.
3. Corrections: drive the fake's rate slider below 100 twenty times, spaced past the
   cooldown. Record `byKind.correction` p50/p95/worst here.
4. Blind: cover the lens ten times mid-coaching; time cover -> first word on a slow-mo
   screen recording. Record p50/worst here.
5. Repeat run 3 once with `flags.elevenLabs` on (cache warm) and once with wifi off.

## Results

| Date | Device | Provider | N | correction p50 | correction p95 | worst | Notes |
|---|---|---|---|---|---|---|---|
| TBD | demo phone | WebSpeech | - | - | - | - | blocked: no engine on main emits CoachingEvents yet (see docs/09) |

| Date | Device | Blind runs N | cover -> word p50 | worst | Notes |
|---|---|---|---|---|---|
| TBD | demo phone | - | - | - | needs P1's low-confidence fact + an engine blind rule |

Until an engine lands, the queue's own numbers can be sanity-checked from the debug screen
by enqueueing synthetic events; those numbers validate the queue (typically a few tens of
ms plus TTS spin-up) but are NOT the stage claim and do not go in the tables above.
