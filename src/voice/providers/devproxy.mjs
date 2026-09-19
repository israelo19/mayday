#!/usr/bin/env node
// Throwaway LOCAL stand-in for P4's /api/proxy (docs/04 TODO item 1), so P3 can build and
// measure the ElevenLabs provider before the real DigitalOcean Function exists. The API
// key lives HERE, server-side, read from the environment or .env.local — it never reaches
// the browser bundle (docs/01 threat model). Node script, never imported by app code, and
// outside the *.ts globs so neither the test suite nor the bundle ever sees it.
//
// Usage:
//   ELEVENLABS_API_KEY=sk_... node src/voice/providers/devproxy.mjs [port]
//   (or put ELEVENLABS_API_KEY=sk_... in .env.local, which is gitignored)
// Then in the browser console or a dev-only code path:
//   new ElevenLabsProvider({ baseUrl: 'http://localhost:8788', voiceId: '...', fallback })
//
// Limitation, on purpose: an https page on the PHONE cannot call http://<laptop-ip>:8788
// (mixed content). Laptop Chrome exempts http://localhost, so laptop dev works; phone runs
// with the ElevenLabs flag wait for P4's same-origin proxy. WebSpeech is the floor anyway.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const UPSTREAM = 'https://api.elevenlabs.io';
const PORT = Number(process.argv[2] ?? 8788);

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const line = readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('ELEVENLABS_API_KEY='));
    if (line) return line.slice('ELEVENLABS_API_KEY='.length).trim();
  } catch {
    // no .env.local — fall through to the error below
  }
  console.error('No key. Set ELEVENLABS_API_KEY in the environment or .env.local.');
  process.exit(1);
}

const KEY = apiKey();

createServer((req, res) => {
  // Dev CORS: the Vite origin differs from this port. The real proxy is same-origin.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (!req.url?.startsWith('/v1/')) {
    res.writeHead(404).end('only /v1/* is proxied');
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    try {
      const upstream = await fetch(UPSTREAM + req.url, {
        method: req.method,
        headers: {
          'xi-api-key': KEY, // the one place the key exists
          'content-type': req.headers['content-type'] ?? 'application/json',
        },
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
      });
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      res.writeHead(502).end(String(err));
    }
  });
}).listen(PORT, () => {
  console.log(`elevenlabs dev proxy on http://localhost:${PORT} -> ${UPSTREAM} (key loaded)`);
});
