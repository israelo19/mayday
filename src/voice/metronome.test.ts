// The beat must stop when told, must not burst after a throttled interval, and must pause
// while the page is hidden. Runs against a fake AudioContext on a fake clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metronome } from './metronome';

type Started = { at: number; freq: number };

class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  readonly destination = {};
  readonly started: Started[] = [];
  async resume(): Promise<void> {
    this.state = 'running';
  }
  createGain() {
    const node = {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: () => node,
    };
    return node;
  }
  createOscillator() {
    const started = this.started;
    const osc = {
      type: 'sine',
      frequency: { value: 0, setValueAtTime() {} },
      connect: () => ({ connect: () => ({}) }),
      start(at: number) {
        started.push({ at, freq: osc.frequency.value });
      },
      stop() {},
    };
    return osc;
  }
}

let ctx: FakeAudioContext;
let visibility: 'visible' | 'hidden';
const listeners = new Map<string, Set<() => void>>();

function fireVisibility(v: 'visible' | 'hidden'): void {
  visibility = v;
  for (const cb of listeners.get('visibilitychange') ?? []) cb();
}

/** Advance the fake wall clock and the audio clock together, like a foreground tab. */
function run(ms: number): void {
  const step = 25;
  for (let t = 0; t < ms; t += step) {
    ctx.currentTime += step / 1000;
    vi.advanceTimersByTime(step);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  ctx = new FakeAudioContext();
  visibility = 'visible';
  listeners.clear();
  const win = {
    AudioContext: function () {
      return ctx;
    },
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: number) => clearInterval(id),
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('AudioContext', win.AudioContext);
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (name: string, cb: () => void) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(cb));
    },
    removeEventListener: (name: string, cb: () => void) => {
      listeners.get(name)?.delete(cb);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Metronome', () => {
  it('ticks at the bpm while running and schedules nothing after stop()', () => {
    const m = new Metronome();
    m.start(120);
    run(2000);
    // 120/min is one tick every 500 ms; two seconds plus the 200 ms lookahead.
    expect(ctx.started.length).toBeGreaterThanOrEqual(4);
    expect(ctx.started.length).toBeLessThanOrEqual(5);
    const before = ctx.started.length;
    m.stop();
    run(5000);
    expect(ctx.started.length).toBe(before);
    expect(m.isRunning()).toBe(false);
  });

  it('does not fire a burst of missed beats when the interval was throttled', () => {
    const m = new Metronome();
    m.start(120);
    run(500);
    const before = ctx.started.length;
    // A background tab fires the interval once a second or less; the audio clock keeps going.
    ctx.currentTime += 5;
    vi.advanceTimersByTime(25);
    const scheduled = ctx.started.slice(before);
    // At most what fits in the lookahead window from now, and never in the past.
    expect(scheduled.length).toBeLessThanOrEqual(1);
    for (const s of scheduled) expect(s.at).toBeGreaterThanOrEqual(ctx.currentTime);
  });

  it('pauses while the page is hidden and resumes when it is visible again', () => {
    const m = new Metronome();
    m.start(120);
    run(1000);
    fireVisibility('hidden');
    const before = ctx.started.length;
    run(3000);
    expect(ctx.started.length).toBe(before);
    fireVisibility('visible');
    run(1000);
    expect(ctx.started.length).toBeGreaterThan(before);
    expect(m.isRunning()).toBe(true);
  });

  it('stays stopped if stop() arrives while hidden', () => {
    const m = new Metronome();
    m.start(110);
    run(500);
    fireVisibility('hidden');
    m.stop();
    fireVisibility('visible');
    const before = ctx.started.length;
    run(2000);
    expect(ctx.started.length).toBe(before);
    expect(m.isRunning()).toBe(false);
  });
});
