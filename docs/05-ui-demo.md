# 05 - UI and the demo contract

## Screens (there are only four; resist adding a fifth)
1. LAUNCH: one huge button "I NEED HELP" + the line "or just start talking". Tapping or any triage keyword enters triage. Dark background, maximum contrast, thumb-reachable. Nothing else. (Design rationale for judges: literature shows guidance apps can delay the start of care; our launch is zero-navigation.)
2. COACH: what the phone shows while propped on the ground. Current instruction in giant text (readable at 1.5m), live metric (rate number, or continuous-pressure timer), camera preview small in a corner with pose overlay, CALL 911 button persistent top, NEXT button persistent bottom (manual advance fallback), red SIMULATED DISPATCHER banner when that panel is open.
3. SITREP: "Say this to the dispatcher" read-aloud block (location, emergency, status) + live timeline.
4. HANDOFF: headline metrics (CPR started at, avg rate, pauses, pressure time), timeline, QR of report JSON. This is the closing shot of the demo.

## Non-negotiable demo behaviors (test these, they are the product)
- Wifi off: coach screen, metronome, rate coaching, all voice via WebSpeech keep working. We kill wifi live on stage.
- Judge-proof: every voice transition has a visible button twin. A wedged demo must be recoverable by one tap without explanation.
- The blind test: cover the camera mid-compressions => app says the blind-mode line within 2s and keeps the metronome. Judges will do this without asking.
- Latency: correction lines audible within ~1s of the triggering fact. If ElevenLabs adds more, demo on WebSpeech.

## Demo script (rehearse 6x, once with a hostile volunteer, once with wifi off)
1. Cold open stat (see pitch notes) -> teammate collapses.
2. Phone handed to a JUDGE. "I NEED HELP." Judge says "he's not breathing."
3. App walks judge through position; judge compresses a duffel; metronome; app corrects the judge's real rate; cover-the-camera beat -> blind mode line.
4. Bleeding beat with teammate #2 + red cloth: judge presses, lifts hands to peek, app: "Don't let go!" within 1.5s.
5. SITREP + simulated dispatcher exchange (SIMULATED banner visible).
6. Wifi off, coaching continues. Close on HANDOFF screen: "and the ambulance is still four minutes away."
Record a full run as the sub-3-minute Devpost video Saturday night. It is the insurance policy.

## Pitch notes (deck lives in /docs/pitch.md when written)
- Stats slide, verify Saturday against heart.org and stopthebleed.org before putting numbers on it: ~350k US out-of-hospital cardiac arrests/yr (~one every 90s), survival falls ~10%/min without CPR, bystander CPR can double or triple survival, avg EMS response ~7 min, severe bleeding can kill in ~5.
- Lineage slide: dispatcher-assisted CPR is proven practice; ChatCPR (JAMA Internal Medicine 2026, UCSD + Pitt + Johns Hopkins) showed an AI agent out-coaching dispatchers over AUDIO. Mayday adds eyes. Cite it; some judges may know the authors.
- Architecture slide: one machine per emergency, plug-in data files, engine untouched. Three machines in the repo, two demoed. The demo is CPR and bleeding; the product is any emergency with a published bystander protocol.
- Threat model slide: the 6-row table from docs/01.
- Limits slide, said before asked: coaching aid not a medical device; no depth-in-cm claims from monocular video; real deployment = FDA SaMD pathway + dispatch integration via platforms like RapidSOS.
- Track: Bloomberg (Most Philanthropic). Opt-ins: ElevenLabs x2, Gemini, DigitalOcean, GoDaddy, SpaceXAI, Auctor if their requirement is light. Select EXACTLY ONE track on Devpost.

## Step guides (pictures for each protocol line)

`src/ui/guide` draws what the current state is asking for, the way a workout app shows
the movement next to the cue: a pictogram per docs/02 line, a segmented step bar that
walks the lines in spoken order, and for `cardiac.compressions` a figure that pushes on
the metronome tick over a scrolling rhythm trace. Browse everything at `?guide=1`, or
deep-link one state with `?guide=cardiac.position`.

Rules, same weight as the five principles:
- A guide is keyed by `machine.state` from docs/02 and holds one step per `say` line.
  Captions are those lines verbatim; `guides.test.ts` checks every caption against
  docs/02 and every key against the machine's states. The pictures add no instruction.
- The guide reacts to how the bystander is doing, but never decides what to say. It takes
  `facts` (PerceptionFacts) for the live rate, the rhythm trace and the "on the beat"
  ring, and `coaching` (the engine's active CoachingEvent) for the emphasis: `rate-low`
  and `rate-high` cue the beat ring, `recoil` shows the release line, `stopped` flashes
  the alarm ring, `blind` shows the voice-only badge, `hands-off` pulls in the "do not
  lift" picture. The caption is the event's text while it is active, so the screen shows
  exactly what the voice says.
- Thresholds in `judge.ts` are the docs/02 numbers. When the engine lands, prefer passing
  its event over re-deriving anything here.

COACH screen wiring (P4, M2):
```tsx
const key = `${machineId}.${state.id}`;
const guide = guideFor(key);            // null: show text only
{guide && (
  <StepGuide
    guide={guide}
    step={lineIndex}                    // the line the voice queue is on; omit to auto-advance
    bpm={metronome.currentBpm()}
    beatOriginMs={metronomeTickMs}      // a performance.now() of one tick, so the figure lands on the sound
    facts={latestFacts}
    coaching={activeCorrection}         // the latest critical/correction event for this state, or null
    live={{ series: () => perception.debug.series(4000), peaks: () => perception.debug.peaks() }}
  />
)}
```
The gallery's simulator (`demo.ts`) stands in for perception and the engine until they
exist; nothing outside the gallery imports it.
