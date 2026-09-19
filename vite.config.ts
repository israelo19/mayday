import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import mkcert from 'vite-plugin-mkcert';
import { VitePWA } from 'vite-plugin-pwa';

// HTTPS in dev because getUserMedia needs a secure context on any origin other than
// localhost (the phone on the LAN hits https://<laptop-ip>:5173).
// Default: a self-signed certificate. No setup, no sudo; accept the browser warning once
// per device. Opt in to a trusted local CA with `MAYDAY_MKCERT=1 npm run dev`, which runs
// mkcert and asks for your macOS password once. Laptop-only work can skip TLS entirely with
// `MAYDAY_HTTP=1 npm run dev` because http://localhost is already a secure context.
// Alternative for phones: ngrok, see README.
// For the Expo Go shell (`npm run mobile:tunnel`, MAYDAY_VIA_EXPO=1) the page is served
// behind the Expo dev server, which proxies /app/ here over plain HTTP and whose tunnel
// terminates TLS: every URL is rooted at /app/, no certificate, and no HMR because the
// websocket cannot cross Metro's proxy.
const viaExpo = process.env.MAYDAY_VIA_EXPO === '1';
const https: PluginOption[] =
  process.env.MAYDAY_HTTP === '1' || viaExpo ? [] : process.env.MAYDAY_MKCERT === '1' ? [mkcert()] : [basicSsl()];

export default defineConfig({
  base: viaExpo ? '/app/' : '/',
  plugins: [
    react(),
    ...https,
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
  server: { host: true, port: 5173, strictPort: true, hmr: viaExpo ? false : undefined },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', sourcemap: true },
});
