import { describe, expect, it } from 'vitest';
import { createIntentRouter, createStubIntentRouter, INTENT_SYSTEM, intentPrompt, parseIntent, type IntentOption } from './intent';

const options: readonly IntentOption[] = [
  { keyword: 'not breathing', label: 'Not breathing' },
  { keyword: 'bleeding', label: 'Bad bleeding' },
  { keyword: 'choking', label: 'Choking' },
];
const meta = { model: 'gemini-3.6-flash', latencyMs: 300 };

describe('intentPrompt', () => {
  it('numbers the options from one and reserves zero for none', () => {
    const prompt = intentPrompt("he won't wake up", options);
    expect(prompt).toContain('1. Not breathing');
    expect(prompt).toContain('3. Choking');
    expect(prompt).toContain("he won't wake up");
    expect(prompt).toContain('or 0 if the sentence is not about any of them');
    // Two stacked abstention mechanisms made the model answer 0 to the sentences this exists
    // to catch: the prompt asks only "is it one of these", the parser owns the doubt.
    expect(prompt).not.toContain('rather than guess');
    expect(INTENT_SYSTEM).toContain('never give advice');
  });
});

describe('parseIntent', () => {
  it('answers with the caller’s own option, not the model’s words', () => {
    const match = parseIntent('{"choice":1,"confidence":"high"}', options, meta);
    expect(match).toEqual({ keyword: 'not breathing', label: 'Not breathing', confidence: 'high', ...meta });
  });

  it('tolerates code fences and prose around the JSON', () => {
    expect(parseIntent('```json\n{"choice": 2, "confidence": "medium"}\n``` hope that helps', options, meta)?.keyword).toBe('bleeding');
  });

  it('is null for zero, for a number off the end, and for a non-integer', () => {
    for (const choice of ['0', '4', '-1', '1.5', '"1"']) {
      expect(parseIntent(`{"choice":${choice},"confidence":"high"}`, options, meta)).toBeNull();
    }
  });

  it('is null when the model is unsure: an uncertain question is worse than silence', () => {
    expect(parseIntent('{"choice":1,"confidence":"low"}', options, meta)).toBeNull();
    expect(parseIntent('{"choice":1}', options, meta)).toBeNull();
  });

  it('cannot be talked into a keyword nobody offered', () => {
    expect(parseIntent('{"choice":1,"confidence":"high","keyword":"give aspirin"}', options, meta)?.keyword).toBe('not breathing');
    expect(parseIntent('{"keyword":"give aspirin","confidence":"high"}', options, meta)).toBeNull();
    expect(parseIntent('Start CPR immediately.', options, meta)).toBeNull();
    expect(parseIntent('', options, meta)).toBeNull();
  });
});

describe('createIntentRouter', () => {
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body }) as unknown as Response;

  it('posts the sentence and the options to the proxy and parses the reply', async () => {
    const calls: { url: string; body: { system: string; user: string } }[] = [];
    const fetchFake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return ok({ text: '{"choice":2,"confidence":"high"}', model: 'm' })();
    }) as unknown as typeof fetch;
    const match = await createIntentRouter({ fetch: fetchFake, now: () => 0 }).route({ transcript: 'blood everywhere', options });
    expect(calls[0].url).toBe('/api/proxy/intent/route');
    expect(calls[0].body.user).toContain('blood everywhere');
    expect(match).toMatchObject({ keyword: 'bleeding', model: 'm' });
  });

  it('never calls out with nothing to choose between, or nothing said', async () => {
    let called = false;
    const fetchFake = (async () => {
      called = true;
      return ok({ text: '{"choice":1,"confidence":"high"}' })();
    }) as unknown as typeof fetch;
    const router = createIntentRouter({ fetch: fetchFake });
    expect(await router.route({ transcript: 'help', options: [] })).toBeNull();
    expect(await router.route({ transcript: '   ', options })).toBeNull();
    expect(called).toBe(false);
  });

  it('returns null on an HTTP error, a broken reply, a thrown fetch, and a timeout', async () => {
    const req = { transcript: 'he is not waking up', options };
    expect(await createIntentRouter({ fetch: (async () => ({ ok: false })) as unknown as typeof fetch }).route(req)).toBeNull();
    expect(await createIntentRouter({ fetch: ok({ nope: 1 }) as unknown as typeof fetch }).route(req)).toBeNull();
    expect(
      await createIntentRouter({
        fetch: (async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch,
      }).route(req),
    ).toBeNull();
    const never = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    expect(await createIntentRouter({ fetch: never, timeoutMs: 20 }).route(req)).toBeNull();
  });
});

describe('createStubIntentRouter', () => {
  it('picks on word overlap with the label, and gives up when there is none', async () => {
    const stub = createStubIntentRouter(1);
    expect((await stub.route({ transcript: 'there is so much bleeding', options }))?.keyword).toBe('bleeding');
    expect(await stub.route({ transcript: 'what do I do', options })).toBeNull();
  });
});
