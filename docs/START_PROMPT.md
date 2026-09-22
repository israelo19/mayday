# Starting prompt for Claude Code (paste everything below the line)

Historical: this is the Friday-night kickoff prompt, kept for the record. Current behaviour
is described by CLAUDE.md and docs/01-architecture.md, and a fresh session follows the reading
order in CLAUDE.md, not this file; several constraints below (stubs only, ~120 engine lines)
were overtaken during the weekend.

---

You are building Mayday, an emergency-response coaching web app, at a hackathon with a hard deadline. The repo root contains CLAUDE.md and a docs/ folder. Read them in this order before writing any code: CLAUDE.md, docs/01-architecture.md, docs/06-plan.md, then docs/03-perception.md. The other docs are reference for their modules; consult docs/02-protocols.md when touching /src/protocol, docs/04 for voice and AI, docs/05 for UI.

Non-negotiable constraints, repeated here because they override any shortcut you are tempted to take:
1. No LLM call may ever select, order, or modify a medical instruction. Instructions come only from the state machine data in /src/protocol/machines. The narration flavor interface exists but ships stubbed and OFF.
2. The perception -> protocol engine -> voice path must contain zero network calls. The app must work fully offline with Web Speech synthesis. We will demo with wifi off.
3. All cloud AI functions (see docs/04) are implemented as interfaces with hardcoded stubs behind feature flags defaulting to OFF. Do not implement real API clients now. Maintain the TODO registry in docs/04 as you go: if you create a new stub, add a row.
4. Every voice-driven transition gets a visible button twin. The demo must be recoverable by tap alone.
5. TypeScript strict mode. Keep the state machine engine under ~120 lines and dependency-free. Do not add libraries beyond: react, @mediapipe/tasks-vision, vite, and dev tooling. No XState, no state management library, no UI kit; plain CSS is fine and fast.

Your task right now is Milestone M0 from docs/06-plan.md, then stop for review:
- Scaffold Vite + React + TypeScript with the folder layout from CLAUDE.md.
- Define the core types from docs/01 in src/types.ts.
- Camera view with MediaPipe PoseLandmarker running in VIDEO mode, landmarks drawn on an overlay canvas. Download the pose landmarker (lite) .task model into public/models at build time via a script or committed file; load same-origin only.
- Extract the shoulder-midpoint y signal per docs/03 (EMA smoothing) and render a live scrolling waveform debug chart (plain canvas, no chart library) with a big live number placeholder for rate (rate itself is M1).
- A "test voice" button that speaks one line through a WebSpeechProvider implementing the SpeakerProvider interface from docs/04, and a metronome start/stop button at 110 bpm via Web Audio.
- README.md with: the one-liner, how to run dev with HTTPS (camera requires it; use vite-plugin-mkcert or document ngrok), and the M0 demo check.

Definition of done for M0: I point the camera at a teammate doing compressions on a pillow and watch the waveform oscillate with visible peaks, confidence value on screen, while the metronome ticks. Nothing else. Do not start M1 features (peak detection, rate, coaching rules, protocol engine) until M0 is confirmed working on a real camera by a human.

Work in small commits with messages describing what demonstrably works. If a design question is not answered by the docs, choose the simplest option that keeps the five principles in CLAUDE.md intact, and note the decision in a DECISIONS.md file rather than asking.
