# 06 - Build plan (24h compressed) and kill criteria

Roles: A=perception, B=protocol data+engine, C=voice I/O, D=UI+SITREP+deck. Adjust names, keep ownership singular.
Four-person mapping (A=P1 Eyes, B=P2 Brain, C=P3 Mouth, D=P4 Face and ship), file ownership, seams and re-based clock: docs/07-work-split.md.

## M0 (by hour 2) - skeleton with eyes
Vite+React+TS scaffolded, deployed on localhost HTTPS. Camera renders. PoseLandmarker running with landmarks drawn. Debug waveform chart of shoulder-y live on screen. WebSpeech says a test line on a button.
DONE = you can watch the waveform wiggle when someone does compressions on a pillow.

## M1 (by hour 6) - THE closed loop
Peak detection, rate, compressionActive, recoilRatio. Engine executes cardiac machine end to end with buttons. Coaching rules fire with cooldowns. Metronome. Voice priority queue.
DONE = an untrained teammate is audibly corrected to 100-120 bpm without anyone touching the laptop.
KILL CHECK at hour 8: if M1 is not done, ALL FOUR people move to it. Bleeding CV is downgraded to timer+verbal coaching. Nothing else exists until M1 is green.

## M2 (by hour 10) - session spine
Triage keywords + buttons route into cardiac. Blind mode works (cover camera test). EventLog populating. SITREP screen with geolocation coords. Handoff screen renders.

## M3 (by hour 14) - bleeding module
scene_safety through pressure states. ROI lock, handsOnRegion, handsOffMs, the don't-let-go correction under 1.5s. Continuous-pressure timer on screen.

## M4 (by hour 18) - enrichment, strictly optional
Order: key proxy -> ElevenLabs coach voice -> dispatcher sim -> Gemini vision describe -> domain. Each behind its flag, each reverts to stub on failure. STOP adding at hour 18 regardless.

## M5 (hours 18-24) - polish, rehearsal, submission
Failure modes tested (light, angle, distance, wifi off). 6 demo rehearsals. Devpost: description written from these docs, sub-3-min video recorded from a full run, track=Bloomberg only, opt-ins checked, all 4 teammates added, repo public. Submit by 8:40 AM Sunday, alarm at 8:30, hands off after.

## Standing rules
- Every hour, someone commits. If a feature can't demo, it doesn't merge.
- Any change to /src/protocol/machines requires the cited source open in a tab.
- No one adds a network call inside the perception->engine->voice path. Ever.
