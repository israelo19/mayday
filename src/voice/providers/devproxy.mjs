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
//   GET  /dispatcher/session         { signedUrl, firstMessage } for the dispatcher agent named
//                                    by ELEVENLABS_AGENT_ID; 404 when no agent is configured.
//                                    firstMessage is the agent's configured opening line: the
//                                    socket delivers it as audio only, so the panel needs it here.
//   POST /vision/assess              { image, mime, system, user, maxTokens } -> one frame to the
//                                    scene model on Featherless (docs/04 item 7, docs/11); the
//                                    answer comes back as { text, model, provider, latencyMs } and
//                                    src/ai/assess.ts decides what, if anything, it means. The
//                                    model is FEATHERLESS_VISION_MODEL; 404 without a key.
// Nothing else is forwarded: the proxy exposes exactly what the app calls, not the API.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const UPSTREAM = 'https://api.elevenlabs.io';
const TTS_PREFIX = '/v1/text-to-speech/';
const SESSION_ROUTE = '/dispatcher/session';
const VISION_ROUTE = '/vision/assess';
const FEATHERLESS_CHAT = 'https://api.featherless.ai/v1/chat/completions';
/** Cheap and warm, and it answers with boxes: the development default. Qwen3-VL-8B for the demo. */
export const DEFAULT_VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct';
/** A 640 px JPEG is well under this; anything bigger is not a frame from the app. */
const MAX_IMAGE_CHARS = 2_000_000;
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

/**
 * One frame and the app's question to a Featherless vision model, OpenAI chat-completions
 * style: the image rides along as a data URL content part (featherless.ai/docs/vision).
 * Returns the model's text untouched; the client parses and validates it.
 */
export async function assessWithFeatherless({ key, model, image, mime = 'image/jpeg', system, user, maxTokens = 320 }) {
  const started = Date.now();
  const upstream = await fetch(FEATHERLESS_CHAT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: user },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } },
          ],
        },
      ],
    }),
  });
  if (!upstream.ok) throw new Error(`featherless ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`);
  const json = await upstream.json();
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c?.text ?? '').join('') : '';
  return { text, model: json.model ?? model, provider: 'featherless', latencyMs: Date.now() - started };
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
 * Request handler that adds the keys to the allowed upstream calls. Every key may be null: a
 * route whose key is missing answers 404 and the app keeps its local stub (the scripted
 * dispatcher, WebSpeech, no scene assessment).
 */
export function createKeyProxy({ apiKey = null, agentId = null, visionKey = null, visionModel = DEFAULT_VISION_MODEL }) {
  if (!apiKey && !visionKey) throw new Error('createKeyProxy needs a key: ELEVENLABS_API_KEY or FEATHERLESS_API_KEY in .env.local.');

  const forward = async (path, init) => {
    const upstream = await fetch(UPSTREAM + path, {
      ...init,
      headers: { ...init.headers, 'xi-api-key': apiKey }, // the one place the key exists
    });
    return upstream;
  };

  // The opening line is agent configuration, fixed for the process: fetched once, kept.
  let firstMessage;
  const agentFirstMessage = async () => {
    if (firstMessage !== undefined) return firstMessage;
    const upstream = await forward(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { method: 'GET', headers: {} });
    const config = upstream.ok ? await upstream.json() : null;
    firstMessage = config?.conversation_config?.agent?.first_message || null;
    return firstMessage;
  };

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy');
    try {
      if (req.method === 'POST' && url.pathname === VISION_ROUTE) {
        if (!visionKey) return sendJson(res, 404, { error: 'No FEATHERLESS_API_KEY configured' });
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw?.toString('utf8') ?? '');
        } catch {
          return sendJson(res, 400, { error: 'body is not JSON' });
        }
        const { image, mime, system, user, maxTokens } = body ?? {};
        if (typeof image !== 'string' || image.length === 0 || image.length > MAX_IMAGE_CHARS) return sendJson(res, 400, { error: 'image must be a base64 string of a small JPEG' });
        if (typeof system !== 'string' || typeof user !== 'string') return sendJson(res, 400, { error: 'system and user prompts are required' });
        const reply = await assessWithFeatherless({
          key: visionKey,
          model: visionModel,
          image,
          mime: mime === 'image/png' ? 'image/png' : 'image/jpeg',
          system,
          user,
          maxTokens: typeof maxTokens === 'number' ? Math.min(600, Math.max(64, maxTokens)) : undefined,
        });
        return sendJson(res, 200, reply);
      }
      if (req.method === 'GET' && url.pathname === SESSION_ROUTE) {
        if (!apiKey) return sendJson(res, 404, { error: 'No ELEVENLABS_API_KEY configured' });
        if (!agentId) return sendJson(res, 404, { error: 'No ELEVENLABS_AGENT_ID configured' });
        const upstream = await forward(
          `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
          { method: 'GET', headers: {} },
        );
        if (!upstream.ok) return sendJson(res, upstream.status, { error: await upstream.text() });
        const { signed_url: signedUrl } = await upstream.json();
        return sendJson(res, 200, { signedUrl, firstMessage: await agentFirstMessage() });
      }
      if (req.method === 'POST' && url.pathname.startsWith(TTS_PREFIX)) {
        if (!apiKey) return sendJson(res, 404, { error: 'No ELEVENLABS_API_KEY configured' });
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
  const visionKey = readLocalEnv('FEATHERLESS_API_KEY');
  if (!apiKey && !visionKey) {
    console.error('No key. Set ELEVENLABS_API_KEY or FEATHERLESS_API_KEY in the environment or .env.local.');
    process.exit(1);
  }
  const agentId = readLocalEnv('ELEVENLABS_AGENT_ID');
  const visionModel = readLocalEnv('FEATHERLESS_VISION_MODEL') ?? DEFAULT_VISION_MODEL;
  const handle = createKeyProxy({ apiKey, agentId, visionKey, visionModel });
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
      `dev proxy on http://localhost:${port}: elevenlabs ${apiKey ? `on, agent ${agentId ? 'set' : 'not set'}` : 'off'}; vision ${visionKey ? `on (${visionModel})` : 'off'}`,
    );
  });
}
