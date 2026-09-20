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
/**
 * The longest the look card waits on a camera that has not answered. Past this the question
 * and its three buttons come up regardless, because audio-and-buttons is the floor the app
 * promises (CLAUDE.md principle 4) and a permission sheet must never sit below it.
 */
export const CAMERA_WAIT_MAX_MS = 12000;

export type LookInput = {
  phase: string;
  /** The eyes chip's status: only a camera that exists gets a look. */
  eyesStatus: 'off' | 'starting' | 'awaiting' | 'watching' | 'blind' | 'error';
  /** A suggestion (from the camera or the mic) ends the look: there is something to answer. */
  suggestion: boolean;
  /** The person tapped the look card. */
  revealed: boolean;
  /** A frame is with the scene model; its answer is worth a short wait. */
  assessing?: boolean;
  /**
   * Milliseconds since the camera settled, not since the tap. Behind an unanswered permission
   * sheet the two are wildly different, and the sheet is exactly when the person is not looking
   * at our screen. See `SessionSnapshot.eyesReadyAt`.
   */
  sinceMs: number;
  /** Milliseconds since triage was entered, which is the tap. Only the ceiling uses it. */
  sinceTriageMs: number;
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
  // The camera has not answered yet: hold the look card rather than count a window down
  // against a model download or a permission sheet, which is what used to put the question
  // card up before the eyes had opened. The ceiling is the safety valve: a sheet nobody
  // answers must not keep the three buttons off the screen for the rest of the emergency.
  if (i.eyesStatus === 'starting' || i.eyesStatus === 'awaiting') return i.sinceTriageMs < CAMERA_WAIT_MAX_MS;
  if (i.assessing && i.sinceMs < TRIAGE_LOOK_MAX_MS) return true;
  return i.sinceMs < TRIAGE_LOOK_MS;
}
