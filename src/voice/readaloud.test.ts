// Read-aloud and the scripted dispatcher against the REAL queue with a fake speaker, so
// the pause/critical/echo interactions are the ones the demo will actually exercise.
import { describe, expect, it } from 'vitest';
import { createScriptedDispatcher, DISPATCHER_ACK, DISPATCHER_SCRIPT } from './dispatcher';
import { createReadAloud } from './readaloud';
import { createVoiceOut, type SpeakerProvider, type SpeakOptions } from './out';

class FakeSpeaker implements SpeakerProvider {
  readonly name = 'fake';
  spoken: { text: string; voice: string }[] = [];
  private active: (() => void) | null = null;
  speak(text: string, opts?: SpeakOptions): Promise<void> {
    this.spoken.push({ text, voice: opts?.voice ?? 'coach' });
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
  finish(): void {
    const done = this.active;
    this.active = null;
    done?.();
  }
  texts(): string[] {
    return this.spoken.map((s) => s.text);
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  const speaker = new FakeSpeaker();
  let t = 0;
  const out = createVoiceOut({ provider: speaker, now: () => t });
  return { speaker, out, tick: (ms: number) => (t += ms) };
}

describe('read-aloud', () => {
  it('speaks the block one line at a time, in order', async () => {
    const { speaker, out } = setup();
    const ra = createReadAloud(out);
    ra.start(['line one', 'line two', 'line three']);
    await flush();
    expect(speaker.texts()).toEqual(['line one']);
    speaker.finish();
    await flush();
    speaker.finish();
    await flush();
    expect(speaker.texts()).toEqual(['line one', 'line two', 'line three']);
    speaker.finish();
    await flush();
    expect(ra.isActive()).toBe(false);
  });

  it('pauses after the current line and resumes where it left off', async () => {
    const { speaker, out } = setup();
    const ra = createReadAloud(out);
    ra.start(['one', 'two']);
    await flush();
    ra.pause();
    speaker.finish(); // 'one' ends; 'two' must not start
    await flush();
    expect(speaker.texts()).toEqual(['one']);
    ra.resume();
    await flush();
    expect(speaker.texts()).toEqual(['one', 'two']);
  });

  it('yields to a critical line and the interrupted line replays before the block continues', async () => {
    const { speaker, out } = setup();
    const ra = createReadAloud(out);
    ra.start(['location line', 'status line']);
    await flush();
    out.enqueue({ priority: 'critical', text: 'Don’t stop!', stateId: 'compressions' });
    await flush();
    speaker.finish(); // the critical ends
    await flush();
    speaker.finish(); // the replayed read-aloud line ends
    await flush();
    speaker.finish();
    await flush();
    expect(speaker.texts()).toEqual(['location line', 'Don’t stop!', 'location line', 'status line']);
    // ...and the protocol state change above did NOT drop the read-aloud lines as stale.
  });
});

describe('scripted dispatcher', () => {
  it('walks its script in order, in the second voice, and acks past the end', async () => {
    const { speaker, out } = setup();
    const panel: string[] = [];
    const call = createScriptedDispatcher(out).connect((t) => panel.push(t));
    call.sayToDispatcher('123 Main Street');
    call.sayToDispatcher('he collapsed, not breathing');
    call.sayToDispatcher('no, not breathing');
    call.sayToDispatcher('okay');
    call.sayToDispatcher('anything else?');
    // The acknowledgement plays once; later replies are heard and left alone.
    expect(panel).toEqual([...DISPATCHER_SCRIPT, DISPATCHER_ACK]);
    await flush();
    // Every audible dispatcher turn plays as the dispatcher, never the coach.
    expect(speaker.spoken.every((s) => s.voice === 'dispatcher')).toBe(true);
  });

  it('goes silent after hangup', () => {
    const { out } = setup();
    const panel: string[] = [];
    const call = createScriptedDispatcher(out).connect((t) => panel.push(t));
    call.hangup();
    call.sayToDispatcher('hello?');
    expect(panel).toEqual([DISPATCHER_SCRIPT[0]]);
  });

  it('never outranks coaching: a critical enqueued after a dispatcher turn plays first', async () => {
    const { speaker, out } = setup();
    createScriptedDispatcher(out).connect(() => {});
    await flush(); // dispatcher line is speaking
    out.enqueue({ priority: 'critical', text: 'urgent', stateId: 's' });
    await flush();
    expect(speaker.texts()).toEqual([DISPATCHER_SCRIPT[0], 'urgent']);
  });
});
