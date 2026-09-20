#!/usr/bin/env node
// LOCAL stand-in for P4's /api/proxy (docs/04 TODO item 1), so the ElevenLabs voice and
// dispatcher can be built and measured before the real DigitalOcean Function exists. The
// API key, the agent id and the coach voice live HERE, server-side, read from the environment
// or .env.local; they never reach the browser bundle (docs/01 threat model). Node only, never
// imported by app code, and outside the *.ts globs so neither the test suite nor the bundle
// sees it.
//
// Two ways to run it:
//   1. In-process under Vite (the default): vite.config.ts mounts `createKeyProxy()` at
//      /api/proxy on the dev and preview servers when .env.local holds a key. The phone then
//      talks to the same https origin it loaded the page from, so there is no mixed-content
//      block and no CORS. This is why `npm run dev` is the only command the demo needs.
//   2. Standalone, for a laptop console session or another dev server:
//        GEMINI_API_KEY=... node src/voice/providers/devproxy.mjs [port, default 8788]
//
// Routes, relative to the mount point:
//   POST /v1/text-to-speech/*        forwarded to ElevenLabs with the key header added
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
//                                    provider is Gemini when GEMINI_API_KEY is set, else
//                                    Featherless; 404 when neither key is there.
//   POST /intent/route               { system, user, maxTokens } -> the same model without a
//                                    picture (docs/04 item 8): which of the moves the engine is
//                                    offering did the bystander mean. Same reply shape, and
//                                    src/ai/intent.ts validates the answer against its own list.
//   POST /text/complete              The same call by a plainer name, for the rewording of one
//                                    canonical line (docs/04 item 5); src/protocol/validate.ts
//                                    decides whether the answer is ever spoken.
// Nothing else is forwarded: the proxy exposes exactly what the app calls, not the API.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const UPSTREAM = 'https://api.elevenlabs.io';
const TTS_PREFIX = '/v1/text-to-speech/';
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
    // fast non-reasoning tier answers in well under a second. Chosen for the text routes; the
    // scene frame has not been tried on it, so keep a Gemini or Featherless key for that.
    defaultModel: 'grok-4-1-fast-non-reasoning',
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
 * Both are read, .env.local first, because both are what people actually create: .env.example
 * says to copy it to .env.local, and the habit of every other project says .env. A key in one
 * and not the other used to be simply invisible, with no error and no log line, which reads
 * exactly like a key that does not work. Both are gitignored.
 */
const ENV_FILES = [new URL('../../../.env.local', import.meta.url), new URL('../../../.env', import.meta.url)];

/** Value of `name` from the environment, else from .env.local, else .env, else null. */
export function readLocalEnv(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ENV_FILES) {
    try {
      const line = readFileSync(file, 'utf8')
        .split('\n')
        .find((l) => l.startsWith(`${name}=`));
      const value = line?.slice(name.length + 1).trim();
      if (value) return value;
    } catch {
      continue; // absent is normal: the other file, or the caller, decides
    }
  }
  return null;
}

/**
 * The model this machine can actually reach, for both AI routes: the provider named by
 * MODEL_PROVIDER if it has a key, else Gemini, else Featherless, else null. One resolver so the
 * Vite mount, the standalone server and scripts/assess-frame.mjs can never disagree about which
 * model ran. Switching providers is this one environment variable and nothing else.
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

/**
 * The app's question to the model, OpenAI chat-completions style. With `image`, the frame
 * rides along as a data URL content part and the call is the scene assessment; without one it
 * is the intent router. Returns the model's text untouched: every judgement about whether the
 * answer is usable belongs to src/ai, which is the side that knows what it asked for.
 */
export async function askModel({ provider = DEFAULT_PROVIDER, chat, key, model, image = null, mime = 'image/jpeg', system, user, maxTokens = 320 }) {
  const endpoint = chat ?? MODEL_PROVIDERS[provider]?.chat;
  if (!endpoint) throw new Error(`unknown provider: ${provider}`);
  const started = Date.now();
  const upstream = await fetch(endpoint, {
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
  if (!upstream.ok) throw new Error(`${provider} ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`);
  const json = await upstream.json();
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c?.text ?? '').join('') : '';
  return { text, model: json.model ?? model, provider, latencyMs: Date.now() - started };
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
 * dispatcher, WebSpeech, no scene assessment). `coachVoice` may be null too: /voice answers
 * `{ coach: null }` and the browser keeps its default voice.
 */
export function createKeyProxy({ apiKey = null, agentId = null, coachVoice = null, provider = null, visionProvider = provider }) {
  if (!apiKey && !provider) throw new Error('createKeyProxy needs a key: ELEVENLABS_API_KEY, GEMINI_API_KEY, FEATHERLESS_API_KEY or XAI_API_KEY in .env.local.');

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

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy');
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
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw?.toString('utf8') ?? '');
        } catch {
          return sendJson(res, 400, { error: 'body is not JSON' });
        }
        const { image, mime, system, user, maxTokens } = body ?? {};
        if (typeof system !== 'string' || typeof user !== 'string') return sendJson(res, 400, { error: 'system and user prompts are required' });
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
  const provider = resolveProvider();
  if (!apiKey && !provider) {
    console.error('No key. Set ELEVENLABS_API_KEY, GEMINI_API_KEY, FEATHERLESS_API_KEY or XAI_API_KEY in the environment or .env.local.');
    process.exit(1);
  }
  const agentId = readLocalEnv('ELEVENLABS_AGENT_ID');
  const coachVoice = readLocalEnv('ELEVENLABS_COACH_VOICE');
  const handle = createKeyProxy({ apiKey, agentId, coachVoice, provider });
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
      `dev proxy on http://localhost:${port}: elevenlabs ${apiKey ? `on, agent ${agentId ? 'set' : 'not set'}` : 'off'}; model ${provider ? `on (${provider.id} ${provider.model})` : 'off'}`,
    );
  });
}
