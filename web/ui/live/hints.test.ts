import { describe, expect, it } from 'vitest';
import { CAMERA_WAIT_MAX_MS, TRIAGE_LOOK_MAX_MS, TRIAGE_LOOK_MS, isLooking, voiceOffLabel } from './hints';

const phone = { iOS: true, standalone: false };
const homeScreen = { iOS: true, standalone: true };
const laptop = { iOS: false, standalone: false };

describe('voiceOffLabel', () => {
  it('names the iPhone fix for the OS speech service refusing', () => {
    expect(voiceOffLabel('service-not-allowed', phone)).toMatch(/Siri & Dictation/);
  });

  it('sends a home-screen iPhone app back to Safari, whatever the code', () => {
    expect(voiceOffLabel('service-not-allowed', homeScreen)).toMatch(/Safari/);
    expect(voiceOffLabel(null, homeScreen)).toMatch(/Safari/);
  });

  it('asks for the microphone when that is what was refused', () => {
    expect(voiceOffLabel('not-allowed', laptop)).toMatch(/microphone/);
  });

  it('says the buttons carry it when there is no recognizer', () => {
    expect(voiceOffLabel(null, laptop, false)).toMatch(/buttons/);
  });

  it('keeps an unknown code visible so a teammate can look it up', () => {
    expect(voiceOffLabel('bad-grammar', laptop)).toContain('bad-grammar');
  });
});

describe('isLooking', () => {
  const base = { phase: 'triage', eyesStatus: 'watching' as const, suggestion: false, revealed: false, sinceMs: 0, sinceTriageMs: 0 };

  it('holds the card back while the camera has its look', () => {
    expect(isLooking(base)).toBe(true);
    expect(isLooking({ ...base, sinceMs: TRIAGE_LOOK_MS - 1 })).toBe(true);
    expect(isLooking({ ...base, sinceMs: TRIAGE_LOOK_MS })).toBe(false);
  });

  it('ends on a tap or a suggestion', () => {
    expect(isLooking({ ...base, revealed: true })).toBe(false);
    expect(isLooking({ ...base, suggestion: true })).toBe(false);
  });

  it('never happens without a camera, or outside triage', () => {
    expect(isLooking({ ...base, eyesStatus: 'error' })).toBe(false);
    expect(isLooking({ ...base, eyesStatus: 'off' })).toBe(false);
    expect(isLooking({ ...base, phase: 'coaching' })).toBe(false);
  });

  it('waits a little longer while a frame is with the scene model, but not forever', () => {
    expect(isLooking({ ...base, sinceMs: TRIAGE_LOOK_MS + 500, assessing: true })).toBe(true);
    expect(isLooking({ ...base, sinceMs: TRIAGE_LOOK_MAX_MS, assessing: true })).toBe(false);
    expect(isLooking({ ...base, sinceMs: TRIAGE_LOOK_MS + 500, assessing: false })).toBe(false);
  });

  it('still looks while the camera is starting or sees nobody yet', () => {
    expect(isLooking({ ...base, eyesStatus: 'starting' })).toBe(true);
    expect(isLooking({ ...base, eyesStatus: 'blind' })).toBe(true);
  });

  // The regression the whole permission investigation turned on: the look window used to be
  // measured from the tap, so a person reading a permission sheet for four seconds came back
  // to the question card sitting over a camera that had never opened.
  it('does not spend the look window on a camera that has not answered yet', () => {
    const waiting = { ...base, eyesStatus: 'awaiting' as const };
    expect(isLooking({ ...waiting, sinceMs: TRIAGE_LOOK_MS + 1, sinceTriageMs: TRIAGE_LOOK_MS + 1 })).toBe(true);
    expect(isLooking({ ...waiting, sinceMs: TRIAGE_LOOK_MAX_MS + 1, sinceTriageMs: TRIAGE_LOOK_MAX_MS + 1 })).toBe(true);
    // ...and the same for a model still downloading, which is the other slow, variable wait.
    expect(isLooking({ ...base, eyesStatus: 'starting', sinceMs: TRIAGE_LOOK_MS + 1, sinceTriageMs: TRIAGE_LOOK_MS + 1 })).toBe(true);
  });

  it('gives up waiting on the camera rather than keep the buttons off the screen', () => {
    const waiting = { ...base, eyesStatus: 'awaiting' as const };
    expect(isLooking({ ...waiting, sinceTriageMs: CAMERA_WAIT_MAX_MS - 1 })).toBe(true);
    expect(isLooking({ ...waiting, sinceTriageMs: CAMERA_WAIT_MAX_MS })).toBe(false);
    expect(isLooking({ ...base, eyesStatus: 'starting', sinceTriageMs: CAMERA_WAIT_MAX_MS })).toBe(false);
  });

  it('a tap still beats every wait', () => {
    expect(isLooking({ ...base, eyesStatus: 'awaiting', revealed: true })).toBe(false);
  });

  it('once the camera has answered, the window runs from that answer', () => {
    // sinceMs is measured from eyesReadyAt, so a long wait for permission does not eat it.
    expect(isLooking({ ...base, sinceMs: 0, sinceTriageMs: 60_000 })).toBe(true);
    expect(isLooking({ ...base, sinceMs: TRIAGE_LOOK_MS, sinceTriageMs: 60_000 })).toBe(false);
  });
});
