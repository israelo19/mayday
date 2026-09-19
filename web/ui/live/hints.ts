// Pure helpers for the live screen's two small judgement calls: what to say when the mic is
// off, and whether triage is still in its camera-first opening. No React, no DOM, so they are
// unit-tested; LiveApp.tsx passes in what it read from the browser. Owned by P4 (docs/07).

export type Platform = {
  /** iOS Safari's `navigator.standalone`: the page runs from the home-screen icon. */
  standalone: boolean;
  iOS: boolean;
};

/**
 * The mic chip's label while the recognizer is off. The recognizer's error code is the
 * evidence; the label names the fix a person can actually do, because "service-not-allowed"
 * on a phone under stage lights helps nobody. WebKit sends that code from the OS speech
 * service (Siri & Dictation off, the privacy toggle denied, no network for the recognizer),
 * and iOS exposes no recognizer at all to a home-screen app.
 */
export function voiceOffLabel(code: string | null, platform: Platform, supported = true): string {
  if (platform.iOS && platform.standalone) return 'Voice off in the home-screen app. Open this page in Safari for voice.';
  if (!supported) return 'Voice not supported here. Use the buttons.';
  switch (code) {
    case 'service-not-allowed':
      return platform.iOS ? 'Voice off. Turn on Siri & Dictation in Settings, then tap.' : 'Voice off. Speech service refused, tap to retry.';
    case 'not-allowed':
      return 'Voice off. Allow the microphone, then tap.';
    case 'network':
      return 'Voice off. Speech needs internet, tap to retry.';
    case 'audio-capture':
      return 'Voice off. No microphone found, tap to retry.';
    case null:
      return 'Voice off, tap to retry.';
    default:
      return `Voice off (${code}), tap to retry.`;
  }
}

/** How long triage stays camera-first before the question card and buttons come up. */
export const TRIAGE_LOOK_MS = 3000;
/** With a frame out to the scene model, the look may run this long before the card comes up anyway. */
export const TRIAGE_LOOK_MAX_MS = 7000;

export type LookInput = {
  phase: string;
  /** The eyes chip's status: only a camera that exists gets a look. */
  eyesStatus: 'off' | 'starting' | 'watching' | 'blind' | 'error';
  /** A suggestion (from the camera or the mic) ends the look: there is something to answer. */
  suggestion: boolean;
  /** The person tapped the look card. */
  revealed: boolean;
  /** A frame is with the scene model; its answer is worth a short wait. */
  assessing?: boolean;
  /** Milliseconds since triage was entered. */
  sinceMs: number;
};

/**
 * True while triage should show the camera and a "looking" card instead of the question and
 * its buttons: the person-down detector needs two seconds of a still pose (docs/03), and the
 * spoken prompt takes about that long, so the eyes get their look before the thumbs do. A
 * tap, a suggestion, a missing camera, or the timer all end it.
 */
export function isLooking(i: LookInput): boolean {
  if (i.phase !== 'triage' || i.revealed || i.suggestion) return false;
  if (i.eyesStatus === 'off' || i.eyesStatus === 'error') return false;
  if (i.assessing && i.sinceMs < TRIAGE_LOOK_MAX_MS) return true;
  return i.sinceMs < TRIAGE_LOOK_MS;
}
