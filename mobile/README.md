# Mayday on a phone, through Expo Go

This is a thin shell: the web app in a full-screen WebView, plus what a WebView cannot do
on its own. Speech runs on the phone's own engine (a WebView has no usable Web Speech
API), CALL 911 buzzes through native haptics on iOS (no vibrate API there), the screen
stays awake, and camera, microphone and location are granted to the page because the app
holds them. Nothing medical lives here: the shell speaks the line the web app's voice queue
sends and never composes one.

The web app and the shell share one file, `src/platform/bridge.ts`, which defines every
message that crosses the WebView. The page side is `src/platform/shell.ts`.

## Run it

Once per laptop:

```sh
npm run mobile:install
npx --prefix mobile expo login   # free account; Expo signs the tunnel URL with it
```

Every session, from the repo root:

```sh
npm run mobile:tunnel
```

That builds the web app under `/app/`, serves the build locally with `vite preview`, and
starts `expo start --tunnel`. Metro proxies `/app/` to that server
(`mobile/metro.config.js`), so the `https://….exp.direct` URL Expo Go loads the shell from
also serves the page over a real certificate. Scan the QR with Expo Go (Android: the Expo
Go app; iOS: the camera app). Allow camera, microphone and location once. The page opens.

No Expo account yet? `npm run mobile:tunnel -- --lan` skips the tunnel and the login: the QR
points at the laptop on the wifi. The page is plain http there, so the phone refuses the
camera and the app coaches by voice; everything else works. Log in and drop `--lan` for the
camera.

Iterating on the web app? `npm run mobile:tunnel:dev` serves the Vite dev server instead
of a build. There is no HMR through the tunnel: after a change, press and hold the
status-bar strip on the phone and tap Open to reload.

To point the shell at the deployed site instead:

```sh
EXPO_PUBLIC_MAYDAY_WEB_URL=https://mayday.example.app npm run mobile
```

The address is remembered on the phone. Press and hold the status-bar strip above the page
for two seconds to change it. If another Expo project already holds port 8081, stop it
first: the tunnel serves whatever runs there.

## Why the tunnel

A WebView refuses a self-signed certificate on both platforms: Android cancels the load,
iOS only trusts what the system trusts. Chrome lets you click through; the shell cannot.
The page also needs a secure context for the camera, so a plain `http://<lan-ip>` address
loads but never sees the patient. The tunnel is the one address that is both trusted and
secure with zero setup on the phone. The default is a production build because that is
what the demo should run: no dev overlays, the same bundle the deploy ships.

## What is different inside the shell

- Voice in is off: WebViews have no SpeechRecognition, and native recognition needs a
  development build rather than Expo Go. Every transition has a button (docs/04).
- The page must load once online. After that every reflex is local (perception, engine,
  metronome, speech). A reload with the network off works on Android (the service worker
  registers under `/app/`) and not on iOS (a non app-bound WKWebView has none); the browser
  PWA keeps that demo.

## Checks

```sh
cd mobile
npx tsc --noEmit
npx expo-doctor
npx expo export --platform ios --output-dir /tmp/mayday-export   # proves Metro bundles ../src/platform
```

Proxy check without a phone, from the repo root: `npm run mobile:tunnel -- --port 8090`,
then `curl -s http://127.0.0.1:8090/app/ | grep assets` prints the page's script tag.
