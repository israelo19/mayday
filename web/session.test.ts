import { describe, expect, it } from 'vitest';
import { createFakePerception } from '../src/perception/fake';
import { createSession, ROI_FAILED_LINE, type Session } from './session';
import type { Voice, VoiceInOptions, VoiceInStatus } from '../src/voice';
import type { CoachingEvent } from '../src/types';

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
    // both keyword transitions here lead to handoff, which the standing finish button covers
    expect(s.snapshot().twins).toEqual([]);
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
    // The correction leaves the screen the moment its rule stops holding, not on a timer.
    p.setControls({ rate: 110 });
    for (let i = 0; i < 5; i++) {
      t += 100;
      p.emitAt(t);
    }
    tick(100);
    expect(s.snapshot().coaching).toBeNull();
  });

  it('says so when the camera, not a tap, moved the machine on', () => {
    const { s, v, p, tick } = rig();
    s.start();
    s.say('not breathing');
    for (let i = 0; i < 3; i++) s.advance(); // position
    expect(s.snapshot().stateKey).toBe('cardiac.position');
    p.setControls({ compressing: true });
    p.emitAt(T0 + 100);
    tick(100);
    expect(s.snapshot().stateKey).toBe('cardiac.compressions');
    expect(v.enqueued.some((e) => e.dedupeKey === 'camera-saw')).toBe(true);
    expect(s.snapshot().eyes.saw).toBe('Started compressions');
    // It is about the camera, so it is never the card's correction.
    expect(s.snapshot().coaching).toBeNull();
    expect(s.log.entries().some((e) => e.data?.type === 'fact_transition')).toBe(true);
  });

  it('reports what the camera is doing for the eyes chip', () => {
    const { s, p, tick } = rig();
    s.start();
    expect(s.snapshot().eyes.status).toBe('off');
    void p.start(null as unknown as HTMLVideoElement);
    p.emitAt(T0);
    tick(100);
    expect(s.snapshot().eyes.status).toBe('watching');
    expect(s.snapshot().eyes.rescuer).toBe(true);
    p.setControls({ cameraCovered: true });
    p.emitAt(T0 + 200);
    tick(100);
    expect(s.snapshot().eyes.status).toBe('blind');
    p.stop();
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

  it('a person lying still in triage earns a camera suggestion; yes routes, no waits', () => {
    const { s, v, p, tick, clock } = rig();
    s.start();
    p.setControls({ personDown: true });
    p.emitAt(clock.t);
    tick(100);
    const snap = s.snapshot();
    expect(snap.stateKey).toBe('triage.listening'); // nothing moved on its own
    expect(snap.suggestion).toMatchObject({ source: 'camera', label: 'Collapsed', keyword: 'collapsed' });
    expect(v.enqueued.map((e) => e.text)).toContain('It looks like someone has collapsed. Say yes, or tap.');
    s.rejectSuggestion();
    p.emitAt(clock.t);
    tick(500);
    expect(s.snapshot().suggestion).toBeNull(); // not asked again inside the retry window
    tick(30_000);
    p.emitAt(clock.t);
    tick(100);
    expect(s.snapshot().suggestion?.source).toBe('camera');
    s.confirmSuggestion();
    expect(s.snapshot().stateKey).toBe('cardiac.scene_check');
  });

  it('skips a call 911 state when the simulated call is already open', () => {
    const { s, tick } = rig();
    s.start();
    s.say('stabbed'); // bleeding.scene_safety, CALL 911 is on screen from the start
    s.call911();
    s.advance(); // bleeding.call_911, whose only job is done
    expect(s.snapshot().stateKey).toBe('bleeding.call_911');
    tick(100);
    expect(s.snapshot().stateKey).toBe('bleeding.find_wound');
    expect(s.log.entries().some((e) => e.kind === 'system' && e.detail.includes('skipped the call 911 prompt'))).toBe(true);
  });

  it('the simulated dispatcher opens on CALL 911 and advances on replies', () => {
    const { s, v } = rig();
    s.start();
    s.say('stabbed');
    s.call911();
    expect(s.snapshot().callActive).toBe(true);
    expect(s.snapshot().dispatcherLines[0]).toEqual({ who: 'dispatcher', text: '9 1 1, what is the address of your emergency?' });
    s.replyToDispatcher('We are at the library.');
    expect(v.dispatcherLines).toEqual(['We are at the library.']);
    expect(s.snapshot().dispatcherLines.map((l) => l.who)).toEqual(['dispatcher', 'you', 'dispatcher']);
    expect(s.snapshot().dispatcherStatus).toBe('scripted');
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

  it('asks before routing a sentence no keyword matched, and routes on yes', () => {
    const { s, v, tick } = rig();
    s.start();
    v.mic()!.onTranscript("he ate something and now he's silent and holding his neck");
    tick(100);
    expect(s.snapshot().suggestion?.to).toBe('choking.confirm');
    expect(v.enqueued.some((e) => e.dedupeKey === 'suggest')).toBe(true);
    expect(s.snapshot().stateKey).toBe('triage.listening');
    v.mic()!.onTranscript('yes');
    tick(100);
    expect(s.snapshot().stateKey).toBe('choking.confirm');
    expect(s.snapshot().suggestion).toBeNull();
  });

  it('drops a suggestion on no, and never suggests outside triage', () => {
    const { s, v, tick } = rig();
    s.start();
    v.mic()!.onTranscript('there is a pool of red stuff coming out of his leg and it is soaking his pants');
    tick(100);
    expect(s.snapshot().suggestion?.to).toBe('bleeding.scene_safety');
    v.mic()!.onTranscript('no');
    tick(100);
    expect(s.snapshot().suggestion).toBeNull();
    s.say('not breathing');
    v.mic()!.onTranscript('there is a pool of red stuff coming out of his leg and it is soaking his pants');
    tick(100);
    expect(s.snapshot().suggestion).toBeNull();
  });
});
