// Placeholder content for the four screens (docs/05) until web/session.ts can drive them from
// a real Engine/EventLog (P2, not built yet). Owned by P4. Delete this file once session.ts
// replaces it — the screen components take these same shapes as props either way.

export type MockCoachStep = { line: string; metricLabel: string; metricValue: string };

/** Stands in for a stream of CoachingEvent-driven state changes (src/types.ts). */
export const MOCK_COACH_STEPS: MockCoachStep[] = [
  { line: 'Check for a response. Tap the shoulder and shout "Are you okay?"', metricLabel: 'STATE', metricValue: 'Check response' },
  { line: 'No response, not breathing normally. Call 911 and start CPR.', metricLabel: 'STATE', metricValue: 'Scene safety' },
  { line: 'Push hard and fast in the center of the chest, about 2 inches deep.', metricLabel: 'RATE', metricValue: '-- bpm' },
  { line: "Good, keep going. Push to the beat, and don't stop.", metricLabel: 'RATE', metricValue: '108 bpm' },
];

export type MockTimelineEntry = { t: number; label: string };

/** Stands in for EventLog entries (src/sitrep, P2) rendered oldest-first, t in seconds. */
export const MOCK_TIMELINE: MockTimelineEntry[] = [
  { t: 0, label: 'Scene safety confirmed' },
  { t: 15, label: 'CPR started' },
  { t: 90, label: 'Rate corrected to 110 bpm' },
];

/** Stands in for the Sitrep type buildSitrep() will return (docs/07 seam). */
export const MOCK_SITREP = {
  sayToDispatcher: {
    location: 'Location pending (Geolocation API, requested when CPR starts)',
    emergency: 'Adult male, unresponsive, not breathing normally',
    status: 'Bystander CPR in progress, started 2 minutes ago',
  },
  timeline: MOCK_TIMELINE,
};

/** Stands in for the HandoffReport type buildHandoff() will return (docs/07 seam). */
export const MOCK_HANDOFF = {
  cprStartedAt: '10:42:03 AM',
  avgRateBpm: 109,
  pauses: 2,
  longestPauseSec: 6,
  pressureTimeSec: null as number | null,
  timeline: MOCK_TIMELINE,
};
