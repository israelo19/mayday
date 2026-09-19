#!/usr/bin/env node
// LOCAL stand-in for P4's /api/proxy (docs/04 TODO item 1), so the ElevenLabs voice and
// dispatcher can be built and measured before the real DigitalOcean Function exists. The
// API key and the agent id live HERE, server-side, read from the environment or .env.local;
// they never reach the browser bundle (docs/01 threat model). Node only, never imported by
// app code, and outside the *.ts globs so neither the test suite nor the bundle sees it.
//
// Two ways to run it:
//   1. In-process under Vite (the default): vite.config.ts mounts `createKeyProxy()` at
//      /api/proxy on the dev and preview servers when .env.local holds a key. The phone then
//      talks to the same https origin it loaded the page from, so there is no mixed-content
//      block and no CORS. This is why `npm run dev` is the only command the demo needs.
//   2. Standalone, for a laptop console session or another dev server:
//        ELEVENLABS_API_KEY=sk_... node src/voice/providers/devproxy.mjs [port, default 8788]
//
// Routes, relative to the mount point:
//   POST /v1/text-to-speech/*        forwarded to ElevenLabs with the key header added
//   GET  /dispatcher/session         { signedUrl } for the dispatcher agent named by
//                                    ELEVENLABS_AGENT_ID; 404 when no agent is configured
// Nothing else is forwarded: the proxy exposes exactly what the app calls, not the API.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const UPSTREAM = 'https://api.elevenlabs.io';
const TTS_PREFIX = '/v1/text-to-speech/';
const SESSION_ROUTE = '/dispatcher/session';
const ENV_LOCAL = new URL('../../../.env.local', import.meta.url);

/** Value of `name` from the environment, else from .env.local, else null. */
export function readLocalEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(ENV_LOCAL, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`));
    const value = line?.slice(name.length + 1).trim();
    return value ? value : null;
  } catch {
    return null; // no .env.local: the caller decides whether that is fatal
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
  });
}

/**
 * Request handler that adds the key to the allowed ElevenLabs calls. `agentId` may be null:
 * the TTS route still works and the dispatcher route answers 404 so the app keeps its
 * scripted dispatcher (docs/07 P3 task 7).
 */
export function createKeyProxy({ apiKey, agentId = null }) {
  if (!apiKey) throw new Error('createKeyProxy needs `apiKey`; set ELEVENLABS_API_KEY in .env.local.');

  const forward = async (path, init) => {
    const upstream = await fetch(UPSTREAM + path, {
      ...init,
      headers: { ...init.headers, 'xi-api-key': apiKey }, // the one place the key exists
    });
    return upstream;
  };

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy');
    try {
      if (req.method === 'GET' && url.pathname === SESSION_ROUTE) {
        if (!agentId) return sendJson(res, 404, { error: 'No ELEVENLABS_AGENT_ID configured' });
        const upstream = await forward(
          `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
          { method: 'GET', headers: {} },
        );
        if (!upstream.ok) return sendJson(res, upstream.status, { error: await upstream.text() });
        const { signed_url: signedUrl } = await upstream.json();
        return sendJson(res, 200, { signedUrl });
      }
      if (req.method === 'POST' && url.pathname.startsWith(TTS_PREFIX)) {
        const upstream = await forward(url.pathname + url.search, {
          method: 'POST',
          headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
          body: await readBody(req),
        });
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        });
        return res.end(Buffer.from(await upstream.arrayBuffer()));
      }
      return sendJson(res, 404, { error: `not proxied: ${req.method} ${url.pathname}` });
    } catch (err) {
      return sendJson(res, 502, { error: String(err) });
    }
  };
}

// ---------- standalone server ----------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, '/'));
if (isMain) {
  const apiKey = readLocalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) {
    console.error('No key. Set ELEVENLABS_API_KEY in the environment or .env.local.');
    process.exit(1);
  }
  const agentId = readLocalEnv('ELEVENLABS_AGENT_ID');
  const handle = createKeyProxy({ apiKey, agentId });
  const port = Number(process.argv[2] ?? 8788);
  createServer((req, res) => {
    // Dev CORS: a page on another port calls this directly. Under Vite it is same-origin.
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    void handle(req, res);
  }).listen(port, () => {
    console.log(
      `elevenlabs dev proxy on http://localhost:${port} -> ${UPSTREAM} (key loaded, agent ${agentId ? 'set' : 'not set'})`,
    );
  });
}
