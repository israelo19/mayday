# CLAUDE.md - Mayday

## What this is
Mayday is an AI emergency dispatcher with eyes. A bystander opens it on a phone during a medical emergency. It triages by voice, watches through the camera, and coaches the bystander through the correct protocol in real time until EMS arrives, then produces a structured handoff report. Built in ~24 hours at HopHacks 2026 by a team of 4.

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
- No accounts, no database, no ambient always-on listening, no auto-dial, no diagnosis claims, no blood detection via CV, no native app, no choking CV detection (choking machine exists as data only, stretch goal), no stroke module.

## Repo layout
```
/src
  /perception    MediaPipe wrappers + signal extraction (docs/03)
  /protocol      state machine engine + machine definitions as data (docs/02)
  /voice         speech out (queue, metronome), speech in (keyword router) (docs/04)
  /ai            episodic cloud calls, all stubbed behind interfaces (docs/04)
  /sitrep        event log, SITREP builder, handoff report
  /ui            screens and overlays (docs/05)
/docs            these context documents
/public/models   MediaPipe .task model files
```

## Reading order for a fresh Claude Code session
1. This file. 2. docs/01-architecture.md. 3. docs/06-plan.md for the current milestone. 4. The doc for the module you are touching.
