// The wire protocol between the web app and the Expo Go shell (mobile/). Both sides import
// this file, so a message shape changes in exactly one place. Pure data and two codecs: no
// DOM, no React Native, so it compiles under Vite, vitest and Metro alike.
//
// Transport: the page calls `window.ReactNativeWebView.postMessage(encode(msg))`; the shell
// evaluates `window.dispatchEvent(new CustomEvent(SHELL_EVENT, { detail: encode(msg) }))` in
// the page. The shell identifies itself through the WebView's injected object
// (`window.ReactNativeWebView.injectedObjectJson()`), which exists before any page script
// runs on both platforms, so src/platform/shell.ts can install its adapters at startup.
//
// Everything carried here is a reflex the phone provides locally (speech, haptics). No
// message ever carries a medical instruction the shell could alter: the text of a `speak`
// is already the engine's canonical line by the time it reaches the bridge (CLAUDE.md, 1).

export const BRIDGE_VERSION = 1 as const;

/** DOM event name the shell dispatches on `window` to deliver a ShellToWeb message. */
export const SHELL_EVENT = 'mayday:shell' as const;

export type ShellPlatform = 'ios' | 'android';

/** What the shell injects into the page: enough for the page to adapt and to label the debug footer. */
export interface ShellInfo {
  bridge: typeof BRIDGE_VERSION;
  platform: ShellPlatform;
  /** The shell app's own version. */
  version: string;
}

/** Page -> shell. */
export type WebToShell =
  | { type: 'ready'; bridge: typeof BRIDGE_VERSION }
  | { type: 'speak'; id: number; text: string; lang: string; rate: number }
  | { type: 'cancelSpeech' }
  | { type: 'vibrate'; pattern: readonly number[] };

/** Shell -> page. */
export type ShellToWeb =
  | { type: 'speechStart'; id: number }
  | { type: 'speechEnd'; id: number; reason: 'done' | 'cancelled' | 'error' };

export function encode(msg: WebToShell | ShellToWeb): string {
  return JSON.stringify(msg);
}

/** Parses a message off the wire; null for anything that is not one of ours. */
export function decode<T extends WebToShell | ShellToWeb>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof (parsed as { type?: unknown }).type !== 'string') return null;
    return parsed as T;
  } catch {
    return null;
  }
}
