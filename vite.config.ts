import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';

// HTTPS in dev because getUserMedia needs a secure context on any origin other
// than localhost (the phone on the LAN hits https://<laptop-ip>:5173).
// First run downloads mkcert and asks for your macOS password once to trust
// the local CA. If that is impossible, `npx ngrok http https://localhost:5173`.
export default defineConfig({
  plugins: [react(), mkcert()],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', sourcemap: true },
});
