# 10 - The session: voice in, instructions out

`web/session.ts` is where the modules meet. It is the only file that knows perception, the
protocol engine, the voice module and the event log all exist. The engine (docs/02, docs/08)
decides every medical line; the session moves data between modules and keeps the clock.

```
 mic ── voice.listen ──> engine.onKeyword ──┐
 camera ── perception ──> engine.onFacts ───┤
                                            v
                                     engine outputs
                        ┌──────────────┼───────────────┐
                        v              v               v
                 voice.out.enqueue   event log     state_enter
                 (lines, corrections)  (SITREP,      (metronome on/off,
                                        handoff)      camera mode, phase)
```

## What happens when someone speaks

1. `voice.listen()` spots keywords from `engine.keywords()`, the current state's list plus
   `next` and `repeat`. Echo suppression is inside the voice module: while the app speaks
   and for 700 ms after, a keyword the app itself just said is held back and nothing from
   that stretch is logged; a transcript that reads back one of the app's own lines is
   dropped. WebKit never sends a final, so an interim unchanged for 1.2 s is the sentence.
   Nothing else about the transcript is used.
2. `engine.onKeyword(k)` runs the machine data. In `triage.listening`, "he's not breathing"
   resolves to `not breathing` and enters `cardiac.scene_check`; "he got shot" enters
   `bleeding.scene_safety`; "she's choking" enters `choking.confirm`. Inside a machine the
   same path answers questions ("no response", "I am safe", "still bleeding").
3. `state_enter` arrives: the session starts or stops the metronome from the state's config,
   switches the camera to `pose+hands` and locks the wound region on `bleeding.pressure` and
   `bleeding.pack` (back to `pose` on the way out), requests a geolocation fix once when the
   first medical machine starts, and sets the phase (`triage`, `coaching`, `handoff`).
4. The state's `say` lines are enqueued at narration priority and appear on screen. The
   picture for the state comes from `web/ui/guide` (`guideFor('cardiac.position')`), keyed
   by the same `machine.state` string the engine emits.

Every keyword has a button twin (docs/05). `snapshot().twins` lists them per state, one per
target state, from the machine data. NEXT is `engine.advance()`. "Ambulance is here" is
`session.finish()`, a standing button in every coaching state that jumps to the machine's
terminal state, so a state's own `ambulance here` keyword is not listed again as a twin.

## The few lines the session speaks itself

None of them are medical. Camera guidance ("Move the phone closer", "It's too dark") is
spoken at most once per ten seconds, only in the states that watch the rescuer
(`WATCHING_STATES`), and never the "I can't see you" variant because the engine's own blind
rule already says that. If the hands never settle on the wound within ten seconds,
`ROI_FAILED_LINE` is spoken once for that state and logged as `system`.

## What the screen reads

`useSession(session)` returns one `SessionSnapshot` per change (about ten a second while
coaching). Everything on the live screen is a function of it: phase, machine label, the
state's lines and which one the voice is on, the button twins, the metronome rate, the
latest facts, the active correction, blind, guidance, the listening chip, the dispatcher
transcript, and the SITREP and handoff reports rebuilt every second from the log.

`web/ui/live/LiveApp.tsx` is the first cut of the camera-fills-the-screen layout with
floating elements. P4 owns its look; the data seam is the snapshot and the eight actions on
`Session` (`start`, `advance`, `say`, `heard`, `finish`, `call911`, `replyToDispatcher`,
`hangUp`, plus `readSitrepAloud`, `qr`, `restart`).

## Testing it without a camera or a mic

- `?fake=1` swaps in P2's FakePerception with floating controls: rate slider, stop pushing,
  cover lens, lift hands. The whole loop runs on a laptop.
- `window.mayday` is the session. `mayday.log.entries()` shows exactly what was heard and
  said, with timestamps; `mayday.say('not breathing')` routes like speech.
- `web/session.test.ts` covers routing, twins, metronome, facts to correction, camera mode
  switching, the hands-never-settled line, SITREP with a location, the dispatcher, restart.

## Honesty notes for the demo

Chrome's speech recognition sends audio to Google. With the network off the chip reads
"Voice off, use the buttons" and every transition is still one tap; coaching, corrections,
the metronome and speech output are local. The CALL 911 button opens the scripted
simulated dispatcher under a red label; it never dials.
