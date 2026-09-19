import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import mkcert from 'vite-plugin-mkcert';

// HTTPS in dev because getUserMedia needs a secure context on any origin other than
// localhost (the phone on the LAN hits https://<laptop-ip>:5173).
// Default: a self-signed certificate. No setup, no sudo; accept the browser warning once
// per device. Opt in to a trusted local CA with `MAYDAY_MKCERT=1 npm run dev`, which runs
// mkcert and asks for your macOS password once. Laptop-only work can skip TLS entirely with
// `MAYDAY_HTTP=1 npm run dev` because http://localhost is already a secure context.
// Alternative for phones: ngrok, see README.
const https: PluginOption[] =
  process.env.MAYDAY_HTTP === '1' ? [] : process.env.MAYDAY_MKCERT === '1' ? [mkcert()] : [basicSsl()];

export default defineConfig({
  plugins: [react(), ...https],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', sourcemap: true },
});
