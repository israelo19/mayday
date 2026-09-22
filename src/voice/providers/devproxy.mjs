#!/usr/bin/env node
// LOCAL stand-in for P4's /api/proxy (docs/04 TODO item 1), so the ElevenLabs voice and
// dispatcher can be built and measured before the real DigitalOcean Function exists. The
// API key, the agent id and the coach voice live HERE, server-side, read from the environment
// or .env.local; they never reach the browser bundle (docs/01 threat model). Node only, never
// imported by app code, and outside the *.ts globs so the bundle never sees it;
// tests/devproxy.test.ts drives it through a throwaway http server with a fake upstream.
//
// Two ways to run it:
//   1. In-process under Vite (the default): vite.config.ts mounts `createKeyProxy()` at
//      /api/proxy on the dev and preview servers when .env.local holds a key. The phone then
//      talks to the same https origin it loaded the page from, so there is no mixed-content
//      block and no CORS. This is why `npm run dev` is the only command the demo needs.
//   2. Standalone, for a laptop console session or another dev server:
//        GEMINI_API_KEY=... node src/voice/providers/devproxy.mjs [port, default 8788]
//
// Trust model. Vite binds every interface (`host: true`) and docs/12 offers an ngrok tunnel,
// so this handler can sit on a public address with the keys behind it. What stands between
// the two lives inside createKeyProxy, so the serverless version inherits it:
//   - An origin gate. A browser names the page that made the request (sec-fetch-site, or the
//     Origin header on older browsers) and cannot be made to lie about it; a request naming
//     a foreign page is refused with 403. The one foreign origin let through is a page on
//     localhost, which is the standalone mode above. A request naming no page at all (curl)
//     passes this gate and meets the next one.
//   - A per-address rate limit, DEFAULT_RATE_PER_MINUTE requests in a sliding minute, 429
//     past it. Behind a tunnel the address is the one the tunnel appended to x-forwarded-for.
//   - Caps. Each route reads at most a fixed number of bytes (BODY_LIMITS) and answers 413
//     for more, with the socket closed behind the answer; the prompts are capped in
//     characters; the TTS route forwards only the text, only to the voices the app speaks
//     with, on the one sub-route and output format the app uses.
//   - Upstream errors are logged here with the API's own words and answered as
//     { error: 'upstream failed' } with the upstream status. The client never sees the body
//     an API sent with its error.
//
// Routes, relative to the mount point:
//   POST /v1/text-to-speech/<voice>/stream?output_format=mp3_22050_32
//                                    forwarded to ElevenLabs with the key header added. The
//                                    voice must be the coach's, the dispatcher's, or the one
//                                    resolved from ELEVENLABS_COACH_VOICE; the body is rebuilt
//                                    as { text, model_id } from the client's text, at most
//                                    MAX_TTS_CHARS characters. Anything else is 400.
//   GET  /voice                      { coach: { voiceId, voiceName } | null }: the coach voice
//                                    named by ELEVENLABS_COACH_VOICE (a voice id or a name from
//                                    the account's library), resolved once. null means "not set
//                                    or not found": the browser keeps its default (Brian).
//   GET  /dispatcher/session         { signedUrl, firstMessage } for the dispatcher agent named
//                                    by ELEVENLABS_AGENT_ID; 404 when no agent is configured.
//                                    firstMessage is the agent's configured opening line: the
//                                    socket delivers it as audio only, so the panel needs it here.
//   POST /vision/assess              { image, mime, system, user, maxTokens } -> one frame to the
//                                    scene model (docs/04 items 4 and 7, docs/11); the answer comes
//                                    back as { text, model, provider, latencyMs } and
//                                    src/ai/assess.ts decides what, if anything, it means. The
//                                    provider is the vision one: Gemini when GEMINI_API_KEY is
//                                    set, else Featherless, never xAI; 404 when neither key is
//                                    there.
//   POST /intent/route               { system, user, maxTokens } -> the text model without a
//                                    picture (docs/04 item 8): which of the moves the engine is
//                                    offering did the bystander mean. Same reply shape, and
//                                    src/ai/intent.ts validates the answer against its own list.
//   POST /text/complete              The same call by a plainer name, for the rewording of one
//                                    canonical line (docs/04 item 5); src/protocol/validate.ts
//                                    decides whether the answer is ever spoken.
// Nothing else is forwarded: the proxy exposes exactly what the app calls, not the API.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM = 'https://api.elevenlabs.io';
const TTS_PREFIX = '/v1/text-to-speech/';
/** The one TTS call the app makes (src/voice/providers/elevenlabs.ts): the streaming sub-route. */
const TTS_PATH = /^\/v1\/text-to-speech\/([A-Za-z0-9_-]+)\/stream$/;
const TTS_MODEL = 'eleven_flash_v2_5';
/** The output_format values the app sends; elevenlabs.ts DEFAULTS holds the only one today. */
const TTS_FORMATS = new Set(['mp3_22050_32']);
/**
 * The longest canonical line is 159 characters and the validator lets a rewording run to
 * twice the canonical plus 40 (src/protocol/validate.ts), so 358 is the longest text the app
 * can ask for; the SITREP read-aloud lines and the dispatcher's lines are shorter still.
 */
const MAX_TTS_CHARS = 400;
/**
 * The coach and dispatcher voices, the same literals as src/voice/providers/voices.ts, which
 * this file cannot import (TypeScript, and this module also runs under plain node).
 * tests/devproxy.test.ts holds the two copies equal.
 */
export const COACH_VOICE_ID = 'nPczCjzI2devNBz1zQrb';
export const DISPATCHER_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
const SESSION_ROUTE = '/dispatcher/session';
const VOICE_ROUTE = '/voice';
const VISION_ROUTE = '/vision/assess';
const INTENT_ROUTE = '/intent/route';
const TEXT_ROUTE = '/text/complete';
/**
 * The scene-model providers. Both speak OpenAI chat completions, so one request body serves
 * both and only the URL, the key and the model name differ: Gemini through its
 * OpenAI-compatible endpoint (ai.google.dev/gemini-api/docs/openai), Featherless natively.
 * Adding a third is a row here, not a branch anywhere else.
 */
export const MODEL_PROVIDERS = {
  gemini: {
    chat: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_VISION_MODEL',
    // Flash speed with the spatial reasoning the patient box needs, and it answers on the
    // 0 to 1000 scale src/ai/assess.ts already reads. gemini-3.5-flash-lite is quicker and
    // weaker; compare them on a real photo with scripts/assess-frame.mjs before the judged run.
    defaultModel: 'gemini-3.6-flash',
    // Gemini 3.x thinks before it answers and the thinking tokens come out of max_tokens, so
    // at this app's budgets the reply arrived truncated or empty. Both calls here are
    // classification against a closed list, not reasoning. Off: 907 ms and 88 tokens for the
    // intent call instead of 3.4 s and 471, which also stretches a tight free tier much further.
    body: { reasoning_effort: 'none' },
  },
  featherless: {
    chat: 'https://api.featherless.ai/v1/chat/completions',
    keyEnv: 'FEATHERLESS_API_KEY',
    modelEnv: 'FEATHERLESS_VISION_MODEL',
    /** Small, warm, and it answers with boxes. Qwen/Qwen3-VL-8B-Instruct for a sharper run. */
    defaultModel: 'Qwen/Qwen2.5-VL-7B-Instruct',
  },
  xai: {
    chat: 'https://api.x.ai/v1/chat/completions',
    keyEnv: 'XAI_API_KEY',
    modelEnv: 'XAI_MODEL',
    // The HopHacks xAI credits. Classification and rewording need no reasoning pass, and the
    // non-reasoning tier answers in well under a second. Chosen for the text routes; the
    // scene frame has not been tried on it, so keep a Gemini or Featherless key for that.
    //
    // The id matters more than it looks. grok-4-1-fast-non-reasoning is not on this account's
    // model list, and xAI does not say so: it quietly served grok-4.3, which thinks first.
    // Measured on the intent prompt, five sentences each: grok-4.3 answered 3/5 with a median
    // of 4.8 s and every call over the router's 3 s budget; grok-4.5 3/5 at 3.8 s; this one
    // 4/5 at 580 ms with nothing over budget. A wrong model id here reads as a flaky feature.
    defaultModel: 'grok-4.20-0309-non-reasoning',
    // Which is enforced rather than remembered: the frame route skips this provider, so
    // MODEL_PROVIDER=xai gives Grok the text routes and leaves the camera frame on Gemini.
    vision: false,
  },
};

/** Gemini first: it is the sponsor track (docs/04 items 4 and 7) and the boxes come back better. */
export const DEFAULT_PROVIDER = 'gemini';
/** A 640 px JPEG is well under this; anything bigger is not a frame from the app. */
const MAX_IMAGE_CHARS = 2_000_000;
/**
 * The prompts the app sends (src/ai/assess.ts, intent.ts, narration.ts) run 164 to 633
 * characters of system text and under 2,000 of user text even with a dozen options on the
 * screen and a long transcript. The caps leave room for growth, not for essays.
 */
const MAX_SYSTEM_CHARS = 2000;
const MAX_USER_CHARS = 4000;
/**
 * Bytes each route reads before answering 413: the frame route takes the base64 frame above
 * with its prompts, the text routes their prompts, the TTS route one line. Past the limit
 * nothing more is kept and the socket closes behind the answer.
 */
const BODY_LIMITS = { vision: 3 * 1024 * 1024, text: 16 * 1024, tts: 4 * 1024 };
/**
 * Requests one address may make in a sliding minute. docs/04 TODO 1 promised 30, written
 * before the ElevenLabs cache existed: at session start the app warms every canonical line,
 * about 60 requests in the first minute from the one phone on stage, with a rewording or a
 * frame on top. 120 covers that with room and still bounds what a stranger can spend of the
 * keys, since every request is itself capped above.
 */
export const DEFAULT_RATE_PER_MINUTE = 120;
const RATE_WINDOW_MS = 60_000;
/** The origins of the standalone mode: a dev page on another localhost port. */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
/** The repo root, where .env.local and .env live; a test hands the reader a directory of its own. */
const ENV_DIR = new URL('../../../', import.meta.url);
/**
 * Both are read, .env.local first, because both are what people actually create: .env.example
 * says to copy it to .env.local, and the habit of every other project says .env. A key in one
 * and not the other used to be simply invisible, with no error and no log line, which reads
 * exactly like a key that does not work. Both are gitignored.
 */
const ENV_FILES = ['.env.local', '.env'];

/**
 * The values in one .env file, by name. Enough of the dotenv grammar for a hand-written file:
 * a BOM, blank and # lines, an `export ` prefix, a value in matching single or double quotes,
 * and a trailing ` # comment` after an unquoted value. The first line for a name wins.
 */
export function parseEnv(text) {
  const values = new Map();
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m || values.has(m[1])) continue;
    const rest = m[2].trim();
    const quoted = /^(["'])(.*?)\1(?:\s+#.*)?$/.exec(rest);
    values.set(m[1], quoted ? quoted[2] : rest.replace(/(?:^|\s+)#.*$/, '').trim());
  }
  return values;
}

/**
 * Where `name` is set and what it holds: the environment, else .env.local, else .env in
 * `dir`, else null. The source is for the startup log, which names the file and never the key.
 */
export function findLocalEnv(name, dir = ENV_DIR) {
  if (process.env[name]) return { value: process.env[name], source: 'environment' };
  const root = typeof dir === 'string' ? dir : fileURLToPath(dir);
  for (const file of ENV_FILES) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // absent is normal: the other file, or the caller, decides
    }
    const value = parseEnv(text).get(name);
    if (value) return { value, source: file };
  }
  return null;
}

/** Value of `name` from the environment, else from .env.local, else .env, else null. */
export function readLocalEnv(name, dir = ENV_DIR) {
  return findLocalEnv(name, dir)?.value ?? null;
}

/** One line for the startup log: where each named key came from, never what it is. */
export function keySources(names, dir = ENV_DIR) {
  return names
    .map((name) => {
      const source = findLocalEnv(name, dir)?.source;
      return `${name} ${source === undefined ? 'not set' : source === 'environment' ? 'from the environment' : `from ${source}`}`;
    })
    .join(', ');
}

/**
 * The model this machine can actually reach, for the AI routes: the provider named by
 * MODEL_PROVIDER if it has a key, else Gemini, else Featherless, else xAI, else null; with
 * `vision`, xAI drops out (the frame route skips it). One resolver so the Vite mount, the
 * standalone server and scripts/assess-frame.mjs can never disagree about which model ran.
 * Switching providers is this one environment variable and nothing else.
 */
export function resolveProvider(name = readLocalEnv('MODEL_PROVIDER'), { vision = false } = {}) {
  // A named provider wins, then the default order. With `vision`, providers we have not tried
  // on a frame drop out of both: MODEL_PROVIDER=xai then serves the text routes while the
  // camera frame falls through to whichever vision key is present, instead of going to a
  // model that has never been asked to find a person in a photograph.
  const named = name && MODEL_PROVIDERS[name] ? [name] : [];
  const wanted = [...named, DEFAULT_PROVIDER, 'featherless', 'xai'].filter(
    (id) => !vision || MODEL_PROVIDERS[id].vision !== false,
  );
  for (const id of wanted) {
    const provider = MODEL_PROVIDERS[id];
    const key = readLocalEnv(provider.keyEnv);
    if (key) return { id, key, chat: provider.chat, model: readLocalEnv(provider.modelEnv) ?? provider.defaultModel };
  }
  return null;
}

/** An API answered with an error. The status is kept for the client; the text is for the server log only. */
class UpstreamError extends Error {
  constructor(provider, status, text) {
    super(`${provider} ${status}: ${text.slice(0, 300)}`);
    this.status = status;
  }
}

/**
 * The app's question to the model, OpenAI chat-completions style. With `image`, the frame
 * rides along as a data URL content part and the call is the scene assessment; without one it
 * is the intent router. Returns the model's text untouched: every judgement about whether the
 * answer is usable belongs to src/ai, which is the side that knows what it asked for.
 */
export async function askModel({ provider = DEFAULT_PROVIDER, chat, key, model, image = null, mime = 'image/jpeg', system, user, maxTokens = 320, fetchFn = fetch }) {
  const endpoint = chat ?? MODEL_PROVIDERS[provider]?.chat;
  if (!endpoint) throw new Error(`unknown provider: ${provider}`);
  const started = Date.now();
  const upstream = await fetchFn(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      ...(MODEL_PROVIDERS[provider]?.body ?? {}),
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: image
            ? [
                { type: 'text', text: user },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } },
              ]
            : user,
        },
      ],
    }),
  });
  if (!upstream.ok) throw new UpstreamError(provider, upstream.status, await upstream.text());
  const json = await upstream.json();
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c?.text ?? '').join('') : '';
  return { text, model: json.model ?? model, provider, latencyMs: Date.now() - started };
}

function sendJson(res, status, body) {
  // The audio route writes its own head, so an error after that point would land here and
  // write a second one. In Node that throws inside an async middleware, and an unhandled
  // rejection there takes the dev server down in the middle of a session.
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * The raw body, or null once it runs past `limit` bytes. Past the limit nothing more is
 * kept and the caller answers with sendTooLarge, so a client cannot fill this process's
 * memory with an upload that was never going to be a frame or a line. A connection that dies
 * mid-body resolves empty: there is nobody left to answer, and the route fails it quietly.
 */
export function readBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) resolve(null);
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
    req.on('error', () => resolve(undefined));
  });
}

/**
 * The 413 behind readBody. It goes out with connection: close and the socket is destroyed
 * once the answer has left, so the rest of the upload is never read.
 */
export function sendTooLarge(req, res) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(413, { 'content-type': 'application/json', connection: 'close' });
  res.end(JSON.stringify({ error: 'body too large' }), () => req.destroy());
}

/**
 * Why a request is refused at the door, or null when it may go on to a route. A browser says
 * which page made the request and cannot be made to lie about it: sec-fetch-site on current
 * browsers, else the Origin header, which every POST carries. Either one naming a foreign page
 * is a 403. sec-fetch-site is believed on its own when present, because a tunnel that rewrites
 * the Host header (ngrok's --host-header) would otherwise fail every same-origin call from the
 * phone. A localhost page is the one foreign origin let through, so the standalone server on
 * 8788 can serve a dev page on 5173. A request naming no page at all (curl) passes here and
 * meets the rate limit.
 */
function crossOriginReason(req) {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  const local = typeof origin === 'string' && LOCAL_ORIGIN.test(origin);
  if (typeof site === 'string') {
    if (site === 'same-origin' || site === 'none' || (site === 'same-site' && local)) return null;
    return `sec-fetch-site ${site}`;
  }
  if (typeof origin === 'string' && !local) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      // "null" or garbage is not this host either: refused below
    }
    if (host !== req.headers.host) return `origin ${origin}`;
  }
  return null;
}

/**
 * The address a request comes from, for the rate limit. Behind a tunnel every socket is
 * loopback and the client's address is the last entry of x-forwarded-for, the one the tunnel
 * itself appended; earlier entries are whatever the client claimed. On the LAN the socket
 * address is the truth and a forwarded header would be the client's own invention, so it is
 * ignored unless the peer is loopback.
 */
function clientAddress(req) {
  const peer = req.socket?.remoteAddress ?? 'unknown';
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  return loopback && forwarded.length > 0 ? forwarded[forwarded.length - 1] : peer;
}

/** True while `address` is under `perMinute` requests in the trailing minute: a window of timestamps per address. */
function rateLimiter(perMinute) {
  const seen = new Map();
  return (address) => {
    const now = Date.now();
    const recent = (seen.get(address) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
    const allowed = recent.length < perMinute;
    if (allowed) recent.push(now);
    seen.set(address, recent);
    // Addresses that went quiet would otherwise sit in the map for the life of the process.
    if (seen.size > 1000) {
      for (const [key, times] of seen) if (times.length === 0 || now - times[times.length - 1] >= RATE_WINDOW_MS) seen.delete(key);
    }
    return allowed;
  };
}

/**
 * Request handler that adds the keys to the allowed upstream calls. Every key may be null: a
 * route whose key is missing answers 404 and the app keeps its local stub (the scripted
 * dispatcher, WebSpeech, no scene assessment). `coachVoice` may be null too: /voice answers
 * `{ coach: null }` and the browser keeps its default voice. `ratePerMinute` and `fetchFn`
 * are seams for the tests; the defaults are the real thing.
 */
export function createKeyProxy({ apiKey = null, agentId = null, coachVoice = null, provider = null, visionProvider = provider, ratePerMinute = DEFAULT_RATE_PER_MINUTE, fetchFn = fetch }) {
  if (!apiKey && !provider) throw new Error('createKeyProxy needs a key: ELEVENLABS_API_KEY, GEMINI_API_KEY, FEATHERLESS_API_KEY or XAI_API_KEY in .env.local.');

  const forward = async (path, init) => {
    const upstream = await fetchFn(UPSTREAM + path, {
      ...init,
      headers: { ...init.headers, 'xi-api-key': apiKey }, // the one place the key exists
    });
    return upstream;
  };

  /** One line here with the API's own words; a fixed line and the status to the client. */
  const failUpstream = (req, res, url, status, detail) => {
    console.warn(`  [proxy] ${req.method} ${url.pathname} upstream ${status}: ${detail.slice(0, 200)}`);
    return sendJson(res, status, { error: 'upstream failed' });
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

  // The coach voice is configuration, fixed for the process: resolved once against the
  // account's library, so a human can write "Daniel" instead of copying an id. A miss is
  // logged once and answered as null, never as a silent different voice. The promise is what
  // is kept, so two page loads racing the first answer share one library call.
  const lookupCoachVoice = async () => {
    if (!apiKey || !coachVoice?.trim()) return null; // no key: nothing to resolve against
    const wanted = coachVoice.trim();
    const upstream = await forward('/v1/voices', { method: 'GET', headers: {} });
    const voices = upstream.ok ? ((await upstream.json()).voices ?? []) : [];
    const byName = (test) => voices.find((v) => test(String(v.name).toLowerCase(), wanted.toLowerCase()));
    const hit =
      voices.find((v) => v.voice_id === wanted) ?? byName((name, w) => name === w) ?? byName((name, w) => name.startsWith(w));
    if (!hit) {
      console.warn(`  ElevenLabs: no voice matching ELEVENLABS_COACH_VOICE="${coachVoice}" in this account; the default coach voice speaks`);
      return null;
    }
    console.log(`  ElevenLabs: coach voice ${hit.name} (${hit.voice_id})`);
    return { voiceId: hit.voice_id, voiceName: hit.name };
  };
  let coachLookup;
  const resolveCoachVoice = () => (coachLookup ??= lookupCoachVoice());

  const allow = rateLimiter(ratePerMinute);

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy');
    const refused = crossOriginReason(req);
    if (refused) {
      console.warn(`  [proxy] ${req.method} ${url.pathname} refused: ${refused}`);
      return sendJson(res, 403, { error: 'cross-origin request refused' });
    }
    if (!allow(clientAddress(req))) return sendJson(res, 429, { error: 'too many requests' });
    try {
      if (req.method === 'GET' && url.pathname === VOICE_ROUTE) {
        return sendJson(res, 200, { coach: await resolveCoachVoice() });
      }
      if (req.method === 'POST' && (url.pathname === VISION_ROUTE || url.pathname === INTENT_ROUTE || url.pathname === TEXT_ROUTE)) {
        const wantsImage = url.pathname === VISION_ROUTE;
        const chosen = wantsImage ? visionProvider : provider;
        if (!chosen) {
          return sendJson(res, 404, {
            error: wantsImage
              ? 'No vision model key configured: GEMINI_API_KEY or FEATHERLESS_API_KEY'
              : 'No model key configured: GEMINI_API_KEY, FEATHERLESS_API_KEY or XAI_API_KEY',
          });
        }
        const raw = await readBody(req, wantsImage ? BODY_LIMITS.vision : BODY_LIMITS.text);
        if (raw === null) return sendTooLarge(req, res);
        let body;
        try {
          body = JSON.parse(raw?.toString('utf8') ?? '');
        } catch {
          return sendJson(res, 400, { error: 'body is not JSON' });
        }
        const { image, mime, system, user, maxTokens } = body ?? {};
        if (typeof system !== 'string' || typeof user !== 'string') return sendJson(res, 400, { error: 'system and user prompts are required' });
        if (system.length > MAX_SYSTEM_CHARS || user.length > MAX_USER_CHARS) {
          return sendJson(res, 413, { error: `prompts are capped at ${MAX_SYSTEM_CHARS} system and ${MAX_USER_CHARS} user characters` });
        }
        if (wantsImage && (typeof image !== 'string' || image.length === 0 || image.length > MAX_IMAGE_CHARS)) return sendJson(res, 400, { error: 'image must be a base64 string of a small JPEG' });
        const reply = await askModel({
          provider: chosen.id,
          chat: chosen.chat,
          key: chosen.key,
          model: chosen.model,
          image: wantsImage ? image : null,
          mime: mime === 'image/png' ? 'image/png' : 'image/jpeg',
          system,
          user,
          maxTokens: typeof maxTokens === 'number' ? Math.min(600, Math.max(32, maxTokens)) : undefined,
          fetchFn,
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
        if (!upstream.ok) return failUpstream(req, res, url, upstream.status, await upstream.text());
        const { signed_url: signedUrl } = await upstream.json();
        return sendJson(res, 200, { signedUrl, firstMessage: await agentFirstMessage() });
      }
      if (req.method === 'POST' && url.pathname.startsWith(TTS_PREFIX)) {
        if (!apiKey) return sendJson(res, 404, { error: 'No ELEVENLABS_API_KEY configured' });
        // The path, the query and the body are all rebuilt from the few values the app is
        // allowed to choose. What ElevenLabs receives is this file's shape, not the client's.
        const voiceId = TTS_PATH.exec(url.pathname)?.[1];
        const coach = await resolveCoachVoice();
        const voices = new Set([COACH_VOICE_ID, DISPATCHER_VOICE_ID, coach?.voiceId].filter(Boolean));
        if (!voiceId || !voices.has(voiceId)) return sendJson(res, 400, { error: 'not a voice the app speaks with' });
        const format = url.searchParams.get('output_format') ?? '';
        if (!TTS_FORMATS.has(format) || [...url.searchParams.keys()].some((k) => k !== 'output_format')) {
          return sendJson(res, 400, { error: 'unsupported output_format' });
        }
        const raw = await readBody(req, BODY_LIMITS.tts);
        if (raw === null) return sendTooLarge(req, res);
        let text;
        try {
          text = JSON.parse(raw?.toString('utf8') ?? '')?.text;
        } catch {
          return sendJson(res, 400, { error: 'body is not JSON' });
        }
        if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TTS_CHARS) {
          return sendJson(res, 400, { error: `text must be 1 to ${MAX_TTS_CHARS} characters` });
        }
        const upstream = await forward(`${TTS_PREFIX}${voiceId}/stream?output_format=${format}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, model_id: TTS_MODEL }),
        });
        if (!upstream.ok) return failUpstream(req, res, url, upstream.status, await upstream.text());
        // Read the whole body before writing the head: a fault while reading then still has
        // somewhere to report itself, instead of arriving after the response has begun.
        const audio = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, {
          'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        });
        return res.end(audio);
      }
      return sendJson(res, 404, { error: `not proxied: ${req.method} ${url.pathname}` });
    } catch (err) {
      // One line per upstream failure, or a dead model looks like a dead feature. The client
      // gets the status and a fixed line; the API's own words stay in this log.
      console.warn(`  [proxy] ${req.method} ${url.pathname} failed: ${String(err).slice(0, 200)}`);
      return sendJson(res, err instanceof UpstreamError ? err.status : 502, { error: 'upstream failed' });
    }
  };
}

// ---------- standalone server ----------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, '/'));
if (isMain) {
  const apiKey = readLocalEnv('ELEVENLABS_API_KEY');
  const provider = resolveProvider();
  // The frame route picks its own, as the Vite mount does: never a text-only model.
  const visionProvider = resolveProvider(null, { vision: true });
  if (!apiKey && !provider) {
    console.error('No key. Set ELEVENLABS_API_KEY, GEMINI_API_KEY, FEATHERLESS_API_KEY or XAI_API_KEY in the environment, .env.local or .env.');
    process.exit(1);
  }
  const agentId = readLocalEnv('ELEVENLABS_AGENT_ID');
  const coachVoice = readLocalEnv('ELEVENLABS_COACH_VOICE');
  const handle = createKeyProxy({ apiKey, agentId, coachVoice, provider, visionProvider });
  const port = Number(process.argv[2] ?? 8788);
  createServer((req, res) => {
    // Dev CORS for a page on another localhost port, which is what this mode is for. Any
    // other origin gets no CORS header at all and the browser drops the answer; Vary keeps a
    // cache from handing one origin's answer to another.
    const origin = req.headers.origin;
    if (typeof origin === 'string' && LOCAL_ORIGIN.test(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('vary', 'origin');
    }
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    void handle(req, res);
  }).listen(port, () => {
    console.log(
      `dev proxy on http://localhost:${port}: elevenlabs ${apiKey ? `on, agent ${agentId ? 'set' : 'not set'}` : 'off'}; model ${provider ? `on (${provider.id} ${provider.model})` : 'off'}; frame model ${visionProvider ? `on (${visionProvider.id} ${visionProvider.model})` : 'off'}`,
    );
    console.log(`  keys: ${keySources(['ELEVENLABS_API_KEY', 'GEMINI_API_KEY', 'FEATHERLESS_API_KEY', 'XAI_API_KEY'])}`);
  });
}
