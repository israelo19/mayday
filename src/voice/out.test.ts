// The queue rules from docs/04, asserted rather than remembered. Everything runs in plain
// node: the provider is a fake and the clock is a variable, so these tests cover ordering,
// preemption, coalescing, cooldown and staleness without a browser or a real timer.
import { describe, expect, it } from 'vitest';
import type { CoachingEvent } from '../types';
import {
  createVoiceOut,
  DEFAULT_COOLDOWN_MS,
  type SpeakerProvider,
  type SpeakOptions,
  type VoiceOutFull,
} from './out';

/** Speaks instantly, finishes only when the test says so. */
class FakeSpeaker implements SpeakerProvider {
  readonly name = 'fake';
  spoken: { text: string; insistence: number }[] = [];
  private active: (() => void) | null = null;

  speak(text: string, opts?: SpeakOptions): Promise<void> {
    this.spoken.push({ text, insistence: opts?.insistence ?? 0 });
    opts?.onStart?.();
    return new Promise((resolve) => {
      this.active = resolve;
    });
  }

  cancel(): void {
    const done = this.active;
    this.active = null;
    done?.();
  }

  /** Test control: the current utterance reaches its natural end. */
  finish(): void {
    const done = this.active;
    this.active = null;
    done?.();
  }

  texts(): string[] {
    return this.spoken.map((s) => s.text);
  }
}

/** Let the queue's promise continuations run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const ev = (priority: CoachingEvent['priority'], text: string, extra?: Partial<CoachingEvent>): CoachingEvent => ({
  priority,
  text,
  stateId: 's1',
  ...extra,
});

function setup(over?: { onSpoken?: (e: CoachingEvent, latencyMs: number | null) => void }) {
  const speaker = new FakeSpeaker();
  let t = 0;
  const earcons: number[] = [];
  const voice: VoiceOutFull = createVoiceOut({
    provider: speaker,
    now: () => t,
    metronome: { start: () => {}, stop: () => {}, earcon: () => earcons.push(t) },
    onSpoken: over?.onSpoken,
  });
  return { speaker, voice, earcons, tick: (ms: number) => (t += ms) };
}

describe('the speaker queue', () => {
  it('preempts non-critical speech with a critical line, then replays the chopped narration', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('narration', 'Kneel beside his chest.'));
    voice.enqueue(ev('correction', 'A little slower.', { dedupeKey: 'rate-high' }));
    voice.enqueue(ev('critical', 'Don’t stop. Keep pushing.'));
    await flush();
    // The narration was cut mid-word for the critical line...
    expect(speaker.texts()).toEqual(['Kneel beside his chest.', 'Don’t stop. Keep pushing.']);
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    // ...then the correction played, then the instruction replayed in full.
    expect(speaker.texts()).toEqual([
      'Kneel beside his chest.',
      'Don’t stop. Keep pushing.',
      'A little slower.',
      'Kneel beside his chest.',
    ]);
  });

  it('never chops one critical line with another', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('critical', 'first'));
    voice.enqueue(ev('critical', 'second'));
    await flush();
    expect(speaker.texts()).toEqual(['first']); // second waits, first is never cancelled
    speaker.finish();
    await flush();
    expect(speaker.texts()).toEqual(['first', 'second']);
  });

  it('coalesces queued corrections by dedupeKey, keeping the position of the first', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('critical', 'hold the queue'));
    voice.enqueue(ev('correction', 'rate low v1', { dedupeKey: 'rate-low' }));
    voice.enqueue(ev('correction', 'recoil', { dedupeKey: 'recoil' }));
    voice.enqueue(ev('correction', 'rate low v2', { dedupeKey: 'rate-low' }));
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    // v1 never played; v2 took its slot AHEAD of the recoil line.
    expect(speaker.texts()).toEqual(['hold the queue', 'rate low v2', 'recoil']);
  });

  it('makes the same dedupeKey audible at most once per cooldown window', async () => {
    const { speaker, voice, tick } = setup();
    voice.enqueue(ev('correction', 'faster', { dedupeKey: 'rate-low' }));
    speaker.finish();
    await flush();
    tick(DEFAULT_COOLDOWN_MS - 1);
    voice.enqueue(ev('correction', 'faster', { dedupeKey: 'rate-low' }));
    await flush();
    expect(speaker.texts()).toEqual(['faster']); // inside the window: dropped
    tick(2);
    voice.enqueue(ev('correction', 'faster', { dedupeKey: 'rate-low' }));
    await flush();
    expect(speaker.texts()).toEqual(['faster', 'faster']); // window passed: audible again
  });

  it('re-checks cooldown when a queued line is about to play, not only when it was queued', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('narration', 'instruction'));
    // Queued while its key had never been audible...
    voice.enqueue(ev('correction', 'correction k', { dedupeKey: 'k' }));
    // ...then the same key plays as a critical before the correction's turn comes.
    voice.enqueue(ev('critical', 'critical k', { dedupeKey: 'k' }));
    await flush();
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    // The queued correction was silently dropped: its key was just audible.
    expect(speaker.texts()).toEqual(['instruction', 'critical k', 'instruction']);
  });

  it('holds narration until idle instead of dropping it', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('critical', 'urgent'));
    voice.enqueue(ev('narration', 'put the heel of one hand on the center of his chest'));
    await flush();
    expect(speaker.texts()).toEqual(['urgent']);
    speaker.finish();
    await flush();
    expect(speaker.texts()).toEqual(['urgent', 'put the heel of one hand on the center of his chest']);
  });

  it('drops queued narration once the protocol has left its state', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('critical', 'hold', { stateId: 'position' }));
    voice.enqueue(ev('narration', 'lock your elbows', { stateId: 'position' }));
    voice.enqueue(ev('narration', 'push hard and fast', { stateId: 'compressions' }));
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    // The 'position' line would be wrong out loud now; only the current state's line plays.
    expect(speaker.texts()).toEqual(['hold', 'push hard and fast']);
  });

  it('exempts voice-internal lines (read-aloud, dispatcher) from staleness', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('critical', 'hold', { stateId: 'compressions' }));
    voice.enqueue(ev('narration', 'say this to the dispatcher', { stateId: 'voice:readaloud' }));
    voice.enqueue(ev('narration', 'next state line', { stateId: 'handoff' }));
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    // The read-aloud line survives the state change and does not count as a state itself.
    expect(speaker.texts()).toEqual(['hold', 'say this to the dispatcher', 'next state line']);
  });

  it('raises insistence, not wording, when the same correction repeats', async () => {
    const { speaker, voice, tick } = setup();
    for (let i = 0; i < 3; i++) {
      voice.enqueue(ev('correction', 'faster', { dedupeKey: 'rate-low' }));
      speaker.finish();
      await flush();
      tick(DEFAULT_COOLDOWN_MS + 1000);
    }
    expect(speaker.spoken.map((s) => s.insistence)).toEqual([0, 1, 2]);
    expect(new Set(speaker.texts())).toEqual(new Set(['faster'])); // the words never changed
  });

  it('sounds the earcon before critical lines only', async () => {
    const { speaker, voice, earcons } = setup();
    voice.enqueue(ev('correction', 'gentle', { dedupeKey: 'a' }));
    speaker.finish();
    await flush();
    voice.enqueue(ev('critical', 'urgent'));
    await flush();
    expect(earcons.length).toBe(1);
  });

  it('measures fact-to-audible latency from the newest fact', async () => {
    const seen: (number | null)[] = [];
    const { voice, tick } = setup({ onSpoken: (_e, ms) => seen.push(ms) });
    voice.noteFacts({ t: 100 });
    tick(450);
    voice.enqueue(ev('critical', 'faster'));
    await flush();
    expect(seen).toEqual([350]);
  });

  it('cancelAll silences everything and the queue keeps working after', async () => {
    const { speaker, voice } = setup();
    voice.enqueue(ev('narration', 'one'));
    voice.enqueue(ev('narration', 'two'));
    voice.cancelAll();
    await flush();
    expect(voice.isSpeaking()).toBe(false);
    voice.enqueue(ev('narration', 'three'));
    await flush();
    expect(speaker.texts()).toEqual(['one', 'three']); // 'two' died queued, 'one' died mid-word
  });

  it('reports quiet time for the echo gate', async () => {
    const { speaker, voice, tick } = setup();
    expect(voice.quietForMs()).toBe(Number.POSITIVE_INFINITY);
    voice.enqueue(ev('narration', 'line'));
    await flush();
    expect(voice.quietForMs()).toBe(0);
    speaker.finish();
    await flush();
    tick(500);
    expect(voice.quietForMs()).toBe(500);
    expect(voice.recentlySpoken()).toEqual(['line']);
  });
});
