// The 800 ms promise in test form: no audio in budget means the fallback speaks THAT line,
// repeated misses stop the session from trying, a cache hit never refetches, and cancel
// aborts the wire. fetch and the audio sink are fakes, so it all runs in node.
import { describe, expect, it } from 'vitest';
import type { SpeakerProvider, SpeakOptions } from '../out';
import { ElevenLabsProvider, type AudioPlayer } from './elevenlabs';

class FakeFallback implements SpeakerProvider {
  readonly name = 'fallback';
  spoken: string[] = [];
  cancelled = 0;
  speak(text: string, opts?: SpeakOptions): Promise<void> {
    this.spoken.push(text);
    opts?.onStart?.();
    return Promise.resolve();
  }
  cancel(): void {
    this.cancelled++;
  }
}

/** Decodes instantly, remembers what it played; autoFinish=false keeps audio "playing". */
function fakePlayer(autoFinish = true) {
  const played: { rate: number }[] = [];
  let stops = 0;
  let finish: (() => void) | null = null;
  const player: AudioPlayer = {
    decode: (bytes) => Promise.resolve({ bytes }),
    play(_decoded, o) {
      played.push({ rate: o.rate });
      o.onStart();
      if (autoFinish) return { done: Promise.resolve(), stop: () => stops++ };
      const done = new Promise<void>((resolve) => (finish = resolve));
      return {
        done,
        stop: () => {
          stops++;
          finish?.();
        },
      };
    },
  };
  return { player, played, stops: () => stops };
}

type FetchScript = (url: string, init?: RequestInit) => Promise<Response> | 'hang';

function fakeFetch(script: FetchScript) {
  const calls: string[] = [];
  const aborted: boolean[] = [];
  const fetchFn = ((url: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(url));
    const result = script(String(url), init);
    if (result !== 'hang') return result;
    // Never responds; resolves only through the abort signal, like a dead conference wifi.
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted.push(true);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  }) as typeof fetch;
  return { fetchFn, calls, aborted };
}

const okAudio = () =>
  Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

function build(
  script: FetchScript,
  extra?: { timeoutMs?: number; dispatcherVoiceId?: string; autoFinish?: boolean },
) {
  const fallback = new FakeFallback();
  const { player, played, stops } = fakePlayer(extra?.autoFinish ?? true);
  const { fetchFn, calls, aborted } = fakeFetch(script);
  const provider = new ElevenLabsProvider({
    voiceId: 'coachvoice',
    dispatcherVoiceId: extra?.dispatcherVoiceId,
    baseUrl: 'https://proxy.test',
    fallback,
    fetchFn,
    player,
    firstAudioTimeoutMs: extra?.timeoutMs ?? 30,
  });
  return { provider, fallback, played, stops, calls, aborted };
}

describe('ElevenLabsProvider', () => {
  it('plays synthesized audio and reports the start', async () => {
    const { provider, played, fallback } = build(okAudio);
    let started = false;
    await provider.speak('Push hard and fast.', { onStart: () => (started = true) });
    expect(started).toBe(true);
    expect(played.length).toBe(1);
    expect(fallback.spoken).toEqual([]);
  });

  it('asks the proxy, not ElevenLabs, and never carries a key', async () => {
    const { provider, calls } = build(okAudio);
    await provider.speak('line');
    expect(calls[0]).toBe(
      'https://proxy.test/v1/text-to-speech/coachvoice/stream?output_format=mp3_22050_32',
    );
  });

  it('falls back within the budget when the wire hangs, and aborts the request', async () => {
    const { provider, fallback, aborted } = build(() => 'hang');
    await provider.speak('Faster. Push with the beat.');
    expect(fallback.spoken).toEqual(['Faster. Push with the beat.']);
    expect(aborted).toEqual([true]);
  });

  it('serves a repeated line from cache: one synthesis, many plays, works offline', async () => {
    let goOffline = false;
    const { provider, played, calls, fallback } = build(() => (goOffline ? 'hang' : okAudio()));
    await provider.speak('Faster.');
    goOffline = true; // wifi pulled mid-demo
    await provider.speak('Faster.');
    await provider.speak('Faster.');
    expect(calls.length).toBe(1);
    expect(played.length).toBe(3);
    expect(fallback.spoken).toEqual([]); // the cached voice kept working with no network
  });

  it('stops trying after consecutive misses and recovers after a successful warm', async () => {
    let dead = true;
    const { provider, fallback, calls } = build(() => (dead ? 'hang' : okAudio()));
    await provider.speak('one');
    await provider.speak('two');
    await provider.speak('three');
    expect(provider.healthy()).toBe(false);
    await provider.speak('four'); // straight to fallback, no fetch spent
    expect(calls.length).toBe(3);
    expect(fallback.spoken).toEqual(['one', 'two', 'three', 'four']);
    dead = false;
    expect(await provider.warm(['five'])).toBe(1);
    expect(provider.healthy()).toBe(true);
    await provider.speak('five'); // cached by the warm
    expect(calls.length).toBe(4);
  });

  it('warm() caches the canonical lines once each', async () => {
    const { provider, calls } = build(okAudio);
    expect(await provider.warm(['a', 'b', 'a'])).toBe(3);
    expect(calls.length).toBe(2); // 'a' synthesized once
    expect(provider.cachedLineCount()).toBe(2);
  });

  it('routes dispatcher lines to the second voice, or to the fallback without one', async () => {
    const withVoice = build(okAudio, { dispatcherVoiceId: 'dispatchvoice' });
    await withVoice.provider.speak('9 1 1, what is your emergency?', { voice: 'dispatcher' });
    expect(withVoice.calls[0]).toContain('/text-to-speech/dispatchvoice/');

    const withoutVoice = build(okAudio);
    await withoutVoice.provider.speak('9 1 1, what is your emergency?', { voice: 'dispatcher' });
    expect(withoutVoice.calls.length).toBe(0);
    expect(withoutVoice.fallback.spoken).toEqual(['9 1 1, what is your emergency?']);
  });

  it('cancel stops mid-playback audio and cancels the fallback with the same semantics', async () => {
    const { provider, fallback, stops, played } = build(okAudio, { autoFinish: false });
    const speaking = provider.speak('line'); // resolves only when playback ends
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(played.length).toBe(1); // audio is out and still playing
    provider.cancel();
    await speaking; // cancel ends it; the promise settles instead of hanging the queue
    expect(stops()).toBe(1);
    expect(fallback.cancelled).toBe(1);
  });
});
