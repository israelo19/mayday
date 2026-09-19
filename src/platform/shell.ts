// Browser side of the Expo Go shell bridge (mobile/, docs/07 P4). Inside the shell's WebView
// the shell provides speech and haptics natively: a WebView has no usable Web Speech API
// (the object exists on Android and never speaks) and iOS has no vibrate API. This file is
// the only place the web app knows the shell exists. `installShell()` runs once from the
// page entry; `ShellSpeakerProvider` goes to the voice queue through `setProvider()` (the
// docs/07 seam) whenever `shellInfo()` is non-null. Selection is by shell identity, never by
// capability sniffing, for the Android reason above. Outside the shell every export is a
// no-op or null, so the browser app is unchanged.
//
// Nothing here reaches the network, and no instruction text originates here: the shell
// speaks exactly the canonical line the queue hands it (CLAUDE.md principles 1 and 3).
import {
  BRIDGE_VERSION,
  SHELL_EVENT,
  decode,
  encode,
  type ShellInfo,
  type ShellToWeb,
  type WebToShell,
} from './bridge';
import type { SpeakerProvider } from '../voice/out';

/** The slice of `window` the bridge touches, so a test can pass a plain object. */
export interface ShellWindow {
  ReactNativeWebView?: { postMessage(data: string): void; injectedObjectJson?(): string | undefined };
  addEventListener(type: string, listener: (e: { detail?: unknown }) => void): void;
  navigator: { vibrate?: unknown };
}

/** The shell's identity, or null when the page runs in a plain browser. */
export function shellInfo(target: ShellWindow = browserWindow()): ShellInfo | null {
  const rn = target.ReactNativeWebView;
  if (!rn || typeof rn.postMessage !== 'function') return null;
  let info: Partial<ShellInfo> | null = null;
  try {
    const json = rn.injectedObjectJson?.();
    info = json ? (JSON.parse(json) as Partial<ShellInfo>) : null;
  } catch {
    info = null;
  }
  if (!info || info.bridge !== BRIDGE_VERSION || (info.platform !== 'ios' && info.platform !== 'android')) return null;
  return { bridge: BRIDGE_VERSION, platform: info.platform, version: String(info.version ?? '0.0.0') };
}

export interface ShellBridge {
  readonly info: ShellInfo;
  post(msg: WebToShell): void;
  onMessage(listener: (msg: ShellToWeb) => void): () => void;
  /** Delivers one raw message from the shell. Wired to SHELL_EVENT by installShell. */
  receive(raw: unknown): void;
}

const installed = new WeakMap<ShellWindow, ShellBridge>();

/**
 * Installs the shell adapters once per page and returns the bridge, or null outside the
 * shell. The only adapter is `navigator.vibrate`, added where the platform lacks it (iOS)
 * so CALL 911 buzzes on both phones. Wake lock and fullscreen are left alone: the shell
 * keeps the screen awake and owns the whole screen, and the page already treats a refusal
 * of either as fine.
 */
export function installShell(target: ShellWindow = browserWindow()): ShellBridge | null {
  const existing = installed.get(target);
  if (existing) return existing;
  const info = shellInfo(target);
  if (!info) return null;

  const listeners = new Set<(msg: ShellToWeb) => void>();
  const bridge: ShellBridge = {
    info,
    post: (msg) => target.ReactNativeWebView?.postMessage(encode(msg)),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    receive: (raw) => {
      const msg = decode<ShellToWeb>(raw);
      if (!msg) return;
      for (const listener of listeners) listener(msg);
    },
  };
  target.addEventListener(SHELL_EVENT, (e) => bridge.receive(e.detail));

  if (typeof target.navigator.vibrate !== 'function') {
    // defineProperty rather than assignment: Navigator's own properties are accessors and a
    // strict-mode assignment to one without a setter throws.
    Object.defineProperty(target.navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: (pattern: number | number[]) => {
        bridge.post({ type: 'vibrate', pattern: Array.isArray(pattern) ? pattern : [pattern] });
        return true;
      },
    });
  }

  installed.set(target, bridge);
  bridge.post({ type: 'ready', bridge: BRIDGE_VERSION });
  return bridge;
}

/** Speaks through the shell's native voice. Same contract as WebSpeechProvider: never rejects. */
export class ShellSpeakerProvider implements SpeakerProvider {
  readonly name = 'shell';
  private nextId = 1;
  private pending: { id: number; done: () => void } | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly bridge: ShellBridge,
    private readonly rate = 1.05,
    private readonly lang = 'en-US',
  ) {
    this.unsubscribe = bridge.onMessage((msg) => {
      if (msg.type === 'speechEnd' && this.pending?.id === msg.id) this.pending.done();
    });
  }

  speak(text: string): Promise<void> {
    // A newer line replaces the current one, as the Web Speech provider does.
    if (this.pending) this.cancel();
    const id = this.nextId++;
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (this.pending?.id === id) this.pending = null;
        resolve();
      };
      // A lost speechEnd must never freeze the coaching queue; same budget as WebSpeechProvider.
      const watchdog = setTimeout(done, Math.max(4000, text.length * 90 + 1500));
      this.pending = { id, done };
      this.bridge.post({ type: 'speak', id, text, lang: this.lang, rate: this.rate });
    });
  }

  cancel(): void {
    this.bridge.post({ type: 'cancelSpeech' });
    this.pending?.done();
  }

  dispose(): void {
    this.cancel();
    this.unsubscribe();
  }
}

function browserWindow(): ShellWindow {
  return globalThis as unknown as ShellWindow;
}
