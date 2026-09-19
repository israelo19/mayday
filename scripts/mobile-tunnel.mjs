#!/usr/bin/env node
// One command for the phone. Builds the web app under /app/ (vite.config.ts, MAYDAY_VIA_EXPO),
// serves the build with `vite preview` on a local port, and starts the Expo dev server with
// its tunnel. Metro proxies /app/ to that port (mobile/metro.config.js), so the same
// https://*.exp.direct URL Expo Go loads the shell from also serves the page over a real
// certificate, which is what the camera needs (WebViews refuse self-signed certificates on
// both platforms). Needs `npx expo login` once: Expo signs the tunnel URL with the account.
//
//   node scripts/mobile-tunnel.mjs          build, serve the build, start the tunnel
//   node scripts/mobile-tunnel.mjs --dev    serve the Vite dev server instead (no HMR through
//                                           the tunnel; reload the phone after a change)
//   node scripts/mobile-tunnel.mjs --lan    no tunnel, no login: the QR points at this laptop
//                                           on the wifi. The page is plain http there, so the
//                                           phone will not open the camera; everything else runs.
// Other flags (for example --port 8090) go to `expo start`.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const lan = args.includes('--lan');
const passthrough = args.filter((a) => a !== '--dev' && a !== '--lan');
const PAGE_PORT = dev ? '5173' : '4173';
const pageEnv = { ...process.env, MAYDAY_VIA_EXPO: '1', MAYDAY_HTTP: '1' };

if (!dev) {
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env: pageEnv });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const page = spawn(
  'npx',
  dev
    ? ['vite', '--port', PAGE_PORT, '--strictPort']
    : ['vite', 'preview', '--port', PAGE_PORT, '--strictPort'],
  { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env: pageEnv },
);
const expo = spawn('npx', ['expo', 'start', lan ? '--lan' : '--tunnel', ...passthrough], {
  cwd: join(root, 'mobile'),
  stdio: 'inherit',
  env: { ...process.env, MAYDAY_PAGE_PORT: PAGE_PORT },
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of [page, expo]) if (child.exitCode === null) child.kill('SIGINT');
  process.exitCode = code ?? 0;
}
page.on('exit', (code) => stop(code));
expo.on('exit', (code) => stop(code));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
