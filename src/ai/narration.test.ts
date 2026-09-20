// The rewording contract (src/ai/narration.ts): the model sees one line, a little context and
// a budget, and whatever comes back is one cleaned line or null. The validator (tested in
// tests/validate.test.ts) and the session (web/session.test.ts) decide whether it is spoken.
import { describe, expect, it } from 'vitest';
import { cleanFlavor, flavorPrompt, ModelNarrationFlavor, type FlavorContext } from './narration';

const ctx: FlavorContext = {
  situation: 'CPR',
  step: 'compressions',
  heard: 'my arms are giving out',
  observations: ['pushing at about 80 a minute'],
  numbers: [80],
  repeat: 1,
  maxChars: 84,
};

function fakeFetch(replies: Array<{ status: number; text?: string }>): { fetch: typeof fetch; bodies: string[] } {
  const bodies: string[] = [];
  let call = 0;
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    const r = replies[Math.min(call++, replies.length - 1)];
    return { ok: r.status === 200, status: r.status, json: async () => ({ text: r.text ?? '' }) } as Response;
  }) as typeof fetch;
  return { fetch: impl, bodies };
}

describe('flavorPrompt', () => {
  it('puts the line, what was said, what was measured and the budget in front of the model', () => {
    const p = flavorPrompt('Faster. Push with the beat.', ctx);
    expect(p).toContain('Line: "Faster. Push with the beat."');
    expect(p).toContain('Situation: CPR, step compressions.');
    expect(p).toContain('They just said: "my arms are giving out"');
    expect(p).toContain('Measured: pushing at about 80 a minute.');
    expect(p).toContain('said 1 time already');
    expect(p).toContain('At most 84 characters.');
  });

  it('says so when there is nothing to acknowledge', () => {
    const p = flavorPrompt('Kneel beside his chest.', { ...ctx, heard: null, observations: [], numbers: [], repeat: 0 });
    expect(p).toContain('They have not said anything recently.');
    expect(p).toContain('Nothing measured.');
    expect(p).not.toContain('fresh way');
  });
});

describe('cleanFlavor', () => {
  it('strips quotes and keeps the first line only', () => {
    expect(cleanFlavor('  "Faster. Push with the beat."\n\nHope that helps!')).toBe('Faster. Push with the beat.');
    expect(cleanFlavor('""')).toBeNull();
    expect(cleanFlavor('   ')).toBeNull();
  });
});

describe('ModelNarrationFlavor', () => {
  it('sends the rules and the prompt, and returns the cleaned rewording', async () => {
    const { fetch, bodies } = fakeFetch([{ status: 200, text: '"You are at 80. Faster. Push with the beat."' }]);
    const f = new ModelNarrationFlavor({ fetch });
    expect(await f.flavor('Faster. Push with the beat.', ctx)).toBe('You are at 80. Faster. Push with the beat.');
    const body = JSON.parse(bodies[0]) as { system: string; user: string; maxTokens: number };
    expect(body.system).toContain('Keep every instruction and every number');
    expect(body.system).toContain('Use no number except');
    expect(body.user).toContain('Line: "Faster. Push with the beat."');
    expect(body.maxTokens).toBeLessThanOrEqual(120);
  });

  it('latches off after a 404: no key behind the proxy means stop asking', async () => {
    const { fetch, bodies } = fakeFetch([{ status: 404 }]);
    const f = new ModelNarrationFlavor({ fetch });
    expect(await f.flavor('Faster. Push with the beat.', ctx)).toBeNull();
    expect(await f.flavor('Faster. Push with the beat.', ctx)).toBeNull();
    expect(bodies.length).toBe(1);
  });

  it('answers null on a timeout or an empty reply', async () => {
    const never = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    expect(await new ModelNarrationFlavor({ fetch: never, timeoutMs: 5 }).flavor('Faster. Push with the beat.', ctx)).toBeNull();
    expect(await new ModelNarrationFlavor({ fetch: fakeFetch([{ status: 200, text: '' }]).fetch }).flavor('Faster.', ctx)).toBeNull();
  });
});
