// The shell bridge against a fake window: what the page posts, what it does with what the
// shell sends back, and that a plain browser is left untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_VERSION, SHELL_EVENT, encode, type ShellInfo, type ShellToWeb, type WebToShell } from './bridge';
import { ShellSpeakerProvider, installShell, shellInfo, type ShellWindow } from './shell';

const INFO: ShellInfo = { bridge: BRIDGE_VERSION, platform: 'ios', version: '0.1.0' };

type Fake = ShellWindow & {
  posted: WebToShell[];
  /** Deliver a message the way the shell does: a DOM event whose detail is the encoded string. */
  fromShell(msg: ShellToWeb): void;
};

function fakeWindow(injected: unknown = INFO, withVibrate = false): Fake {
  const listeners = new Map<string, (e: { detail?: unknown }) => void>();
  const fake: Fake = {
    posted: [],
    navigator: withVibrate ? { vibrate: () => true } : {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    fromShell: (msg) => listeners.get(SHELL_EVENT)?.({ detail: encode(msg) }),
  };
  if (injected !== null) {
    fake.ReactNativeWebView = {
      postMessage: (data) => fake.posted.push(JSON.parse(data) as WebToShell),
      injectedObjectJson: () => JSON.stringify(injected),
    };
  }
  return fake;
}

describe('outside the shell', () => {
  it('reports no shell and installs nothing', () => {
    const w = fakeWindow(null);
    expect(shellInfo(w)).toBeNull();
    expect(installShell(w)).toBeNull();
    expect(w.navigator.vibrate).toBeUndefined();
  });

  it('ignores a host from another bridge version or an unknown platform', () => {
    expect(shellInfo(fakeWindow({ ...INFO, bridge: 99 }))).toBeNull();
    expect(shellInfo(fakeWindow({ ...INFO, platform: 'web' }))).toBeNull();
    expect(shellInfo(fakeWindow('not json at all'))).toBeNull();
  });
});

describe('inside the shell', () => {
  it('announces itself once and adds vibrate where the platform lacks it', () => {
    const w = fakeWindow();
    const bridge = installShell(w);
    expect(bridge?.info).toEqual(INFO);
    expect(installShell(w)).toBe(bridge);
    expect(w.posted).toEqual([{ type: 'ready', bridge: BRIDGE_VERSION }]);

    (w.navigator.vibrate as (p: number) => boolean)(200);
    expect(w.posted.at(-1)).toEqual({ type: 'vibrate', pattern: [200] });
  });

  it('leaves a native vibrate alone', () => {
    const w = fakeWindow(INFO, true);
    const native = w.navigator.vibrate;
    installShell(w);
    expect(w.navigator.vibrate).toBe(native);
  });
});

describe('ShellSpeakerProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('posts the line and resolves when the shell reports the end', async () => {
    const w = fakeWindow();
    const provider = new ShellSpeakerProvider(installShell(w)!);
    let ended = false;
    const p = provider.speak('Push hard and fast.').then(() => (ended = true));
    expect(w.posted.at(-1)).toEqual({ type: 'speak', id: 1, text: 'Push hard and fast.', lang: 'en-US', rate: 1.05 });

    w.fromShell({ type: 'speechEnd', id: 7, reason: 'done' }); // someone else's id
    await Promise.resolve();
    expect(ended).toBe(false);

    w.fromShell({ type: 'speechEnd', id: 1, reason: 'done' });
    await p;
    expect(ended).toBe(true);
  });

  it('cancel tells the shell and settles the pending line', async () => {
    const w = fakeWindow();
    const provider = new ShellSpeakerProvider(installShell(w)!);
    const p = provider.speak('Keep going.');
    provider.cancel();
    expect(w.posted.at(-1)).toEqual({ type: 'cancelSpeech' });
    await expect(p).resolves.toBeUndefined();
  });

  it('a new line replaces the current one', async () => {
    const w = fakeWindow();
    const provider = new ShellSpeakerProvider(installShell(w)!);
    const first = provider.speak('First.');
    const second = provider.speak('Second.');
    await expect(first).resolves.toBeUndefined();
    expect(w.posted.map((m) => m.type)).toEqual(['ready', 'speak', 'cancelSpeech', 'speak']);
    w.fromShell({ type: 'speechEnd', id: 2, reason: 'done' });
    await expect(second).resolves.toBeUndefined();
  });

  it('never hangs on a lost speechEnd', async () => {
    const w = fakeWindow();
    const provider = new ShellSpeakerProvider(installShell(w)!);
    const p = provider.speak('Call 911 now.');
    vi.advanceTimersByTime(4001);
    await expect(p).resolves.toBeUndefined();
  });
});
