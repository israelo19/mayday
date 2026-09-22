// @vitest-environment node
// The key proxy's door and its caps (docs/01 threat model, docs/04 TODO 1), driven through a
// throwaway http server with a fake upstream: no key, no network, and every refusal asserted
// rather than remembered. The proxy is plain JavaScript (see its header); its types come from
// devproxy.d.mts.
import { createServer, request, type IncomingHttpHeaders, type OutgoingHttpHeaders, type Server } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { COACH_VOICE_ID as APP_COACH_VOICE_ID, DISPATCHER_VOICE_ID as APP_DISPATCHER_VOICE_ID } from '../src/voice/providers/voices';
import {
  COACH_VOICE_ID,
  createKeyProxy,
  DISPATCHER_VOICE_ID,
  findLocalEnv,
  parseEnv,
  readLocalEnv,
} from '../src/voice/providers/devproxy.mjs';

type Reply = { status: number; headers: IncomingHttpHeaders; text: string };
type Upstream = { calls: { url: string; init: RequestInit }[]; fetchFn: typeof fetch };
type Running = { port: number; server: Server; close: () => Promise<void> };

/** A fake ElevenLabs and model endpoint: records every call and answers what the test wired in. */
function upstream(answer: (url: string) => Response = () => new Response('{}', { status: 200 })): Upstream {
  const calls: Upstream['calls'] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return answer(url);
  }) as typeof fetch;
  return { calls, fetchFn };
}

/** The proxy on an ephemeral port. Every group starts its own, so the rate limit begins clean. */
async function start(options: Parameters<typeof createKeyProxy>[0]): Promise<Running> {
  const handle = createKeyProxy(options);
  const server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    port,
    server,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function call(port: number, o: { method?: string; path: string; headers?: OutgoingHttpHeaders; body?: string }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: o.method ?? 'GET', path: o.path, headers: o.headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(o.body);
  });
}

const TEXT_PROVIDER = { id: 'gemini' as const, key: 'model-key', chat: 'https://model.invalid/chat/completions', model: 'test-model' };
const chatReply = (text: string): Response => new Response(JSON.stringify({ model: 'test-model', choices: [{ message: { content: text } }] }), { status: 200 });

let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  // The proxy logs every refusal and upstream fault, which is the point; the test output is not the place.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  warn.mockRestore();
  log.mockRestore();
});

describe('the origin gate', () => {
  let proxy: Running;
  beforeAll(async () => {
    proxy = await start({ apiKey: 'eleven-key', fetchFn: upstream().fetchFn });
  });
  afterAll(() => proxy.close());

  it('refuses a request from another page', async () => {
    const r = await call(proxy.port, { path: '/voice', headers: { host: 'mayday.example:5173', origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text)).toEqual({ error: 'cross-origin request refused' });
  });

  it('refuses what the browser itself marks cross-site or same-site', async () => {
    expect((await call(proxy.port, { path: '/voice', headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await call(proxy.port, { path: '/voice', headers: { 'sec-fetch-site': 'same-site', origin: 'https://a.example' } })).status).toBe(403);
  });

  it('refuses an opaque origin', async () => {
    expect((await call(proxy.port, { path: '/voice', headers: { origin: 'null' } })).status).toBe(403);
  });

  it("lets the page's own requests through", async () => {
    const byOrigin = await call(proxy.port, { path: '/voice', headers: { host: 'mayday.example:5173', origin: 'https://mayday.example:5173' } });
    expect(byOrigin.status).toBe(200);
    const bySite = await call(proxy.port, { path: '/voice', headers: { 'sec-fetch-site': 'same-origin' } });
    expect(bySite.status).toBe(200);
    // A tunnel that rewrites the Host header: the browser's own word is what counts.
    const tunnelled = await call(proxy.port, { path: '/voice', headers: { host: 'localhost:5173', origin: 'https://demo.ngrok.app', 'sec-fetch-site': 'same-origin' } });
    expect(tunnelled.status).toBe(200);
  });

  it('keeps the standalone mode open to a page on another localhost port', async () => {
    const r = await call(proxy.port, { path: '/voice', headers: { host: 'localhost:8788', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-site' } });
    expect(r.status).toBe(200);
  });

  it('lets a request that names no page pass this gate', async () => {
    expect((await call(proxy.port, { path: '/voice' })).status).toBe(200);
  });
});

describe('the rate limit', () => {
  let proxy: Running;
  beforeAll(async () => {
    proxy = await start({ apiKey: 'eleven-key', ratePerMinute: 3, fetchFn: upstream().fetchFn });
  });
  afterAll(() => proxy.close());

  it('answers 429 past the limit, per address', async () => {
    for (let i = 0; i < 3; i++) expect((await call(proxy.port, { path: '/voice' })).status).toBe(200);
    const over = await call(proxy.port, { path: '/voice' });
    expect(over.status).toBe(429);
    expect(JSON.parse(over.text)).toEqual({ error: 'too many requests' });
    // Behind a tunnel the socket is loopback and the client is the address the tunnel appended.
    expect((await call(proxy.port, { path: '/voice', headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' } })).status).toBe(200);
  });
});

describe('the body and prompt caps', () => {
  let proxy: Running;
  let model: Upstream;
  beforeAll(async () => {
    model = upstream(() => chatReply('ok'));
    proxy = await start({ provider: TEXT_PROVIDER, fetchFn: model.fetchFn });
  });
  afterAll(() => proxy.close());

  it('answers 413 and closes the socket on a body past the limit', async () => {
    const size = 20 * 1024; // the text routes read 16 KiB
    const received = await new Promise<string>((resolve, reject) => {
      const socket = connect(proxy.port, '127.0.0.1');
      let data = '';
      socket.on('connect', () => {
        socket.write(`POST /text/complete HTTP/1.1\r\nHost: 127.0.0.1:${proxy.port}\r\nContent-Type: application/json\r\nContent-Length: ${size}\r\n\r\n`);
        socket.write('x'.repeat(size));
      });
      socket.on('data', (c: Buffer) => {
        data += c.toString('utf8');
      });
      socket.on('error', () => {}); // the server resets the connection under the rest of the upload
      socket.on('close', () => resolve(data));
      socket.setTimeout(5000, () => reject(new Error('the socket never closed')));
    });
    expect(received).toMatch(/^HTTP\/1\.1 413 /);
    expect(received).toContain('body too large');
    expect(model.calls).toHaveLength(0);
  });

  it('answers 413 for prompts past the character caps, without asking the model', async () => {
    const post = (system: string, user: string) =>
      call(proxy.port, { method: 'POST', path: '/text/complete', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, user }) });
    expect((await post('s'.repeat(2001), 'u')).status).toBe(413);
    expect((await post('s', 'u'.repeat(4001))).status).toBe(413);
    expect(model.calls).toHaveLength(0);
    const fine = await post('s'.repeat(2000), 'u'.repeat(4000));
    expect(fine.status).toBe(200);
    expect(JSON.parse(fine.text).text).toBe('ok');
    expect(model.calls).toHaveLength(1);
  });
});

describe('the TTS route', () => {
  let proxy: Running;
  let eleven: Upstream;
  const audio = new Uint8Array([1, 2, 3]);
  beforeAll(async () => {
    eleven = upstream((url) =>
      url.endsWith('/v1/voices')
        ? new Response(JSON.stringify({ voices: [{ voice_id: 'CustomVoice42', name: 'Daniel' }] }), { status: 200 })
        : new Response(audio, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    proxy = await start({ apiKey: 'eleven-key', coachVoice: 'Daniel', fetchFn: eleven.fetchFn });
  });
  afterAll(() => proxy.close());
  afterEach(() => {
    eleven.calls.length = 0;
  });

  const tts = (path: string, body: unknown) =>
    call(proxy.port, { method: 'POST', path, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const forwarded = () => eleven.calls.filter((c) => c.url.includes('/v1/text-to-speech/'));

  it('mirrors the voice ids the app speaks with', () => {
    expect(COACH_VOICE_ID).toBe(APP_COACH_VOICE_ID);
    expect(DISPATCHER_VOICE_ID).toBe(APP_DISPATCHER_VOICE_ID);
  });

  it('rejects a voice that is not the coach, the dispatcher or the configured coach', async () => {
    const r = await tts('/v1/text-to-speech/SomeoneElse/stream?output_format=mp3_22050_32', { text: 'Push hard.' });
    expect(r.status).toBe(400);
    expect(forwarded()).toHaveLength(0);
  });

  it('rejects any sub-route but /stream, and any output_format but the app\'s', async () => {
    expect((await tts(`/v1/text-to-speech/${COACH_VOICE_ID}/with-timestamps?output_format=mp3_22050_32`, { text: 'Push hard.' })).status).toBe(400);
    expect((await tts(`/v1/text-to-speech/${COACH_VOICE_ID}?output_format=mp3_22050_32`, { text: 'Push hard.' })).status).toBe(400);
    expect((await tts(`/v1/text-to-speech/${COACH_VOICE_ID}/stream?output_format=pcm_44100`, { text: 'Push hard.' })).status).toBe(400);
    expect((await tts(`/v1/text-to-speech/${COACH_VOICE_ID}/stream?output_format=mp3_22050_32&optimize_streaming_latency=4`, { text: 'Push hard.' })).status).toBe(400);
    expect(forwarded()).toHaveLength(0);
  });

  it('rejects a missing, empty or long text', async () => {
    const path = `/v1/text-to-speech/${DISPATCHER_VOICE_ID}/stream?output_format=mp3_22050_32`;
    expect((await tts(path, { model_id: 'eleven_flash_v2_5' })).status).toBe(400);
    expect((await tts(path, { text: '' })).status).toBe(400);
    expect((await tts(path, { text: 'x'.repeat(401) })).status).toBe(400);
    expect((await call(proxy.port, { method: 'POST', path, body: 'not json' })).status).toBe(400);
    expect(forwarded()).toHaveLength(0);
  });

  it('forwards only the text and the model, with the key, and returns the audio', async () => {
    const r = await tts(`/v1/text-to-speech/${COACH_VOICE_ID}/stream?output_format=mp3_22050_32`, {
      text: 'Push hard and fast in the center of the chest.',
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0 },
      pronunciation_dictionary_locators: [],
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('audio/mpeg');
    expect([...Buffer.from(r.text, 'utf8')]).toEqual([1, 2, 3]);
    expect(forwarded()).toHaveLength(1);
    const [sent] = forwarded();
    expect(sent.url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${COACH_VOICE_ID}/stream?output_format=mp3_22050_32`);
    expect(JSON.parse(String(sent.init.body))).toEqual({ text: 'Push hard and fast in the center of the chest.', model_id: 'eleven_flash_v2_5' });
    expect((sent.init.headers as Record<string, string>)['xi-api-key']).toBe('eleven-key');
  });

  it('accepts the coach voice resolved from ELEVENLABS_COACH_VOICE', async () => {
    const r = await tts('/v1/text-to-speech/CustomVoice42/stream?output_format=mp3_22050_32', { text: 'Push hard.' });
    expect(r.status).toBe(200);
    expect(forwarded()).toHaveLength(1);
  });
});

describe('upstream failures', () => {
  it('keeps the status and hides the body on the text routes', async () => {
    const model = upstream(() => new Response('secret detail from the API', { status: 500 }));
    const proxy = await start({ provider: TEXT_PROVIDER, fetchFn: model.fetchFn });
    try {
      const r = await call(proxy.port, { method: 'POST', path: '/intent/route', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system: 's', user: 'u' }) });
      expect(r.status).toBe(500);
      expect(JSON.parse(r.text)).toEqual({ error: 'upstream failed' });
      expect(r.text).not.toContain('secret');
    } finally {
      await proxy.close();
    }
  });

  it('keeps the status and hides the body on the ElevenLabs routes', async () => {
    const eleven = upstream(() => new Response('{"detail":"secret quota message"}', { status: 401 }));
    const proxy = await start({ apiKey: 'eleven-key', agentId: 'agent-1', fetchFn: eleven.fetchFn });
    try {
      const session = await call(proxy.port, { path: '/dispatcher/session' });
      expect(session.status).toBe(401);
      expect(JSON.parse(session.text)).toEqual({ error: 'upstream failed' });
      const tts = await call(proxy.port, {
        method: 'POST',
        path: `/v1/text-to-speech/${COACH_VOICE_ID}/stream?output_format=mp3_22050_32`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Push hard.' }),
      });
      expect(tts.status).toBe(401);
      expect(tts.text).not.toContain('secret');
    } finally {
      await proxy.close();
    }
  });
});

describe('the .env reader', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mayday-env-'));
    writeFileSync(
      join(dir, '.env.local'),
      [
        '﻿export MAYDAY_TEST_QUOTED="sk_with quotes"',
        "MAYDAY_TEST_SINGLE='single quoted'",
        'MAYDAY_TEST_COMMENTED=plain # a trailing comment',
        'MAYDAY_TEST_HASH=abc#kept',
        '# MAYDAY_TEST_COMMENT_LINE=never',
        'MAYDAY_TEST_EMPTY=',
        'MAYDAY_TEST_SPACED = padded ',
        '',
      ].join('\n'),
    );
    writeFileSync(join(dir, '.env'), 'MAYDAY_TEST_QUOTED=shadowed\nMAYDAY_TEST_FALLBACK=from-dotenv\n');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads quoted, exported, commented and BOM-prefixed lines', () => {
    expect(readLocalEnv('MAYDAY_TEST_QUOTED', dir)).toBe('sk_with quotes');
    expect(readLocalEnv('MAYDAY_TEST_SINGLE', dir)).toBe('single quoted');
    expect(readLocalEnv('MAYDAY_TEST_COMMENTED', dir)).toBe('plain');
    expect(readLocalEnv('MAYDAY_TEST_HASH', dir)).toBe('abc#kept');
    expect(readLocalEnv('MAYDAY_TEST_SPACED', dir)).toBe('padded');
  });

  it('treats a commented-out or empty line as unset', () => {
    expect(readLocalEnv('MAYDAY_TEST_COMMENT_LINE', dir)).toBeNull();
    expect(readLocalEnv('MAYDAY_TEST_EMPTY', dir)).toBeNull();
    expect(readLocalEnv('MAYDAY_TEST_MISSING', dir)).toBeNull();
  });

  it('checks .env.local, then .env, and says which', () => {
    expect(findLocalEnv('MAYDAY_TEST_QUOTED', dir)).toEqual({ value: 'sk_with quotes', source: '.env.local' });
    expect(findLocalEnv('MAYDAY_TEST_FALLBACK', dir)).toEqual({ value: 'from-dotenv', source: '.env' });
    expect(findLocalEnv('MAYDAY_TEST_MISSING', dir)).toBeNull();
  });

  it('lets the environment win', () => {
    process.env.MAYDAY_TEST_QUOTED = 'from-shell';
    try {
      expect(findLocalEnv('MAYDAY_TEST_QUOTED', dir)).toEqual({ value: 'from-shell', source: 'environment' });
    } finally {
      delete process.env.MAYDAY_TEST_QUOTED;
    }
  });

  it('parses one file on its own', () => {
    expect([...parseEnv('A=1\r\nexport B="two" # c\r\nB=ignored\n').entries()]).toEqual([
      ['A', '1'],
      ['B', 'two'],
    ]);
  });
});
