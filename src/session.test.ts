import { describe, expect, it } from 'vitest';
import { createFakePerception } from './perception/fake';
import { createSession, ROI_FAILED_LINE, type Session } from './session';
import type { Voice, VoiceInOptions, VoiceInStatus } from './voice';
import type { CoachingEvent } from './types';

const T0 = 1_700_000_000_000;

/** A voice module that records instead of speaking. */
function fakeVoice() {
  const enqueued: CoachingEvent[] = [];
  const spoken: string[] = [];
  const metronome: (number | 'stop')[] = [];
  const dispatcherLines: string[] = [];
  let listenOpts: (Omit<VoiceInOptions, 'suppress' | 'echoText'> & { onStatus?: (s: VoiceInStatus) => void }) | null = null;
  const voice = {
    out: {
      unlock: async () => {},
      enqueue: (e: CoachingEvent) => {
        enqueued.push(e);
        spoken.push(e.text);
      },
      startMetronome: (bpm: number) => metronome.push(bpm),
      stopMetronome: () => metronome.push('stop'),
      isSpeaking: () => false,
      setProvider: () => {},
      noteFacts: () => {},
      quietForMs: () => Infinity,
      recentlySpoken: () => spoken.slice(-6),
      cancelAll: () => {},
      speakInternal: () => {},
    },
    in: { available: true, start: () => {}, stop: () => {} },
    readAloud: { start: (lines: readonly string[]) => spoken.push(...lines), pause() {}, resume() {}, stop() {}, isActive: () => false, position: () => 0 },
    dispatcher: {
      connect: (onLine: (t: string) => void) => {
        onLine('9 1 1, what is the address of your emergency?');
        return {
          sayToDispatcher: (t: string) => {
            dispatcherLines.push(t);
            onLine('Okay. What happened?');
          },
          hangup: () => {},
        };
      },
    },
    stats: () => ({ all: { count: 0, p50: null, p95: null, worst: null }, byKind: {} }),
    listen: (o: Omit<VoiceInOptions, 'suppress' | 'echoText'>) => {
      listenOpts = o;
      o.onStatus?.('listening');
    },
    stopListening: () => {},
  } as unknown as Voice;
  return { voice, enqueued, metronome, dispatcherLines, mic: () => listenOpts };
}

function rig(): { s: Session; v: ReturnType<typeof fakeVoice>; p: ReturnType<typeof createFakePerception>; tick: (ms: number) => void; clock: { t: number } } {
  const clock = { t: T0 };
  const v = fakeVoice();
  const p = createFakePerception();
  let tickFn: (() => void) | null = null;
  const s = createSession({
    perception: p,
    voice: v.voice,
    now: () => clock.t,
    interval: (fn) => {
      tickFn = fn;
      return () => {
        tickFn = null;
      };
    },
    geolocate: async () => ({ lat: 39.3299, lon: -76.6205 }),
    vibrate: () => {},
  });
  const tick = (ms: number) => {
    for (let i = 0; i < ms / 100; i++) {
      clock.t += 100;
      tickFn?.();
    }
  };
  return { s, v, p, tick, clock };
}

describe('session', () => {
  it('starts in triage, listening, with one button twin per emergency', () => {
    const { s, v } = rig();
    expect(s.snapshot().phase).toBe('idle');
    s.start();
    const snap = s.snapshot();
    expect(snap.phase).toBe('triage');
    expect(snap.stateKey).toBe('triage.listening');
    expect(snap.lines[0]).toContain("Tell me what's happening");
    expect(snap.listening).toBe('listening');
    expect(snap.twins.map((t) => t.to)).toEqual(['cardiac.scene_check', 'bleeding.scene_safety', 'choking.confirm']);
    expect(v.enqueued[0].text).toContain("Tell me what's happening");
    expect(v.mic()).not.toBeNull();
  });

  it('routes a spoken keyword into the matching machine and speaks its lines', () => {
    const { s, v } = rig();
    s.start();
    v.mic()!.onKeyword('not breathing');
    const snap = s.snapshot();
    expect(snap.phase).toBe('coaching');
    expect(snap.stateKey).toBe('cardiac.scene_check');
    expect(snap.machineLabel).toBe('CPR');
    expect(v.enqueued.map((e) => e.text)).toContain("Make sure it's safe to approach.");
    expect(snap.twins[0]).toMatchObject({ to: 'check_breathing' });
  });

  it('a button twin does exactly what the keyword does, and NEXT always moves', () => {
    const { s } = rig();
    s.start();
    s.say('shot');
    expect(s.snapshot().stateKey).toBe('bleeding.scene_safety');
    s.advance();
    expect(s.snapshot().stateKey).toBe('bleeding.call_911');
    expect(s.snapshot().call911).toBe(true);
  });

  it('starts the metronome on compressions and stops it on handoff', () => {
    const { s, v } = rig();
    s.start();
    s.say('collapsed');
    s.advance(); // check_breathing
    s.advance(); // call_911
    s.advance(); // position
    s.advance(); // compressions
    expect(s.snapshot().stateKey).toBe('cardiac.compressions');
    expect(s.snapshot().metronomeBpm).toBe(110);
    expect(v.metronome).toEqual([110]);
    s.finish();
    expect(s.snapshot().phase).toBe('handoff');
    expect(v.metronome).toEqual([110, 'stop']);
  });

  it('feeds facts to the engine and surfaces the correction it triggers', () => {
    const { s, v, p, tick } = rig();
    s.start();
    s.say('not breathing');
    for (let i = 0; i < 4; i++) s.advance();
    p.setControls({ rate: 80, compressing: true });
    let t = T0;
    for (let i = 0; i < 40; i++) {
      t += 100;
      p.emitAt(t);
    }
    tick(100);
    expect(v.enqueued.some((e) => e.dedupeKey === 'rate-low')).toBe(true);
    expect(s.snapshot().coaching?.dedupeKey).toBe('rate-low');
    expect(s.snapshot().facts?.compressionRate).toBe(80);
  });

  it('tracks hands only in the bleeding pressure states and announces when they never settle', () => {
    const { s, v, p, tick } = rig();
    s.start();
    s.say('bleeding');
    s.say('safe');
    s.advance(); // find_wound
    expect(p.debug.mode()).toBe('pose');
    s.advance(); // pressure
    expect(p.debug.mode()).toBe('pose+hands');
    // the fake locks immediately; a real failure would come from perception.roi()
    p.unlockRoi();
    (p as unknown as { roi: () => { state: string } }).roi = () => ({ state: 'failed' });
    tick(200);
    expect(v.enqueued.some((e) => e.text === ROI_FAILED_LINE)).toBe(true);
    s.finish();
    expect(p.debug.mode()).toBe('pose');
  });

  it('builds a SITREP with a location and a handoff report from the log', async () => {
    const { s, tick } = rig();
    s.start();
    s.say('no pulse');
    await Promise.resolve(); // geolocation resolves
    tick(1100);
    const snap = s.snapshot();
    expect(snap.geo).toEqual({ lat: 39.3299, lon: -76.6205 });
    expect(snap.sitrep?.readAloud[0]).toContain('39.32990');
    expect(snap.sitrep?.readAloud[1]).toContain('Cardiac arrest');
    s.finish();
    expect(s.snapshot().handoff?.headline.length).toBeGreaterThan(0);
  });

  it('the simulated dispatcher opens on CALL 911 and advances on replies', () => {
    const { s, v } = rig();
    s.start();
    s.say('stabbed');
    s.call911();
    expect(s.snapshot().callActive).toBe(true);
    expect(s.snapshot().dispatcherLines[0]).toContain('9 1 1');
    s.replyToDispatcher('We are at the library.');
    expect(v.dispatcherLines).toEqual(['We are at the library.']);
    expect(s.snapshot().dispatcherLines).toHaveLength(2);
    s.hangUp();
    expect(s.snapshot().callActive).toBe(false);
  });

  it('restart wipes the log and returns to triage', () => {
    const { s } = rig();
    s.start();
    s.say('choking');
    expect(s.snapshot().stateKey).toBe('choking.confirm');
    s.restart();
    expect(s.snapshot().stateKey).toBe('triage.listening');
    // the triage prompt itself says 'choking'; what must be gone is the choking machine's entry
    expect(s.log.entries().some((e) => e.data?.type === 'state_enter' && e.data.machineId === 'choking')).toBe(false);
  });
});
