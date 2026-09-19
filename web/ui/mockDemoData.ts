// Placeholder content for the screens (docs/05 + the design proposal, see DECISIONS.md) until
// web/session.ts can drive them from a real Engine/EventLog (P2, not built yet). Owned by P4.
// Delete this file once session.ts replaces it -- the screen components take these same shapes
// as props either way.

export type MockCoachStep =
  | { kind: 'diagram'; line: string; caption: string; nextLabel: string }
  | { kind: 'ring'; line: string; count: number; total: number; rateBpm: number; pace: string };

/** Stands in for a stream of CoachingEvent-driven state changes (src/types.ts). */
export const MOCK_COACH_STEPS: MockCoachStep[] = [
  { kind: 'diagram', line: 'Kneel beside them. Place the heel of one hand right on the marker, center of the chest.', caption: 'Hand placement', nextLabel: 'Begin compressions' },
  { kind: 'ring', line: "Keep going, you're doing great. 2 rescue breaths after this cycle.", count: 24, total: 30, rateBpm: 112, pace: 'good pace' },
  { kind: 'ring', line: 'Push a little faster to get into range.', count: 30, total: 30, rateBpm: 96, pace: 'a bit slow' },
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
  callPrep: {
    location: '1400 N Charles St, Baltimore, MD 21218',
    situation: 'Adult male, collapsed, unresponsive. Not breathing normally -- suspected cardiac arrest.',
    actionsTaken: 'CPR guidance in progress since 0:14, app-coached compressions.',
  },
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
