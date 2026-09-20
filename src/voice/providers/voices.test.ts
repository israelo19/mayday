// The coach voice is configured next to the key, never in the app: the browser asks the proxy
// once, and anything short of a clean answer (unset, unmatched, proxy down, slow) keeps Brian.
import { describe, expect, it } from 'vitest';
import { DEFAULT_COACH_VOICE, fetchCoachVoice } from './voices';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('fetchCoachVoice', () => {
  it('asks the proxy for /voice and returns the configured coach', async () => {
    const calls: string[] = [];
    const fetchFn = ((url: RequestInfo | URL) => {
      calls.push(String(url));
      return json({ coach: { voiceId: 'abc123', voiceName: 'Daniel' } });
    }) as typeof fetch;
    const voice = await fetchCoachVoice({ baseUrl: 'https://proxy.test', fetchFn });
    expect(calls).toEqual(['https://proxy.test/voice']);
    expect(voice).toEqual({ voiceId: 'abc123', voiceName: 'Daniel' });
  });

  it('returns null when nothing is configured, so the default stays', async () => {
    const fetchFn = (() => json({ coach: null })) as typeof fetch;
    expect(await fetchCoachVoice({ fetchFn })).toBeNull();
    expect(DEFAULT_COACH_VOICE.voiceName).toBe('Brian');
  });

  it('returns null on a refused, malformed, or dead proxy', async () => {
    expect(await fetchCoachVoice({ fetchFn: (() => json({ error: 'no' }, 404)) as typeof fetch })).toBeNull();
    expect(await fetchCoachVoice({ fetchFn: (() => json({ coach: { voiceId: '', voiceName: 'x' } })) as typeof fetch })).toBeNull();
    expect(await fetchCoachVoice({ fetchFn: (() => Promise.reject(new TypeError('offline'))) as typeof fetch })).toBeNull();
    const hang = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    expect(await fetchCoachVoice({ fetchFn: hang, timeoutMs: 20 })).toBeNull();
  });
});
