// Dev-only phone trace. With `?trace=1` the page posts what the session sees to the dev
// server's /__trace sink (vite.config.ts), which prints each line under [trace]: the mic
// chip's status and error codes, every recognizer event by name, transcripts, whether the
// app is speaking, the camera status and any JS error. It exists so a phone can be debugged
// from the laptop; without the flag nothing here runs, and with it nothing the app does
// changes. Owned by P4 (docs/07).
import type { Session, SessionSnapshot } from './session';

type Line = Record<string, unknown>;

const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('trace');
const t0 = Date.now();
let queue: Line[] = [];
let timer: number | null = null;

export function traceRequested(): boolean {
  return enabled;
}

function flush(): void {
  timer = null;
  if (queue.length === 0) return;
  const body = queue.map((l) => JSON.stringify(l)).join('\n');
  queue = [];
  try {
    void fetch('/__trace', { method: 'POST', headers: { 'content-type': 'text/plain' }, body, keepalive: true }).catch(() => {});
  } catch {
    // Diagnostics never break the app.
  }
}

export function trace(line: Line): void {
  if (!enabled) return;
  queue.push({ ms: Date.now() - t0, ...line });
  if (timer === null) timer = window.setTimeout(flush, 300);
}

/** The listener's per-event hook (VoiceInOptions.onEvent), handed to the session as `micTrace`. */
export function micTrace(name: string, detail?: string): void {
  trace(detail === undefined ? { kind: 'mic', name } : { kind: 'mic', name, detail });
}

const WATCHED = ['phase', 'stateKey', 'listening', 'listenError', 'speaking', 'lastHeard', 'lastKeyword', 'callActive'] as const satisfies readonly (keyof SessionSnapshot)[];

function tts(): Line | undefined {
  if (!('speechSynthesis' in window)) return undefined;
  return { speaking: speechSynthesis.speaking, pending: speechSynthesis.pending, paused: speechSynthesis.paused };
}

export function installTrace(session: Session): () => void {
  if (!enabled) return () => {};
  const nav = navigator as Navigator & { standalone?: boolean };
  trace({
    kind: 'hello',
    ua: navigator.userAgent,
    standalone: nav.standalone === true,
    visibility: document.visibilityState,
    secure: window.isSecureContext,
    recognizer: 'SpeechRecognition' in window ? 'SpeechRecognition' : 'webkitSpeechRecognition' in window ? 'webkitSpeechRecognition' : 'none',
    synthesis: 'speechSynthesis' in window,
  });
  const onError = (e: ErrorEvent) => trace({ kind: 'jserror', message: e.message, at: `${e.filename}:${e.lineno}` });
  const onRejection = (e: PromiseRejectionEvent) => trace({ kind: 'rejection', reason: String(e.reason) });
  const onVisibility = () => trace({ kind: 'visibility', state: document.visibilityState });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('visibilitychange', onVisibility);

  let last: Line = {};
  let logged = 0;
  const unsubscribe = session.subscribe(() => {
    const snap = session.snapshot();
    const changed: Line = {};
    for (const k of WATCHED) if (snap[k] !== last[k]) changed[k] = snap[k];
    if (snap.eyes.status !== last.eyes) changed.eyes = snap.eyes.status;
    if (Object.keys(changed).length > 0) {
      if ('speaking' in changed) changed.tts = tts();
      trace({ kind: 'snap', ...changed });
      last = { ...last, ...changed };
      delete last.tts;
    }
    const entries = session.log.entries();
    for (; logged < entries.length; logged++) {
      const e = entries[logged];
      if (e.kind !== 'metric') trace({ kind: 'log', k: e.kind, d: e.detail });
    }
  });
  // A heartbeat, so a state that never changes (a mic stuck on "speaking") is still visible.
  const beat = window.setInterval(() => {
    const snap = session.snapshot();
    trace({ kind: 'beat', listening: snap.listening, speaking: snap.speaking, tts: tts(), eyes: snap.eyes.status, fps: snap.eyes.fps });
  }, 5000);
  return () => {
    unsubscribe();
    window.clearInterval(beat);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    document.removeEventListener('visibilitychange', onVisibility);
    flush();
  };
}
