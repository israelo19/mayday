// The M2 gate in test form: a human's keyword routes, the app's own speech does not, and
// the matcher never mistakes 'no' for 'no response'. The recognition object is a fake, so
// all of it runs in node.
import { describe, expect, it } from 'vitest';
import {
  createVoiceIn,
  INTERIM_SETTLE_MS,
  isEchoOf,
  KEYWORD_REFIRE_MS,
  normalizeTranscript,
  spotKeyword,
  type RecognitionEventLike,
  type SpeechRecognitionLike,
  type VoiceInOptions,
} from './in';

describe('spotKeyword', () => {
  const keywords = ['no', 'not breathing', 'no response', 'ambulance here'];

  it('is phrase-level and longest-first, so partial words and prefixes never fire', () => {
    expect(spotKeyword("he's not breathing", keywords)).toBe('not breathing');
    expect(spotKeyword('there is no response at all', keywords)).toBe('no response');
    expect(spotKeyword('nothing', keywords)).toBeNull(); // 'no' is word-bounded
    expect(spotKeyword('NO!', keywords)).toBe('no');
  });

  it('survives punctuation and curly apostrophes', () => {
    expect(spotKeyword('He’s NOT breathing!!', keywords)).toBe('not breathing');
    expect(normalizeTranscript('Are you OKAY?!')).toBe('are you okay');
  });
});

describe('isEchoOf', () => {
  const appLines = ['Faster. Push with the beat.', "Don't stop. Keep pushing. Help is coming."];

  it('drops a near-verbatim readback of an app line', () => {
    expect(isEchoOf("don't stop keep pushing help is coming", appLines)).toBe(true);
    expect(isEchoOf('faster push with the beat', appLines)).toBe(true);
  });

  it('never drops a short human answer, even one built from the app’s own words', () => {
    expect(isEchoOf('not breathing', appLines)).toBe(false);
    expect(isEchoOf('faster', appLines)).toBe(false);
    expect(isEchoOf('keep pushing', appLines)).toBe(false); // 2 words, under the floor
  });

  it('passes genuinely new sentences of any length', () => {
    expect(isEchoOf('the ambulance is here and they are taking over now', appLines)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listener plumbing, with a fake recognition engine
// ---------------------------------------------------------------------------

class FakeRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 0;
  onresult: ((e: RecognitionEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  started = 0;
  start(): void {
    this.started++;
  }
  /** Synchronous by default, which is convenient but not what a browser does. */
  stop(): void {
    if (this.deferEnd) {
      this.pendingEnd = true;
      return;
    }
    this.onend?.();
  }
  /** Set to model the real thing: `end` arrives on a later task, after stop() returns. */
  deferEnd = false;
  pendingEnd = false;
  /** Deliver the `end` that a deferred stop() left pending. */
  flushEnd(): void {
    if (!this.pendingEnd) return;
    this.pendingEnd = false;
    this.onend?.();
  }
  hear(transcript: string, isFinal = true): void {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] });
  }
}

function setup(over?: Partial<VoiceInOptions>) {
  let t = 0;
  const recs: FakeRecognition[] = [];
  const pending: (() => void)[] = [];
  const voiceIn = createVoiceIn({
    factory: () => {
      const r = new FakeRecognition();
      recs.push(r);
      return r;
    },
    now: () => t,
    schedule: (fn) => {
      pending.push(fn);
      return () => {};
    },
  });
  const heardKeywords: string[] = [];
  const transcripts: string[] = [];
  const statuses: string[] = [];
  let suppressed = false;
  voiceIn.start({
    keywords: () => ['not breathing', 'no', 'ambulance here'],
    onKeyword: (k) => heardKeywords.push(k),
    onTranscript: (x) => transcripts.push(x),
    suppress: () => suppressed,
    echoText: () => ["Don't stop. Keep pushing. Help is coming."],
    onStatus: (s) => statuses.push(s),
    ...over,
  });
  return {
    voiceIn,
    recs,
    heardKeywords,
    transcripts,
    statuses,
    rec: () => recs[recs.length - 1],
    tick: (ms: number) => (t += ms),
    setSuppressed: (v: boolean) => (suppressed = v),
    runPending: () => {
      const fns = pending.splice(0);
      for (const fn of fns) fn();
    },
  };
}

describe('the keyword listener', () => {
  it('routes a human keyword and logs the final transcript', () => {
    const s = setup();
    s.rec().hear("he's not breathing");
    expect(s.heardKeywords).toEqual(['not breathing']);
    expect(s.transcripts).toEqual(["he's not breathing"]);
  });

  it('spots on interim results but never fires the same keyword twice in the window', () => {
    const s = setup();
    s.rec().hear('not breath', false); // interim, no match yet
    s.rec().hear('not breathing', false); // interim: fires now
    s.tick(300);
    s.rec().hear("he's not breathing", true); // final: same keyword, inside the window
    expect(s.heardKeywords).toEqual(['not breathing']);
    s.tick(KEYWORD_REFIRE_MS + 1);
    s.rec().hear('still not breathing');
    expect(s.heardKeywords).toEqual(['not breathing', 'not breathing']);
  });

  it('while the app speaks, holds back only a keyword the app itself just said (layer 1)', () => {
    const s = setup({ echoText: () => ["Say things like: he's not breathing, she's choking, he got shot."] });
    s.setSuppressed(true);
    s.rec().hear("he's not breathing"); // could be our own prompt coming back through the mic
    expect(s.heardKeywords).toEqual([]);
    expect(s.transcripts).toEqual([]);
    s.rec().hear('ambulance here'); // nothing the app said: a person talking over the coach
    expect(s.heardKeywords).toEqual(['ambulance here']);
    s.setSuppressed(false);
    s.rec().hear("he's not breathing"); // the app is quiet now, so the same words are the person's
    expect(s.heardKeywords).toEqual(['ambulance here', 'not breathing']);
  });

  it('shows what it hears while the app speaks but logs nothing from that stretch', () => {
    const interim: string[] = [];
    const s = setup({ onInterim: (t) => interim.push(t) });
    s.setSuppressed(true);
    s.rec().hear('my dad fell over', false);
    s.tick(INTERIM_SETTLE_MS + 1);
    s.runPending();
    expect(interim).toEqual(['my dad fell over']);
    expect(s.transcripts).toEqual([]);
  });

  it('drops a late echo of the app’s own line (layer 2), keyword and all', () => {
    const s = setup();
    // The app said this 2s ago; recognition delivers it late, past the time gate.
    s.rec().hear("don't stop keep pushing help is coming");
    expect(s.transcripts).toEqual([]);
    expect(s.heardKeywords).toEqual([]);
  });

  it('restarts with backoff when the engine ends itself, and stays down after stop()', () => {
    const s = setup();
    expect(s.rec().started).toBe(1);
    s.rec().onend?.(); // Chrome ended the session
    s.runPending();
    expect(s.recs.length).toBe(2); // a fresh instance took over
    expect(s.statuses).toContain('restarting');
    expect(s.statuses[s.statuses.length - 1]).toBe('listening');
    s.voiceIn.stop();
    s.runPending();
    expect(s.recs.length).toBe(2); // no further restarts
  });

  it('a restart does not leave the recognizer it abandoned able to spawn another', () => {
    // "Start over" between takes: session.stop() then session.start() in one tick. A real
    // recognizer's `end` lands after that, and it used to find `running` back at true and
    // attach a second instance next to the live one, so the app heard the room twice.
    const s = setup();
    const first = s.rec();
    first.deferEnd = true;
    expect(s.recs.length).toBe(1);

    s.voiceIn.stop();
    s.voiceIn.start({
      keywords: () => ['not breathing'],
      onKeyword: (k) => s.heardKeywords.push(k),
      onTranscript: (x) => s.transcripts.push(x),
      suppress: () => false,
      echoText: () => [],
    });
    expect(s.recs.length).toBe(2); // the new take's recognizer

    first.flushEnd(); // the abandoned one finally ends
    s.runPending();
    expect(s.recs.length).toBe(2); // and it must not have built a third
  });

  it('schedules a retry when a fresh recognizer refuses to start, and says so', () => {
    // start() throws while the previous instance winds down. The comment promised the
    // backoff would retry; nothing scheduled one, and the chip said "listening" over a
    // mic that was off for the rest of the session.
    let throwOnce = true;
    const recs: FakeRecognition[] = [];
    const pending: (() => void)[] = [];
    const statuses: string[] = [];
    const events: string[] = [];
    const voiceIn = createVoiceIn({
      factory: () => {
        const r = new FakeRecognition();
        if (throwOnce) {
          throwOnce = false;
          r.start = () => {
            throw new Error('recognition has already started');
          };
        }
        recs.push(r);
        return r;
      },
      schedule: (fn) => {
        pending.push(fn);
        return () => {};
      },
    });
    voiceIn.start({
      keywords: () => ['not breathing'],
      onKeyword: () => {},
      onTranscript: () => {},
      suppress: () => false,
      onStatus: (s) => statuses.push(s),
      onEvent: (name) => events.push(name),
    });
    expect(events).toContain('start-threw');
    expect(statuses).toEqual(['restarting']); // never 'listening' over a dead mic
    expect(pending.length).toBe(1);
    pending.splice(0).forEach((fn) => fn());
    expect(recs.length).toBe(2);
    expect(recs[1].started).toBe(1);
    expect(statuses).toEqual(['restarting', 'listening']);
  });

  it('gives up for the session when the mic permission is denied', () => {
    const s = setup();
    s.rec().onerror?.({ error: 'not-allowed' });
    s.rec().onend?.();
    s.runPending();
    expect(s.statuses).toContain('unavailable');
    expect(s.recs.length).toBe(1); // no retry against a denied permission
  });

  it('reports unavailable when the API does not exist, so buttons carry the demo', () => {
    const statuses: string[] = [];
    const voiceIn = createVoiceIn({ factory: undefined });
    // In node there is no window, so the default factory resolves to null.
    expect(voiceIn.available).toBe(false);
    voiceIn.start({
      keywords: () => [],
      onKeyword: () => {},
      onTranscript: () => {},
      suppress: () => false,
      onStatus: (x) => statuses.push(x),
    });
    expect(statuses).toEqual(['unavailable']);
  });
});

// ---------------------------------------------------------------------------
// WebKit (iOS and macOS Safari) in continuous mode: interim results only, each one the whole
// utterance so far, and no final until the session stops. Chrome sends finals on its own.
// ---------------------------------------------------------------------------

describe('a recognizer that never sends a final (WebKit continuous mode)', () => {
  it('still hands the settled sentence to the app once the person pauses', () => {
    const s = setup();
    s.rec().hear('he ate something', false);
    s.tick(300);
    s.rec().hear("he ate something and now he's silent", false);
    s.tick(300);
    s.rec().hear("he ate something and now he's silent and holding his neck", false);
    expect(s.transcripts).toEqual([]); // still talking
    s.tick(INTERIM_SETTLE_MS + 1);
    s.runPending();
    expect(s.transcripts).toEqual(["he ate something and now he's silent and holding his neck"]);
  });

  it('flushes an unsettled sentence when the session ends instead of losing it', () => {
    const s = setup();
    s.rec().hear('he is choking on food', false);
    s.rec().stop();
    expect(s.transcripts).toEqual(['he is choking on food']);
  });

  it('does not log the same sentence twice when a real final follows the settle', () => {
    const s = setup();
    s.rec().hear('there is a lot of blood', false);
    s.tick(INTERIM_SETTLE_MS + 1);
    s.runPending();
    s.rec().hear('there is a lot of blood', true);
    expect(s.transcripts).toEqual(['there is a lot of blood']);
  });

  it('fires a keyword once per occurrence, not once per refresh of a growing transcript', () => {
    const s = setup();
    s.rec().hear("he's not breathing", false);
    s.tick(KEYWORD_REFIRE_MS + 500);
    s.rec().hear("he's not breathing and he is cold", false); // same occurrence, more words
    expect(s.heardKeywords).toEqual(['not breathing']);
    s.tick(KEYWORD_REFIRE_MS + 500);
    s.rec().hear("he's not breathing and he is cold he's still not breathing", false); // a new one
    expect(s.heardKeywords).toEqual(['not breathing', 'not breathing']);
  });

  it('shows the person what it is hearing while they speak', () => {
    const interim: string[] = [];
    const s = setup({ onInterim: (t) => interim.push(t) });
    s.rec().hear('my dad', false);
    s.rec().hear('my dad fell over', false);
    expect(interim).toEqual(['my dad', 'my dad fell over']);
    expect(s.transcripts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Short keywords ('no', 'yes', 'aed') are a hypothesis away from a different word. They wait
// for a final, or for the interim to settle; long phrases keep firing from interims.
// ---------------------------------------------------------------------------

describe('short keywords wait for a final or a settled result', () => {
  it('never fires `no` from "he\'s no..." on its way to "he\'s not breathing"', () => {
    const s = setup();
    s.rec().hear("he's no", false);
    expect(s.heardKeywords).toEqual([]);
    s.rec().hear("he's not breathing", true);
    expect(s.heardKeywords).toEqual(['not breathing']);
  });

  it('fires a short keyword from a final, even when the interim already showed it', () => {
    const s = setup();
    s.rec().hear('no', false);
    expect(s.heardKeywords).toEqual([]);
    s.rec().hear('no', true);
    expect(s.heardKeywords).toEqual(['no']);
  });

  it('fires a short keyword once the interim settles, for a recognizer that never sends a final', () => {
    const s = setup();
    s.rec().hear('no', false);
    expect(s.heardKeywords).toEqual([]);
    s.tick(INTERIM_SETTLE_MS + 1);
    s.runPending();
    expect(s.transcripts).toEqual(['no']);
    expect(s.heardKeywords).toEqual(['no']);
    // The transcript grows and settles again: the same `no` is not a new one.
    s.tick(KEYWORD_REFIRE_MS + 500);
    s.rec().hear('no he is cold', false);
    s.tick(INTERIM_SETTLE_MS + 1);
    s.runPending();
    expect(s.heardKeywords).toEqual(['no']);
  });

  it('still fires long phrases from interims, and holds a settled short keyword the app itself said', () => {
    const s = setup({ echoText: () => ['Say yes, or tap.'], keywords: () => ['yes', 'not breathing'] });
    s.rec().hear("he's not breathing", false);
    expect(s.heardKeywords).toEqual(['not breathing']);
    s.rec().hear('yes', false);
    s.setSuppressed(true); // the app is asking its question as the settle lands
    s.tick(INTERIM_SETTLE_MS + 1);
    s.runPending();
    expect(s.heardKeywords).toEqual(['not breathing']); // our own "yes", held back
  });
});
