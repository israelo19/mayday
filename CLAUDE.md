# CLAUDE.md - Mayday

## What this is
Mayday is an AI emergency dispatcher with eyes. A bystander opens it on a phone during any medical emergency. It triages by voice, watches through the camera, and coaches the bystander through the correct first-aid protocol in real time until EMS arrives, then produces a structured handoff report. Built in ~24 hours at HopHacks 2026 by a team of 4.

A protocol is a state machine written as data (docs/02), one machine per emergency, transcribed from a published guideline. The engine, perception and voice are generic over machines. Adding an emergency means adding a machine file with cited sources, never code in the engine.

The hackathon build ships two machines, hands-only CPR and severe bleeding, and they are the demo cases. They prove the architecture; they are not its ceiling. Choking ships as data only. Every other emergency is out of scope this weekend (see scope walls).

One-liner for every README and pitch surface: "The minutes before the ambulance, coached."

## The five principles (violating any of these is a bug, even if the feature works)
1. AUTHORITY IS DETERMINISTIC. Medical instructions come only from hand-written state machines transcribed from published guidelines (AHA, Stop the Bleed, Red Cross). No LLM ever selects, orders, invents, or modifies a medical instruction. LLMs may only paraphrase the current state's approved text, and their output is validated before speech; on validation failure, the canonical scripted line plays instead.
2. REFLEXES ARE LOCAL. The perception loop (MediaPipe) and coaching loop run entirely on-device. The app must keep coaching with the network unplugged. We will demo this.
3. COGNITION IS EPISODIC. Cloud AI calls (vision scene description, improvised materials suggestion, narration flavor) happen rarely, never block coaching, and always have a local fallback.
4. FAIL LOUD, NEVER WRONG. If perception confidence drops (bad light, wrong angle, occlusion), the app announces it ("I can't see clearly, I'll keep coaching by voice") and degrades to audio-only protocol coaching. Silent wrong output is the only unacceptable state. Audio-only coaching is the floor, and the floor equals today's 911 dispatcher standard of care.
5. A HUMAN DIALS 911. The app never places calls autonomously. It renders a big CALL 911 button, and once the human calls, it shows a SITREP to read aloud. The demo uses a SIMULATED dispatcher, clearly labeled. Never integrate with real emergency lines.

## Stack
- Vite + React + TypeScript, single-page app. No router needed.
- MediaPipe Tasks Vision (@mediapipe/tasks-vision) for Pose Landmarker and Hand Landmarker, WASM, on-device. Serve model files from /public/models, do not hotlink at runtime.
- Hand-rolled state machine engine in pure TypeScript (no XState dependency; the engine is ~100 lines and we want to own it).
- Voice out: Web Speech API speechSynthesis as the ALWAYS-WORKING default. ElevenLabs streaming TTS as an upgrade behind an interface (see docs/04). Metronome via Web Audio API oscillator.
- Voice in: Web Speech API SpeechRecognition, used as keyword spotting only.
- Geolocation API for SITREP location.
- Backend: none for the core. One serverless proxy for LLM/TTS keys, added later (see stub registry in docs/04).
- Deploy target: DigitalOcean App Platform (sponsor prize), static site + one function. Localhost with HTTPS or ngrok until then.

## Repo rules (disqualification risk, treat as CI)
- Repo is PUBLIC from the first commit.
- First commit after Fri 9:00 PM ET, last commit before Sun 9:00 AM ET. NO commits after the deadline, not even README fixes.
- Commit small and often; commit messages describe what works, e.g. "compression rate live at 10fps".

## What we are NOT building (scope walls)
- Machines this weekend: triage, cardiac, bleeding, and choking as data only with detection disabled. Any other emergency (stroke, seizure, overdose, burns) is a future machine file, not hackathon work.
- No accounts, no database, no ambient always-on listening, no auto-dial, no diagnosis claims, no blood detection via CV, no native app logic.
- The one native piece is `mobile/`, an Expo Go shell that loads the web app in a WebView and lends it the phone's speech, haptics and permissions over `src/platform/bridge.ts`. It holds no screens, no protocol and no instruction text; if it ever needs any, that is the wrong place (DECISIONS.md, Sat 03:40).

## Repo layout
```
/src
  /perception    MediaPipe wrappers + signal extraction (docs/03)
  /protocol      state machine engine; /machines holds one data file per emergency (docs/02)
  /voice         speech out (queue, metronome), speech in (keyword router) (docs/04)
  /ai            episodic cloud calls, all stubbed behind interfaces (docs/04)
  /sitrep        event log, SITREP builder, handoff report
  /ui            screens and overlays (docs/05)
  /ui/guide      step guides: one picture per protocol line, gallery at ?guide=1 (docs/05)
  /platform      Expo Go shell bridge: the wire protocol shared with /mobile and the page-side adapter
/mobile          Expo Go shell around the web app (WebView + native speech, haptics, permissions), own package.json
/docs            these context documents; docs/07 is the four-person work split
/public/models   MediaPipe .task model files (committed)
/public/wasm     MediaPipe WASM runtime (generated, gitignored)
/scripts         prepare-assets.mjs, check-ai-boundaries.mjs, mobile-tunnel.mjs
```

## Reading order for a fresh Claude Code session
1. This file. 2. docs/01-architecture.md. 3. docs/06-plan.md for the current milestone. 4. docs/07-work-split.md for who owns the files you are touching and the seams between owners. 5. The doc for the module you are touching. Decisions the docs did not settle are in DECISIONS.md; add one there instead of asking.
