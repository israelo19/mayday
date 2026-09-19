# Mayday

**The minutes before the ambulance, coached.**

Mayday is an AI emergency dispatcher with eyes. A bystander opens it on a phone during any
medical emergency. It triages by voice, watches through the camera, and coaches the
bystander through the correct first-aid protocol in real time until EMS arrives, then
produces a structured handoff report. Built at HopHacks 2026.

Each protocol is a state machine written as data, one per emergency, transcribed from a
published guideline (AHA, Stop the Bleed, Red Cross). Adding an emergency means adding a
machine file, not changing the engine. The hackathon build ships two, hands-only CPR and
severe bleeding, and they are the demo cases; choking ships as data only.

No language model ever selects, orders, or modifies an instruction. Perception and coaching
run entirely on-device and keep working with the network unplugged. The app never dials 911
by itself; a human does. See `CLAUDE.md` for the five principles and `docs/` for everything
else.

## Run it (dev, HTTPS)

Needs Node 20.19+ or 22.12+ -- `vite@8`/rolldown silently skip installing their native binary
on older Node instead of erroring, which looks like a broken install (see `DECISIONS.md`,
Sat 02:50). Camera access needs a secure context, so dev runs over HTTPS. Chrome is the demo
browser.

```sh
npm install        # also copies the MediaPipe WASM runtime into public/wasm
npm run dev        # https://localhost:5173 and https://<your-LAN-ip>:5173
```

A plain load is the real app: LAUNCH -> CALL PREP -> COACH -> SITREP -> HANDOFF (docs/05),
running on mock data until `web/session.ts` and P2's engine wire it up for real (see
`DECISIONS.md`). `?debug=1` gets the M0 sensor/debug view instead -- that's what the M0 and M1
checks below are walking.

- Dev serves a self-signed certificate (`@vitejs/plugin-basic-ssl`). No setup, no sudo.
  The browser shows a warning once per device: Advanced, proceed. Camera works after that.
- Phone on the same wifi: open `https://<your-LAN-ip>:5173` (Vite prints it) and accept the
  warning the same way. Chrome on Android is the demo browser.
- Want a trusted certificate on the laptop (no warning)? `MAYDAY_MKCERT=1 npm run dev` runs
  mkcert and asks for your macOS password once. Not needed for the demo.
- Laptop only, no certificate at all: `MAYDAY_HTTP=1 npm run dev` and open `http://localhost:5173`
  (localhost is a secure context, so the camera works). Phones cannot use this one.
- Can't do either: `npx ngrok http https://localhost:5173` and open the ngrok URL on the phone.
- Every environment variable the repo reads is listed in `.env.example` with its usage. The
  browser bundle reads none; keys stay in `.env.local` for the dev proxy (docs/09).
- The MediaPipe model files are committed in `public/models`. `scripts/prepare-assets.mjs`
  only downloads them if they are missing. Nothing is fetched from a CDN at runtime.

Other scripts: `npm run typecheck`, `npm test` (vitest), `npm run build` (output in `dist/`),
`npm run preview`. Open `http://localhost:5173/?guide=1` (any of the dev modes) for the step
guide gallery: every protocol picture, a simulated bystander to watch the guide react, and a
coach-screen preview. No camera needed.

## Run it on a phone

The phone runs the web app itself, as a PWA. No store, no account, no shell: Chrome on
Android has the camera, Web Speech, vibrate and wake lock the app needs, and Safari on iOS
has all but vibrate.

1. `npm run dev` (or `npm run preview` for the production build). Under Vite's URL list it
   prints a QR of the LAN address. Scan it with the phone's camera app.
2. Accept the self-signed certificate warning once (Advanced, proceed). Camera works after
   that because a secure context is about the https scheme, not certificate trust.
3. Chrome menu, "Add to Home Screen": the app opens full screen from its own icon from then
   on, and a reload with wifi off still loads once a session has run online
   (`vite-plugin-pwa`, see Deploy). The deployed DigitalOcean URL skips step 2 entirely.

Expo Go was tried and dropped: on the current SDK it refuses any project whose dev server
is not signed in to an Expo account, on the laptop and on the phone (DECISIONS.md, Sat 05:00).

## M0 demo check

1. Open `?debug=1`. The footer reads `status: running`, fps is above 10, the pose skeleton is
   drawn on the camera preview with both shoulders circled in red.
2. Point the camera at a teammate doing chest compressions on a pillow, chest facing the
   camera, phone propped about 1.5 m away. The waveform oscillates with visible peaks, about
   two per second at 110 bpm. The confidence number stays above 0.5.
3. Tap **Metronome 110 bpm**: it ticks with an accent every fourth beat and does not stutter
   while the skeleton is being drawn. Tap **Test voice**: a line is spoken through Web Speech.
4. Turn wifi off and repeat step 3. Everything keeps working.

DONE means: the waveform wiggles, confidence is on screen, the metronome ticks. Confirmed on
an iPhone rear camera at 28 to 31 fps on Sat 01:50, and working on Android as well.

## M1 check (perception side, `?debug=1`)

1. Start the beat and do compressions on a pillow with your shoulders in frame. Within five
   pushes the big number appears and dots mark each counted push on the trace.
2. Match the beat: the number sits between 100 and 120 and reads mint. Go slow on purpose:
   it turns amber and drops within a few pushes. Stop: "pushing" becomes "still" within 2 s.
3. Cover the lens: the red "Can't see your shoulders" banner appears within about a second,
   the number disappears, and the trace says no signal. Uncover: it recovers within a second.
4. Walk away or step too close: an amber banner asks you to move the phone.
5. Open "Hands and the wound region", tap "Track hands", press both hands on a cushion, tap
   "Lock on the hands", hold still 1.5 s. A circle locks on. Lift your hands: the circle turns
   red and the counter climbs. Put them back: mint again.
6. "Tune the detector" changes smoothing, minimum push size and minimum gap live; values
   persist on the phone. "Replay a clip" runs a recorded video through the same pipeline.

Tests for the pure signal code: `npm test`.

## M2 check (the session spine)

Open the app, or `?fake=1` on a laptop with no camera. Tap "I NEED HELP".

1. The chip at the top reads "Listening". Say "he's not breathing", or tap the button. The
   card switches to CPR and the first line is spoken and shown. "Gunshot" and "Choking" route
   the same way.
2. Every spoken answer has a button under the card. NEXT always moves. "Ambulance is here"
   ends the machine and opens the handoff.
3. In compressions the metronome runs and the pill shows the live rate. Stop pushing for three
   seconds: "Don't stop." Cover the lens: the blind line, the beat continues.
4. In bleeding pressure, lift both hands: "Don't let go!" within about two seconds.
5. CALL 911 opens the simulated dispatcher under a red label; the SITREP lines answer it.
6. The handoff shows the read-aloud block, the paramedic headline, the timeline and a QR.

`window.mayday.log.entries()` in the console lists what was heard and said.

## Layout

```
/src
  /perception    MediaPipe wrappers + signal extraction (docs/03)
  /protocol      state machine engine; /machines holds one data file per emergency (docs/02)
  /voice         speech out (queue, metronome), speech in (keyword router) (docs/04)
  /ai            episodic cloud calls, all stubbed behind interfaces (docs/04)
  /sitrep        event log, SITREP builder, handoff report
/web             the browser app: main.tsx, App.tsx, index.css, and session.ts once the engine lands
  /ui            screens and overlays (docs/05)
  /ui/guide      step guides: one picture per protocol line, gallery at ?guide=1 (docs/05)
/docs            context documents; docs/07 is the four-person work split
/public/models   MediaPipe .task model files (committed)
/public/wasm     MediaPipe WASM runtime (generated, gitignored)
/scripts         prepare-assets.mjs, check-ai-boundaries.mjs
```

Decisions the docs did not settle are logged in `DECISIONS.md`.

## Deploy

Target is DigitalOcean App Platform, spec in `.do/app.yaml` (static site, `npm run build` ->
`dist/`, SPA catch-all to `index.html`). Import it with `doctl apps create --spec .do/app.yaml`
or point App Platform's "create from GitHub repo" flow at the same file. The app is a PWA
(`vite-plugin-pwa`): the shell precaches, MediaPipe's models and WASM runtime cache on first
successful fetch, so a reload with wifi off works once the session has loaded at least once.
The `/api/proxy` function (key proxy for ElevenLabs/Gemini, docs/04 TODO #1) is added as an M4
integration once those keys are ready.

## Team

- [Emmanuel Adedeji](https://www.linkedin.com/in/e-adedeji/)
- [Bryce Biyeba](https://www.linkedin.com/in/bryce-biyeba/)
- [Ricky Chen](https://www.linkedin.com/in/ricky-ch3n/)
- [Israel Ogwu](https://www.linkedin.com/in/israelogwu/)
