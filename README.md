# Mayday

**The minutes before the ambulance, coached.**

Mayday is an AI emergency dispatcher with eyes. A bystander opens it on a phone during a
medical emergency. It triages by voice, watches through the camera, and coaches the
bystander through the correct protocol in real time until EMS arrives, then produces a
structured handoff report. Built at HopHacks 2026.

Medical instructions come only from hand-written state machines transcribed from published
guidelines (AHA, Stop the Bleed, Red Cross). No language model ever selects, orders, or
modifies an instruction. Perception and coaching run entirely on-device and keep working
with the network unplugged. The app never dials 911 by itself; a human does. See
`CLAUDE.md` for the five principles and `docs/` for everything else.

## Run it (dev, HTTPS)

Camera access needs a secure context, so dev runs over HTTPS. Chrome is the demo browser.

```sh
npm install        # also copies the MediaPipe WASM runtime into public/wasm
npm run dev        # https://localhost:5173 and https://<your-LAN-ip>:5173
```

- First run: `vite-plugin-mkcert` downloads `mkcert` and asks for your macOS password once
  to trust the local certificate authority. Laptop browsers then show no warning.
- Phone on the same wifi: open `https://<your-LAN-ip>:5173` (printed by Vite). Accept the
  certificate warning (Advanced, proceed), or install the CA from `mkcert -CAROOT` on the phone.
- If mkcert is not an option on your machine: `npx ngrok http https://localhost:5173` and open
  the ngrok URL on the phone.
- The MediaPipe model files are committed in `public/models`. `scripts/prepare-assets.mjs`
  only downloads them if they are missing. Nothing is fetched from a CDN at runtime.

Other scripts: `npm run typecheck`, `npm run build` (output in `dist/`), `npm run preview`.

## M0 demo check

1. Open the app. The footer reads `status: running`, fps is above 10, the pose skeleton is
   drawn on the camera preview with both shoulders circled in red.
2. Point the camera at a teammate doing chest compressions on a pillow, chest facing the
   camera, phone propped about 1.5 m away. The waveform oscillates with visible peaks, about
   two per second at 110 bpm. The confidence number stays above 0.5.
3. Tap **Metronome 110 bpm**: it ticks with an accent every fourth beat and does not stutter
   while the skeleton is being drawn. Tap **Test voice**: a line is spoken through Web Speech.
4. Turn wifi off and repeat step 3. Everything keeps working.

DONE means: the waveform wiggles, confidence is on screen, the metronome ticks. M1 (peak
detection, rate, coaching rules, protocol engine) starts only after a human confirms this on
a real camera.

## Layout

```
/src
  /perception    MediaPipe wrappers + signal extraction (docs/03)
  /protocol      state machine engine + machine definitions as data (docs/02)
  /voice         speech out (queue, metronome), speech in (keyword router) (docs/04)
  /ai            episodic cloud calls, all stubbed behind interfaces (docs/04)
  /sitrep        event log, SITREP builder, handoff report
  /ui            screens and overlays (docs/05)
/docs            context documents; docs/07 is the three-person work split
/public/models   MediaPipe .task model files (committed)
/public/wasm     MediaPipe WASM runtime (generated, gitignored)
/scripts         prepare-assets.mjs
```

Decisions the docs did not settle are logged in `DECISIONS.md`.
