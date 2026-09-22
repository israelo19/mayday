# CLAUDE.md - Mayday

## What this is
Mayday is an AI emergency dispatcher with eyes. A bystander opens it on a phone during any medical emergency. It triages by voice, watches through the camera, and coaches the bystander through the correct first-aid protocol in real time until EMS arrives, then produces a structured handoff report. Built over the HopHacks 2026 weekend (September 18 to 20) by a team of 4, for the Most Philanthropic Hack track. Sponsor challenges entered: Gemini API, ElevenLabs, and SpaceXAI (the Grok API as a text-model provider for the intent router and the rewording, docs/04 items 5 and 8); docs/04 maps each dependency to its challenge.

A protocol is a state machine written as data (docs/02), one machine per emergency, transcribed from a published guideline. The engine, perception and voice are generic over machines. Adding an emergency means adding a machine file with cited sources, never code in the engine.

The hackathon build ships two machines, hands-only CPR and severe bleeding, and they are the demo cases. They prove the architecture; they are not its ceiling. Choking ships as data only. Every other emergency is out of scope this weekend (see scope walls).

One-liner for every README and pitch surface: "The minutes before the ambulance, coached."

README.md is written for judges who may not be technical, and it mirrors this file. When a principle, a scope wall, the stack or the layout changes, change both. The diagrams it embeds are hand-drawn SVGs in docs/images; edit the SVG, not a screenshot.

## The five principles (violating any of these is a bug, even if the feature works)
1. AUTHORITY IS DETERMINISTIC. Medical instructions come only from hand-written state machines transcribed from published guidelines (AHA, Stop the Bleed, Red Cross). No LLM ever selects, orders, invents, or modifies a medical instruction. LLMs may only paraphrase the current state's approved text, and their output is validated before speech; on validation failure, the canonical scripted line plays instead.
2. REFLEXES ARE LOCAL. The perception loop (MediaPipe) and coaching loop run entirely on-device. The app must keep coaching with the network unplugged. We will demo this.
3. COGNITION IS EPISODIC. Cloud AI calls (one frame to a scene model, one missed sentence to an intent router, a warmer voice) happen rarely, never block coaching, and always have a local fallback.
4. FAIL LOUD, NEVER WRONG. If perception confidence drops (bad light, wrong angle, occlusion), the app announces it ("I can't see clearly, I'll keep coaching by voice") and degrades to audio-only protocol coaching. Silent wrong output is the only unacceptable state. Audio-only coaching is the floor, and the floor equals today's 911 dispatcher standard of care.
5. A HUMAN DIALS 911. The app never places calls autonomously. It renders a big CALL 911 button, and once the human calls, it shows a SITREP to read aloud. The demo uses a simulated dispatcher, disclosed once on the LAUNCH screen before the session starts and never stamped on the call panel itself, so the call reads the way the real one will. Never integrate with real emergency lines.

## Stack
- Vite + React + TypeScript, single-page app. No router needed.
- MediaPipe Tasks Vision (@mediapipe/tasks-vision) for Pose Landmarker and Hand Landmarker, WASM, on-device. Serve model files from /public/models, do not hotlink at runtime.
- Hand-rolled state machine engine in pure TypeScript (no XState dependency; the engine is under 300 lines and we want to own it).
- Voice out: Web Speech API speechSynthesis as the ALWAYS-WORKING default. ElevenLabs streaming TTS as an upgrade behind an interface (see docs/04). Metronome via Web Audio API oscillator.
- Voice in: Web Speech API SpeechRecognition, used as keyword spotting only.
- Geolocation API for SITREP location.
- Backend: none for the core. A key proxy (`src/voice/providers/devproxy.mjs`) is mounted at /api/proxy by the dev and preview servers and holds every key: ElevenLabs, Gemini, Featherless, xAI. Its serverless version is docs/04 TODO 1.
- Deploy target: a static site today, spec in `.do/app.yaml` and docs/12. The proxy as a serverless function is docs/04 TODO 1; until it exists the dev and preview servers mount the proxy, so the cloud helpers work on localhost with HTTPS or over ngrok and nowhere else.

## Repo rules (disqualification risk, treat as CI)
- Repo is PUBLIC from the first commit.
- First commit after Fri 9:00 PM ET, last commit before Sun 9:00 AM ET. NO commits after the deadline, not even README fixes.
- Commit small and often; commit messages describe what works, e.g. "compression rate live at 10fps".

## What we are NOT building (scope walls)
- Machines this weekend: triage, cardiac, bleeding, and choking as data only with detection disabled. Any other emergency (stroke, seizure, overdose, burns) is a future machine file, not hackathon work.
- No accounts, no database, no ambient always-on listening, no auto-dial, no diagnosis claims, no on-device blood-pixel detection (the one cloud photo answers a closed question and never coaches), no native app (the phone runs the PWA; an Expo Go shell was tried and dropped, DECISIONS.md Sat 05:00).

## Repo layout
```
mayday/
├── src/                     the engine, no browser code in here
│   ├── types.ts             the shared types: facts, coaching events, machines, reports
│   ├── flags.ts             the ?flag= switches, all off by default
│   ├── perception/          camera, pose and hand tracking, the signals (docs/03): camera, pose, hands, signal, roi, scene, luma, overlay, and fake for ?fake=1
│   ├── protocol/            the state machine engine, the linter, the paraphrase validator (docs/02): engine, rules, lint, validate, keywords, language, phrases, mermaid
│   │   └── machines/        one data file per emergency: triage, cardiac, bleeding, choking
│   ├── voice/               speaking (queue, metronome) and listening (keyword spotting) (docs/04, docs/09)
│   │   └── providers/       the one place a network call is allowed: ElevenLabs voice and agent, the key proxy
│   ├── ai/                  the cloud helpers behind interfaces: scene photo, sentence matching, rewording (docs/04, docs/11)
│   └── sitrep/              the event log, the SITREP, the paramedic handoff
├── web/                     the browser app
│   ├── main.tsx, App.tsx    the entry point and the root: which screen the URL asks for
│   ├── session.ts           the orchestrator: where camera, engine, voice and log meet (docs/10)
│   ├── providers.ts         local by default, cloud behind a switch, chosen once per session
│   ├── geocode.ts           turns the GPS fix into a street address for the SITREP
│   ├── trace.ts             ?trace=1, dev only: the phone posts what the session sees to the laptop
│   └── ui/
│       ├── LaunchScreen.tsx, CameraView.tsx, DebugScreen.tsx, Waveform.tsx
│       ├── live/            the live screen: LiveApp, DispatcherPanel, HandoffPanel, useSession, hints, FakeControls for ?fake=1
│       └── guide/           one picture per line, gallery at ?guide=1 (docs/05)
├── docs/                    these context documents, 01 to 12; docs/07 is the four-person work split; docs/12 is the run guide and demo checks
│   ├── images/              the README diagrams, hand-drawn SVG
│   ├── protocol-diagrams.md generated from the machines by npm run diagrams, never edited by hand
│   └── latency.md, perception-tests.md, pitch-authority.md, START_PROMPT.md   hackathon-time records, kept as written
├── public/
│   ├── models/              MediaPipe model files, committed, nothing fetched at runtime
│   ├── wasm/                MediaPipe runtime, generated on install, gitignored
│   └── icon.svg, icon-512.png, apple-touch-icon.png   the PWA icons
├── scripts/                 prepare-assets, check-ai-boundaries, assess-frame, create-dispatcher-agent
├── tests/                   engine, machines, keywords, language, phrases, validator, narration attacks, assessment hints, SITREP, boundaries, diagrams, the key proxy; harness is the shared rig. Unit tests also sit beside their modules as *.test.ts
├── .do/app.yaml             the App Platform spec: a static site
├── vite.config.ts           the dev server: HTTPS, the QR, the key proxy mount, the ?trace=1 sink
└── .env.example             every environment variable the repo reads, with its usage
```

## Reading order for a fresh Claude Code session
1. This file. 2. docs/01-architecture.md. 3. docs/06-plan.md for the current milestone. 4. docs/07-work-split.md for who owns the files you are touching and the seams between owners. 5. The doc for the module you are touching. To run the app or walk a demo check, docs/12-run-and-check.md. Decisions the docs did not settle are in DECISIONS.md; add one there instead of asking.
