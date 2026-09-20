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

A plain load is the real app: LAUNCH, then the camera fills the screen and `web/session.ts`
drives coaching from the protocol engine (docs/10). `?debug=1` gets the M0 sensor/debug view
instead -- that's what the M0 and M1 checks below are walking.

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
`npm run preview`. Open `https://localhost:5173/?guide=1` for the step guide gallery: every
protocol picture, a simulated bystander to watch the guide react, and a coach-screen preview.
No camera needed. Under `MAYDAY_HTTP=1` it is `http://`, and under `npm run preview` port 4173.

## Run it on a phone

The phone runs the web app itself, as a PWA. No store, no account, no shell: Chrome on
Android has the camera, Web Speech, vibrate and wake lock the app needs, and Safari on iOS
has all but vibrate. Two iPhone caveats for voice input, both said on the mic chip when they
bite: WebKit gives a home-screen app no speech recognizer at all, so demo voice in Safari
itself and use the icon only when the buttons will do; and the recognizer is the OS speech
service, so Siri & Dictation must be on (Settings, General, Keyboard, Enable Dictation) and the
phone needs internet for it. Coaching, the beat and speech output need neither.

1. `npm run dev` (or `npm run preview` for the production build). Under Vite's URL list it
   prints a QR of the LAN address. Scan it with the phone's camera app.
2. Accept the self-signed certificate warning once (Advanced, proceed). Camera works after
   that because a secure context is about the https scheme, not certificate trust.
3. Chrome menu, "Add to Home Screen": the app opens full screen from its own icon from then
   on. The deployed DigitalOcean URL skips step 2 entirely.

Step 3 and the wifi-off reload need a *built* app: `vite-plugin-pwa` writes the manifest and
the service worker at build time only, so `npm run dev` registers neither. Use `npm run preview`
(port 4173) or the deployed URL for anything that shows the install or offline behaviour. The
shell precaches; the MediaPipe models and WASM runtime cache on first successful fetch, so a
wifi-off reload works once a session has loaded online at least once.

Expo Go was tried and dropped: on the current SDK it refuses any project whose dev server
is not signed in to an Expo account, on the laptop and on the phone (DECISIONS.md, Sat 05:00).

### ElevenLabs on the phone

Rehearse with the flags off; flip them for the judged run (docs/09). Both features keep their
local stub underneath and fall back to it on any miss, so the wifi-off demo is unaffected.

1. Put `ELEVENLABS_API_KEY=sk_...` in `.env.local`. `npm run dev` then mounts the key proxy at
   `/api/proxy` on its own origin, and prints `ElevenLabs: key proxy at /api/proxy` under the
   URL list. The phone reaches it over the same https URL as the page; no second port.
2. Once per account, `node scripts/create-dispatcher-agent.mjs` creates the SIMULATED
   dispatcher agent and prints the `ELEVENLABS_AGENT_ID=` line to add to `.env.local`.
   Restart `npm run dev`.
3. Scan the QR, then add the flags to the URL: `?flag=elevenLabs` for the coach voice (Brian)
   and the scripted dispatcher in a second voice (Sarah), `?flag=dispatcherSim` for the live
   agent that hears the phone mic, or `?flag=elevenLabs,dispatcherSim` for both.
4. Tap I NEED HELP, then CALL 911. Allow the microphone. The panel header reads "Listening to
   you" while the agent is live, and the panel shows what it heard you say. A fallback reads
   "On the line", the same words the scripted call-taker uses, because which engine answers is
   not the caller's business (CLAUDE.md principle 5). To tell them apart, read
   `window.mayday.log.entries()`: the reasons are no agent id, mic refused, or no session
   within 4 s.
5. To hear the difference without the flow: `?debug=1&flag=elevenLabs`, the voice chip reads
   "ElevenLabs Brian", and "Speak a test line" goes through the proxy.

### The scene model on the phone

One camera frame goes to a vision model at the start of triage, and its answer becomes a
question the person confirms (docs/04 item 7, docs/11). Behind a flag; the cards and buttons
stay for anyone who prefers to tap.

1. Put `GEMINI_API_KEY=...` in `.env.local` (a free key from [AI Studio](https://aistudio.google.com/apikey)).
   `npm run dev` then mounts `/api/proxy/vision/assess` and prints
   `Scene model: gemini-3.6-flash (gemini) via /api/proxy/vision/assess`. `GEMINI_VISION_MODEL`
   picks another model; `gemini-3.5-flash-lite` is quicker and weaker. `FEATHERLESS_API_KEY`
   is the fallback provider, used when there is no Gemini key or when `MODEL_PROVIDER=featherless`.
2. Open the phone URL with `?flag=sceneAssess`. After "I NEED HELP" the look card reads "One
   picture is with the model", then the eyes chip reads "Saw: …", a box lands on the person,
   and the app asks "It looks like someone is bleeding badly. Say yes, or tap."
3. No key, or no answer within four seconds: nothing happens, and the camera's own cues carry on.

`node scripts/assess-frame.mjs photo.jpg [model]` runs the app's exact question on a photo, which is
how two models get compared before the judged run.
`?fake=1&flag=sceneAssess` demos the flow with a canned model: pick what it says in the fake controls,
then "Start over", since the frame goes out about a second into triage.

### The intent router

A bystander in a panic does not say "not breathing", they say "the poor man went down in the hallway
and he is grey". The local matcher misses that and so do the phrase cues, and then the same model
gets the sentence and the buttons that are on the screen right now (docs/04 item 8).

1. Same `GEMINI_API_KEY`, same proxy, no picture: the route is `/api/proxy/intent/route`.
2. Open the phone URL with `?flag=intentRoute`. Say something none of the buttons say. The amber
   "Sounds like Not breathing?" bar appears, and yes or a tap enters the state.
3. The model answers with the NUMBER of a button, never with words, so it cannot name a step the
   state is not already offering. Anything else, or low confidence, or no answer in three seconds:
   the machine does not move and the buttons carry the demo. The app does say one line when it
   heard a sentence it could not place ("I heard you. If something has changed, say it simply,
   or tap a button"), at most once every twenty seconds.

`?fake=1&flag=intentRoute` uses a word overlap stub, so the yes/no flow demos with no key.

### Answers, rewording, and Grok

Two more behind flags, both bound by CLAUDE.md principle 1: the model interprets and rewords,
the machine decides (docs/04 items 5 and 8, DECISIONS.md Sat 20:40 and 21:55).

1. Answers. The cardiac and bleeding machines carry 25 cited answers to what people ask mid
   protocol ("am I pushing hard enough?", "can I use a belt?"). Say the phrase and it speaks.
   With `?flag=intentRoute` the router is offered them as questions next to the buttons, so
   "did I just crack something in his chest?" gets the rib answer at once, no yes/no, and
   "the paramedics just pulled up" earns the handoff question.
2. `?flag=narrationFlavor`: each line reworded for the moment through `/api/proxy/text/complete`.
   The next step's lines are reworded before you get there; a nag ("Faster. Push with the beat.")
   is canonical the first time and, on its repeat, opens with what you said and what the camera
   measures. Every rewording passes `src/protocol/validate.ts` or the line speaks as written;
   `mayday.log.entries()` shows `said as:` and `rewording refused` lines.
3. Grok: put `XAI_API_KEY=...` in `.env.local` or `.env` (the HopHacks credits), and
   `MODEL_PROVIDER=xai` to give it the text routes. The dev server prints a line per route:
   `Text model: grok-4.20-0309-non-reasoning (xai)` and `Frame model: gemini-3.6-flash
   (gemini)`. The frame never goes to xAI, which has not been tried on one, so keep a Gemini
   key beside it. No key, or wifi off: both flags do nothing and the matcher, the buttons and
   the canonical lines carry the demo.

   Use the model id the account actually lists. `grok-4-1-fast-non-reasoning` is not one of
   them, and xAI serves `grok-4.3` in its place without saying so: on the intent prompt that
   is 3/5 right with a median of 4.8 s, every call past the router's 3 s budget, against 4/5
   at 580 ms for the id above.

**Before recording, decide about `narrationFlavor`.** The other flags keep the model away from
the words: the router picks the NUMBER of a button and a human still says yes, and an answer is
a cited line the machine already owns. Rewording is the one place a model writes what is spoken,
and `validate.ts` is a lexical gate: it checks numbers, negation, units, comparators, places,
urgency, length and a list of terms we never coach. It cannot read meaning, and a paraphrase
that keeps all of those and still changes the instruction will pass. `tests/narration-attacks.test.ts`
holds fourteen of them. The flag is off by default; leaving it off is the safe recording.

## M0 demo check

1. Open `?debug=1`. The chip at the top reads `Live`, fps is above 10, and the pose skeleton is
   drawn on the camera preview with both shoulders ringed in mint.
2. Point the camera at a teammate doing chest compressions on a pillow, chest facing the
   camera, phone propped about 1.5 m away. The waveform oscillates with visible peaks, about
   two per second at 110 bpm. The confidence number stays above 0.5.
3. Tap **Start the beat, 110**: it ticks with an accent every fourth beat and does not stutter
   while the skeleton is being drawn. Tap **Speak a test line**: a line goes out through Web Speech.
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

1. The chip at the top reads "Listening" (or "Speaking, then listening" while the app talks:
   wait for it). Say "he's not breathing", "he got shot", "gunshot", "she's choking", or tap.
   The card switches to that protocol and the first line is spoken and shown with its picture.
   Say something the app has no phrase for, such as "he ate something and now he's silent and
   holding his neck", and it asks "Sounds like choking?" with Yes and No.
1. Once a state has been read the card shrinks to its caption so the camera shows the rescuer;
   tap the card to reopen or hide the picture.
2. Every spoken answer has a button under the card. NEXT always moves. "Ambulance is here"
   ends the machine and opens the handoff.
3. In compressions the metronome runs and the pill shows the live rate. Stop pushing for three
   seconds: "Don't stop." Cover the lens: the blind line, the beat continues.
4. In bleeding pressure, lift both hands: "Don't let go!" within about two seconds.
5. CALL 911 opens the simulated dispatcher; the SITREP lines answer it. The panel reads as a real call because LAUNCH already said it is not one.
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
/web             the browser app: main.tsx, App.tsx, index.css, session.ts (orchestrator, docs/10)
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

## License

Apache License 2.0, full text in `LICENSE`. Attribution and the redistribution notice are in
`NOTICE`; keep that file with any copy or derivative you ship.

Mayday is a demonstration, not a certified medical device and not a substitute for emergency
medical services. The simulated dispatcher is never connected to a real emergency line. The
software is provided "as is", without warranty of any kind (LICENSE, Sections 7 and 8).
