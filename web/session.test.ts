import { describe, expect, it } from 'vitest';
import { createFakePerception } from '../src/perception/fake';
import { GUIDANCE } from '../src/perception';
import { confirmLine, TRIAGE_ROUTES } from '../src/protocol';
import { canonicalLines, CAMERA_SAW_LINE, createSession, HEARD_UNMATCHED_LINE, ROI_FAILED_LINE, type DispatcherFactory, type Session, type SessionDeps } from './session';
import type { Voice, VoiceInOptions, VoiceInStatus } from '../src/voice';
import type { CoachingEvent } from '../src/types';
import type { IntentRequest, IntentRouter } from '../src/ai/intent';
import type { FlavorContext, NarrationFlavor } from '../src/ai/narration';

const T0 = 1_700_000_000_000;

/** A voice module that records instead of speaking. */
function fakeVoice() {
  const enqueued: CoachingEvent[] = [];
  const spoken: string[] = [];
  const metronome: (number | 'stop')[] = [];
  const dispatcherLines: string[] = [];
  const external: string[] = [];
  const order: string[] = [];
  let readAloudStops = 0;
  let listenOpts: (Omit<VoiceInOptions, 'suppress' | 'echoText'> & { onStatus?: (s: VoiceInStatus) => void }) | null = null;
  const voice = {
    out: {
      unlock: async () => {
        order.push('unlock');
      },
      enqueue: (e: CoachingEvent) => {
        order.push('speak');
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
      noteExternalSpeech: (text: string) => external.push(text),
      cancelAll: () => {},
      speakInternal: () => {},
    },
    in: { available: true, start: () => {}, stop: () => {} },
    readAloud: {
      start: (lines: readonly string[]) => spoken.push(...lines),
      pause() {},
      resume() {},
      stop() {
        readAloudStops++;
      },
      isActive: () => false,
      position: () => 0,
    },
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
      order.push('listen');
      listenOpts = o;
      o.onStatus?.('listening');
    },
    stopListening: () => {},
  } as unknown as Voice;
  return { voice, enqueued, metronome, dispatcherLines, external, order, mic: () => listenOpts, readAloudStops: () => readAloudStops };
}

function rig(extra: Partial<SessionDeps> = {}): { s: Session; v: ReturnType<typeof fakeVoice>; p: ReturnType<typeof createFakePerception>; tick: (ms: number) => void; clock: { t: number } } {
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
    ...extra,
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
    // Mic permission has to start inside this tap, before we talk: iOS drops SpeechRecognition
    // that races speechSynthesis, and the prompt then waits until the next card is tapped.
    expect(v.order.indexOf('listen')).toBeGreaterThanOrEqual(0);
    expect(v.order.indexOf('listen')).toBeLessThan(v.order.indexOf('speak'));
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

  it('shows what the mic is hearing before the sentence is done, without logging it', () => {
    const { s, v } = rig();
    s.start();
    v.mic()?.onInterim?.('my dad fell');
    expect(s.snapshot().lastHeard).toBe('my dad fell');
    expect(s.log.entries().some((e) => e.kind === 'user' && e.detail === 'my dad fell')).toBe(false);
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
    const saw = v.enqueued.find((e) => e.dedupeKey === 'camera-saw');
    expect(saw).toBeDefined();
    // Narration, not correction: correction would jump the remaining "Push hard and fast" line.
    expect(saw?.priority).toBe('narration');
    expect(s.snapshot().eyes.saw).toBe('Started compressions');
    // It is about the camera, so it is never the card's correction.
    expect(s.snapshot().coaching).toBeNull();
    expect(s.log.entries().some((e) => e.data?.type === 'fact_transition')).toBe(true);
  });

  it('reports what the camera is doing for the eyes chip', () => {
    const { s, p, tick } = rig();
    s.start();
    // The camera is about to start (CameraView mounts on this same tap). 'off' is a refused
    // or stopped camera; idle-before-start is 'starting' so triage does not flash the question.
    expect(s.snapshot().eyes.status).toBe('starting');
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
    expect(s.snapshot().coaching?.dedupeKey).not.toBe('roi-failed');
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

  it("tells the voice queue about a live call-taker's lines, and not the scripted one's", () => {
    // The agent plays its own audio, outside the queue, so the echo gates never saw it and
    // "yes, help is on the way" could answer a yes/no question the coach had asked.
    const live: DispatcherFactory = (_scripted, hooks) => ({
      status: 'connecting',
      dispatcher: {
        connect(onLine) {
          hooks.onStatus('live');
          onLine('9 1 1, where are you?');
          return {
            sayToDispatcher: () => onLine('Yes, help is on the way. Keep going.'),
            hangup: () => {},
          };
        },
      },
    });
    const { s, v } = rig({ dispatcher: live });
    s.start();
    s.say('not breathing');
    s.call911();
    s.replyToDispatcher('We are at the library.');
    expect(v.external).toEqual(['9 1 1, where are you?', 'Yes, help is on the way. Keep going.']);
    expect(s.snapshot().dispatcherStatus).toBe('live');

    const scripted = rig();
    scripted.s.start();
    scripted.s.call911();
    scripted.s.replyToDispatcher('We are at the library.');
    expect(scripted.v.external).toEqual([]); // the script speaks through the queue already
  });

  it('logs why the call changed hands, from the dispatcher factory, as a system line', () => {
    const noting: DispatcherFactory = (scripted, hooks) => ({
      status: 'connecting',
      dispatcher: {
        connect(onLine) {
          hooks.onStatus('fallback');
          hooks.onNote('agent line refused (read like coaching), scripted dispatcher took over');
          return scripted.connect(onLine);
        },
      },
    });
    const { s } = rig({ dispatcher: noting });
    s.start();
    s.call911();
    expect(s.log.entries().some((e) => e.kind === 'system' && e.detail === 'simulated dispatcher: agent line refused (read like coaching), scripted dispatcher took over')).toBe(true);
  });

  it('logs a recognizer error once while it repeats, not once per restart', () => {
    // Offline Chrome answers every restart with 'network', about one every four seconds.
    const { s, v } = rig();
    s.start();
    v.mic()!.onError?.('network');
    v.mic()!.onError?.('network');
    v.mic()!.onError?.('network');
    const errors = s.log.entries().filter((e) => e.detail === 'speech recognition error: network');
    expect(errors).toHaveLength(1);
    v.mic()!.onError?.('no-speech');
    v.mic()!.onError?.('network'); // a different line in between makes it news again
    expect(s.log.entries().filter((e) => e.detail === 'speech recognition error: network')).toHaveLength(2);
    expect(s.snapshot().listenError).toBe('network');
  });

  it('stop() ends a read-aloud in progress', () => {
    const { s, v, tick } = rig();
    s.start();
    s.say('no pulse');
    tick(1100);
    s.readSitrepAloud();
    s.stop();
    expect(v.readAloudStops()).toBe(1);
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

// ---------------------------------------------------------------------------
// The intent router (docs/04 item 8): a sentence the matcher and the phrase cues both missed,
// mapped to a move the state already offers. Still a question, never a route.
// ---------------------------------------------------------------------------

/** A router that answers with whichever option the test names, and records what it was given. */
function fakeRouter(pick: (labels: string[]) => number | null) {
  const asked: IntentRequest[] = [];
  const router: IntentRouter = {
    async route(req) {
      asked.push(req);
      const i = pick(req.options.map((o) => o.label));
      return i === null ? null : { ...req.options[i], confidence: 'high', model: 'fake', latencyMs: 5 };
    },
  };
  return { router, asked };
}

describe('intent router', () => {
  const flush = async (tick: (ms: number) => void, ms = 100) => {
    tick(ms);
    await Promise.resolve();
    await Promise.resolve();
    tick(ms);
  };

  it('asks about a sentence the phrase cues missed, and routes on yes', async () => {
    const { router, asked } = fakeRouter((labels) => labels.findIndex((l) => l === 'Not breathing'));
    const { s, v, tick } = rig({ router });
    s.start();
    v.mic()!.onTranscript('the poor man went down in the hallway and he is grey');
    await flush(tick);
    expect(asked[0].options.map((o) => o.label)).toEqual(['Not breathing', 'Shot or bleeding', 'Choking']);
    expect(s.snapshot().suggestion).toMatchObject({ source: 'model', keyword: 'not breathing' });
    v.mic()!.onTranscript('yes');
    tick(100);
    expect(s.snapshot().stateKey).toBe('cardiac.scene_check');
  });

  it('only sees moves the state already offers, so it cannot name a step that is not on screen', async () => {
    const { router, asked } = fakeRouter(() => null);
    const { s, v, tick } = rig({ router });
    s.start();
    s.say('not breathing');
    v.mic()!.onTranscript('what am I even supposed to do with my hands here');
    await flush(tick);
    const offered = asked[0].options.map((o) => o.keyword);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((k) => s.engine.keywords().includes(k))).toBe(true);
    expect(s.snapshot().suggestion).toBeNull();
  });

  it('is never asked when a keyword or a phrase cue already answered', async () => {
    const { router, asked } = fakeRouter(() => 0);
    const { s, v, tick } = rig({ router });
    s.start();
    // The listener fires both callbacks for a final transcript that held a keyword (src/voice/in.ts).
    v.mic()!.onKeyword('not breathing');
    v.mic()!.onTranscript('he is not breathing');
    await flush(tick);
    s.restart();
    v.mic()!.onTranscript("he ate something and now he's silent and holding his neck");
    await flush(tick);
    expect(s.snapshot().suggestion?.source).toBe('voice');
    expect(asked).toEqual([]);
  });

  it('asks one sentence at a time, then waits out the cooldown', async () => {
    const { router, asked } = fakeRouter(() => null);
    const { s, v, tick } = rig({ router });
    s.start();
    v.mic()!.onTranscript('oh god oh god what is happening to him');
    await flush(tick);
    v.mic()!.onTranscript('somebody please tell me what to do right now');
    await flush(tick);
    expect(asked).toHaveLength(1);
    tick(9000);
    v.mic()!.onTranscript('somebody please tell me what to do right now');
    await flush(tick);
    expect(asked).toHaveLength(2);
  });

  it('drops an answer that arrived after the state moved on', async () => {
    let release: (() => void) | null = null;
    const router: IntentRouter = {
      route: (req) =>
        new Promise((resolve) => {
          release = () => resolve({ ...req.options[0], confidence: 'high', model: 'fake', latencyMs: 5 });
        }),
    };
    const { s, v, tick } = rig({ router });
    s.start();
    v.mic()!.onTranscript('please please please help him');
    tick(100);
    s.say('bleeding');
    release!();
    await flush(tick);
    expect(s.snapshot().suggestion).toBeNull();
  });
});

describe('intent router: answers and the standing finish', () => {
  const flush = async (tick: (ms: number) => void, ms = 100) => {
    tick(ms);
    await Promise.resolve();
    await Promise.resolve();
    tick(ms);
  };

  it("is offered the machine's answers as questions, and an answer speaks with no yes", async () => {
    const { router, asked } = fakeRouter((labels) => labels.indexOf('I felt a rib crack'));
    const { s, v, tick } = rig({ router });
    s.start();
    s.say('not breathing');
    v.mic()!.onTranscript('I think I just broke something in his chest');
    await flush(tick);
    expect(asked[0].options.find((o) => o.label === 'I felt a rib crack')).toMatchObject({ kind: 'answer', keyword: 'ribs' });
    expect(s.snapshot().suggestion).toBeNull();
    expect(s.snapshot().stateKey).toBe('cardiac.scene_check');
    expect(v.enqueued.map((e) => e.text)).toContain('A crack or a pop can happen when you push hard enough. It is not a reason to stop. Keep going.');
    expect(s.log.entries().some((e) => e.detail.endsWith('as the question: I felt a rib crack'))).toBe(true);
  });

  it('offers the standing finish too, so "the paramedics just pulled up" is understood', async () => {
    const { router, asked } = fakeRouter((labels) => labels.indexOf('Ambulance is here'));
    const { s, v, tick } = rig({ router });
    s.start();
    s.say('not breathing');
    for (let i = 0; i < 4; i++) s.advance(); // compressions
    v.mic()!.onTranscript('the paramedics just pulled up');
    await flush(tick);
    expect(asked[0].options.some((o) => o.label === 'Ambulance is here' && o.kind === 'transition')).toBe(true);
    expect(s.snapshot().suggestion).toMatchObject({ source: 'model', to: 'handoff' });
    s.confirmSuggestion();
    expect(s.snapshot().phase).toBe('handoff');
  });

  it('acknowledges out loud when even the router cannot place the sentence', async () => {
    const { router } = fakeRouter(() => null);
    const { s, v, tick } = rig({ router });
    s.start();
    s.say('not breathing');
    v.mic()!.onTranscript('I do not know what any of this means');
    await flush(tick);
    expect(v.enqueued.find((e) => e.text === HEARD_UNMATCHED_LINE)?.priority).toBe('narration');
  });

  it('offers triage exactly the three routes, as before', async () => {
    const { router, asked } = fakeRouter(() => null);
    const { s, v, tick } = rig({ router });
    s.start();
    v.mic()!.onTranscript('something is very wrong with him');
    await flush(tick);
    expect(asked[0].options.map((o) => o.label)).toEqual(['Not breathing', 'Shot or bleeding', 'Choking']);
  });
});

// ---------------------------------------------------------------------------
// The scene model (docs/04 item 7, docs/11): one frame, a closed label, a question. Never a route.
// ---------------------------------------------------------------------------
import type { SceneAssessor } from '../src/ai/assess';
import type { SceneAssessment, SceneLabel } from '../src/types';

function fakeAssessor() {
  const calls: number[] = [];
  let resolve: ((a: SceneAssessment | null) => void) | null = null;
  const assessor: SceneAssessor = {
    assess: () =>
      new Promise((r) => {
        calls.push(calls.length + 1);
        resolve = r;
      }),
  };
  const answer = async (label: SceneLabel | null) => {
    resolve?.(
      label === null
        ? null
        : {
            label,
            confidence: 'high',
            scene: 'a man lying on the floor',
            patient: { x: 0.2, y: 0.5, w: 0.6, h: 0.3 },
            cues: { awake: 'no', breathing: 'unclear', pain: 'unclear', bleedingVisible: label === 'bleeding' ? 'yes' : 'no' },
            materials: [],
            model: 'test',
            latencyMs: 10,
          },
    );
    await new Promise((r) => setTimeout(r, 0));
  };
  return { assessor, calls, answer };
}

describe('scene assessment', () => {
  it('sends one frame once the camera has settled in triage and asks about the label', async () => {
    const a = fakeAssessor();
    const { s, v, p, tick } = rig({ assessor: a.assessor });
    s.start();
    void p.start(null as unknown as HTMLVideoElement);
    p.emitAt(T0);
    tick(500);
    expect(a.calls).toHaveLength(0);
    tick(1000);
    expect(a.calls).toHaveLength(1);
    expect(s.snapshot().assessing).toBe(true);
    expect(s.log.entries().some((e) => e.detail === 'camera: one frame sent to the scene model')).toBe(true);
    await a.answer('bleeding');
    expect(s.snapshot().assessing).toBe(false);
    expect(s.snapshot().assessment?.label).toBe('bleeding');
    expect(s.snapshot().suggestion).toMatchObject({ source: 'camera', label: 'Shot or bleeding', keyword: 'bleeding' });
    expect(v.enqueued.some((e) => e.text === 'It looks like someone is bleeding badly. Say yes, or tap.')).toBe(true);
    expect(s.snapshot().stateKey).toBe('triage.listening'); // nothing moved on the model alone
    s.confirmSuggestion();
    expect(s.snapshot().stateKey).toBe('bleeding.scene_safety');
    p.stop();
  });

  it('asks nothing on unclear, tries once more later, and never a third time', async () => {
    const a = fakeAssessor();
    const { s, p, tick, clock } = rig({ assessor: a.assessor });
    s.start();
    void p.start(null as unknown as HTMLVideoElement);
    p.emitAt(T0);
    tick(1500);
    await a.answer('unclear');
    expect(s.snapshot().suggestion).toBeNull();
    // Facts keep arriving, as they do from a running camera; a stale fact would hold the frame back.
    const run = (ms: number) => {
      for (let i = 0; i < ms / 500; i++) {
        p.emitAt(clock.t);
        tick(500);
      }
    };
    run(3000);
    expect(a.calls).toHaveLength(1); // too soon
    run(3500);
    expect(a.calls).toHaveLength(2);
    await a.answer(null); // model unavailable: nothing happens
    run(10_000);
    expect(a.calls).toHaveLength(2);
    p.stop();
  });

  it('does not ask again about a route the person just said no to, from either camera source', async () => {
    const a = fakeAssessor();
    const { s, p, tick, clock } = rig({ assessor: a.assessor });
    s.start();
    void p.start(null as unknown as HTMLVideoElement);
    p.emitAt(T0);
    tick(1500);
    await a.answer('collapsed');
    expect(s.snapshot().suggestion?.label).toBe('Collapsed');
    s.rejectSuggestion();
    p.setControls({ personDown: true });
    p.emitAt(clock.t);
    tick(500);
    expect(s.snapshot().suggestion).toBeNull();
    p.stop();
  });

  it('does nothing without an assessor', () => {
    const { s, p, tick } = rig();
    s.start();
    void p.start(null as unknown as HTMLVideoElement);
    p.emitAt(T0);
    tick(3000);
    expect(s.snapshot().assessing).toBe(false);
    expect(s.snapshot().assessment).toBeNull();
    p.stop();
  });
});

/**
 * The permission sheet used to be invisible to the whole app: `starting-camera` covered both a
 * 17 MB model download and a modal prompt nobody had answered, and every opening deadline ran
 * from the tap regardless. These pin the two facts the screen needs to stop doing that.
 */
describe('session: the camera as an open question', () => {
  function rigWithStatus(): ReturnType<typeof rig> & { setStatus: (s: string) => void } {
    const r = rig();
    let status = 'idle';
    // The fake reports 'running' as soon as it starts; the real module goes through a download
    // and a permission wait first, which is what this replaces.
    (r.p.debug as unknown as { status: () => string }).status = () => status;
    return { ...r, setStatus: (s: string) => (status = s) };
  }

  it('reports an unanswered permission prompt as its own state, not as "starting"', () => {
    const { s, setStatus } = rigWithStatus();
    setStatus('loading-model');
    s.start();
    expect(s.snapshot().eyes.status).toBe('starting');

    setStatus('awaiting-permission');
    s.retryListening(); // any call that re-notifies
    expect(s.snapshot().eyes.status).toBe('awaiting');
  });

  it('does not stamp the camera as ready at the tap, only when it actually settles', () => {
    const { s, tick, clock, setStatus } = rigWithStatus();
    setStatus('awaiting-permission');
    s.start();
    const tappedAt = clock.t;

    expect(s.snapshot().eyesReadyAt).toBeNull();
    tick(5000); // the person is reading the sheet
    expect(s.snapshot().eyesReadyAt).toBeNull();

    setStatus('running');
    tick(100);
    expect(s.snapshot().eyesReadyAt).toBe(clock.t);
    expect(s.snapshot().eyesReadyAt).toBeGreaterThan(tappedAt);
  });

  it('stamps a refused camera as settled too, so the screen stops waiting on it', () => {
    const { s, tick, setStatus } = rigWithStatus();
    setStatus('awaiting-permission');
    s.start();
    expect(s.snapshot().eyesReadyAt).toBeNull();

    setStatus('error');
    tick(100);
    expect(s.snapshot().eyes.status).toBe('error');
    expect(s.snapshot().eyesReadyAt).not.toBeNull();
  });
});

/** A rewording provider that records what it was asked and answers whatever the test decides. */
function fakeFlavor(reply: (canonical: string, ctx: FlavorContext) => string | null) {
  const asked: { canonical: string; ctx: FlavorContext }[] = [];
  const flavor: NarrationFlavor = {
    flavor: async (canonical, ctx) => {
      asked.push({ canonical, ctx });
      return reply(canonical, ctx);
    },
  };
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
  };
  return { flavor, asked, settle };
}

describe('rewording (injected behind ?flag=narrationFlavor)', () => {
  it("rewords the next step's lines before it is reached; the session's first lines speak as written", async () => {
    const f = fakeFlavor((canonical) => `Okay, ${canonical}`);
    const { s, v } = rig({ flavor: f.flavor });
    s.start();
    // Triage's own line had no earlier moment to be reworded in.
    expect(v.enqueued[0].text).toContain("Tell me what's happening");
    // Triage can lead to three machines; their first steps' lines are asked for now, with no live context.
    const asked = f.asked.map((a) => a.canonical);
    expect(asked).toContain("Make sure it's safe to approach.");
    expect(asked).toContain('First: are YOU safe?');
    expect(f.asked.every((a) => a.ctx.heard === null && a.ctx.numbers.length === 0)).toBe(true);
    await f.settle();
    v.mic()!.onKeyword('not breathing');
    const texts = v.enqueued.map((e) => e.text);
    expect(texts).toContain("Okay, Make sure it's safe to approach.");
    expect(texts).toContain('Okay, Tap his shoulders and shout: are you okay?');
    expect(texts).not.toContain("Make sure it's safe to approach.");
    // The screen still knows which step line was said.
    expect(s.snapshot().lineIndex).toBe(1);
    expect(s.log.entries().some((e) => e.detail === 'said as: "Okay, Make sure it\'s safe to approach."')).toBe(true);
  });

  it('refuses a rewording that drops a number or invents one; the canonical line speaks', async () => {
    const f = fakeFlavor((canonical) =>
      canonical.startsWith('Call 911')
        ? 'Call the emergency number right now. Put the phone on speaker and lay it on the ground beside him.'
        : canonical === 'Follow my beat. Do not stop.'
          ? 'Follow my beat at 110. Do not stop.'
          : `Okay, ${canonical}`,
    );
    const { s, v } = rig({ flavor: f.flavor });
    s.start();
    await f.settle();
    v.mic()!.onKeyword('not breathing'); // scene_check: asks for check_breathing
    await f.settle();
    s.advance(); // check_breathing: asks for call_911
    await f.settle();
    s.advance(); // call_911
    expect(v.enqueued.at(-1)?.text).toBe('Call 911 right now. Put the phone on speaker and lay it on the ground beside him.');
    expect(s.log.entries().some((e) => e.detail.startsWith('rewording refused (dropped the number 911)'))).toBe(true);
    s.advance(); // position: asks for compressions
    await f.settle();
    s.advance(); // compressions
    const texts = v.enqueued.map((e) => e.text);
    expect(texts).toContain('Okay, Push hard and fast, at least two inches deep.');
    expect(texts).toContain('Follow my beat. Do not stop.');
    expect(s.log.entries().some((e) => e.detail.startsWith('rewording refused (introduced the number 110)'))).toBe(true);
  });

  it('a nag is canonical the first time and personal on the repeat: what they said, what the camera measures', async () => {
    const f = fakeFlavor((canonical, ctx) =>
      canonical === 'Faster. Push with the beat.' && ctx.heard !== null && ctx.numbers.length > 0
        ? `I know this is hard, you are at ${ctx.numbers[0]}. Faster. Push with the beat.`
        : null,
    );
    const { s, v, p, tick, clock } = rig({ flavor: f.flavor });
    s.start();
    s.say('not breathing');
    for (let i = 0; i < 4; i++) s.advance();
    expect(s.snapshot().stateKey).toBe('cardiac.compressions');
    tick(100);
    v.mic()!.onTranscript('my arms are giving out');
    p.setControls({ rate: 80, compressing: true });
    const run = (ms: number) => {
      for (let i = 0; i < ms / 100; i++) {
        tick(100);
        p.emitAt(clock.t);
      }
    };
    run(4500);
    const nags = () => v.enqueued.filter((e) => e.dedupeKey === 'rate-low').map((e) => e.text);
    expect(nags()).toEqual(['Faster. Push with the beat.']);
    const ask = f.asked.find((a) => a.canonical === 'Faster. Push with the beat.');
    expect(ask?.ctx.heard).toBe('my arms are giving out');
    expect(ask?.ctx.observations).toContain('pushing at about 80 a minute');
    expect(ask?.ctx.numbers).toContain(80);
    await f.settle();
    run(7000);
    expect(nags()).toEqual(['Faster. Push with the beat.', 'I know this is hard, you are at 80. Faster. Push with the beat.']);
  });

  it('drops a nag rewording once the number it quoted has moved on, inside its own twenty seconds', async () => {
    const f = fakeFlavor((canonical, ctx) =>
      canonical === 'Faster. Push with the beat.' && ctx.numbers.length > 0 ? `You are at ${ctx.numbers[0]}. Faster. Push with the beat.` : null,
    );
    const { s, v, p, tick, clock } = rig({ flavor: f.flavor });
    s.start();
    s.say('not breathing');
    for (let i = 0; i < 4; i++) s.advance();
    p.setControls({ rate: 80, compressing: true });
    const run = (ms: number) => {
      for (let i = 0; i < ms / 100; i++) {
        tick(100);
        p.emitAt(clock.t);
      }
    };
    const nags = () => v.enqueued.filter((e) => e.dedupeKey === 'rate-low').map((e) => e.text);
    run(4500);
    expect(nags()).toEqual(['Faster. Push with the beat.']);
    await f.settle();
    run(7000);
    expect(nags().at(-1)).toBe('You are at 80. Faster. Push with the beat.');
    // The person speeds up, still under the bar: the "80" line is nine seconds old and would
    // have been kept for eleven more. It contradicts the beat now, so the canonical line speaks.
    p.setControls({ rate: 95 });
    await f.settle();
    run(7000);
    expect(nags().at(-1)).toBe('Faster. Push with the beat.');
    expect(f.asked.filter((a) => a.canonical === 'Faster. Push with the beat.').map((a) => a.ctx.numbers[0])).toContain(95);
    await f.settle();
    run(7000);
    expect(nags().at(-1)).toBe('You are at 95. Faster. Push with the beat.');
  });

  it('asks nothing and changes nothing without a provider', () => {
    const { s, v } = rig();
    s.start();
    v.mic()!.onKeyword('not breathing');
    expect(v.enqueued.map((e) => e.text)).toContain("Make sure it's safe to approach.");
  });
});

describe('canonicalLines', () => {
  it('covers the lines the session itself speaks and the questions it asks, not only the machines', () => {
    const lines = canonicalLines();
    for (const line of [ROI_FAILED_LINE, CAMERA_SAW_LINE, HEARD_UNMATCHED_LINE, GUIDANCE.dark, GUIDANCE.closer, GUIDANCE.back]) expect(lines).toContain(line);
    for (const r of TRIAGE_ROUTES) expect(lines).toContain(r.confirm);
    expect(lines).toContain(confirmLine('Not breathing'));
    expect(lines).not.toContain(GUIDANCE.unseen); // the engine's own blind rule says that one
    expect(new Set(lines).size).toBe(lines.length);
  });
});
