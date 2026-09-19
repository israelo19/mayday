import { defineConfig, type PluginOption, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import mkcert from 'vite-plugin-mkcert';
import { VitePWA } from 'vite-plugin-pwa';
import * as QRCode from 'qrcode';
import { createKeyProxy, readLocalEnv } from './src/voice/providers/devproxy.mjs';

// HTTPS in dev because getUserMedia needs a secure context on any origin other than
// localhost (the phone on the LAN hits https://<laptop-ip>:5173).
// Default: a self-signed certificate. No setup, no sudo; accept the browser warning once
// per device. Opt in to a trusted local CA with `MAYDAY_MKCERT=1 npm run dev`, which runs
// mkcert and asks for your macOS password once. Laptop-only work can skip TLS entirely with
// `MAYDAY_HTTP=1 npm run dev` because http://localhost is already a secure context.
// Alternative for phones: ngrok, see README.
const https: PluginOption[] =
  process.env.MAYDAY_HTTP === '1' ? [] : process.env.MAYDAY_MKCERT === '1' ? [mkcert()] : [basicSsl()];

/**
 * Prints a QR code of the LAN URL under Vite's own URL list, for dev and preview. The demo
 * runs on a phone (docs/05); one scan with the camera app beats typing an address, and the
 * phone then installs the PWA from Chrome's "Add to Home Screen". `qrcode` is the package
 * P2 already sanctioned for the handoff QR (DECISIONS.md).
 */
function phoneQr(): PluginOption {
  const show = (urls: { network: string[] } | null): void => {
    const url = urls?.network[0];
    if (!url) return;
    QRCode.toString(url, { type: 'terminal', small: true })
      .then((qr) => console.log(`\n  Phone: scan to open ${url}\n\n${qr}`))
      .catch(() => {});
  };
  return {
    name: 'mayday-phone-qr',
    configureServer(server) {
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        show(server.resolvedUrls);
      };
    },
    configurePreviewServer(server) {
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        show(server.resolvedUrls);
      };
    },
  };
}

/**
 * Mounts the ElevenLabs key proxy at /api/proxy on the dev and preview servers, the same
 * path the deployed DigitalOcean Function will own (docs/04 TODO 1), so `ElevenLabsProvider`
 * and the agent dispatcher need no dev-only base URL. Same origin as the page: an https
 * page on the phone may call it, which a separate http port could never offer. With no key
 * in .env.local the mount is skipped and every flagged voice feature falls back locally.
 */
function keyProxy(): PluginOption {
  const apiKey = readLocalEnv('ELEVENLABS_API_KEY');
  const agentId = readLocalEnv('ELEVENLABS_AGENT_ID');
  // Dev and preview servers share the connect stack, so one mount serves both hooks.
  const mount = (server: Pick<ViteDevServer, 'middlewares'>): void => {
    if (!apiKey) {
      console.log('  ElevenLabs: off (no ELEVENLABS_API_KEY in .env.local); WebSpeech carries the demo');
      return;
    }
    server.middlewares.use('/api/proxy', createKeyProxy({ apiKey, agentId }));
    console.log(`  ElevenLabs: key proxy at /api/proxy, dispatcher agent ${agentId ? 'set' : 'NOT set'}`);
  };
  return { name: 'mayday-key-proxy', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({
  plugins: [
    react(),
    ...https,
    phoneQr(),
    keyProxy(),
    // docs/07 P4 task 7: an accidental reload with wifi off must still load. `vite-plugin-pwa`
    // is a pre-approved exception to the no-new-libraries rule (DECISIONS.md).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mayday',
        short_name: 'Mayday',
        description: 'The minutes before the ambulance, coached.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Precache only the app shell. The MediaPipe WASM runtime and models are large (each
        // WASM variant is ~11-12 MB, ~48 MB combined across the SIMD/no-SIMD/module variants
        // in public/wasm, since only one is actually loaded per browser) so precaching all of
        // them would triple first-load size for bytes most visitors never use. Instead they're
        // cached on first successful fetch (CacheFirst below), which is enough for the M4 gate:
        // reload in airplane mode works once the session has loaded successfully at least once.
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/models/') || url.pathname.startsWith('/wasm/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mayday-mediapipe-assets',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', sourcemap: true },
});
