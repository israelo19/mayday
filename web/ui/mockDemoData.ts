// Placeholder content for the screens (docs/05 + the design proposal, see DECISIONS.md) until
// web/session.ts can drive them from a real Engine/EventLog (P2, not built yet). Owned by P4.
// Delete this file once session.ts replaces it -- the screen components take these same shapes
// as props either way. Cardiac and bleeding text below is copied verbatim from docs/02's
// already-cited machine data (AHA Hands-Only CPR; Stop the Bleed + ACS) -- not authored here,
// per CLAUDE.md principle 1: no line in this file is new medical guidance, only re-typed data
// that already exists in docs/02, standing in for the real engine reading that same data.

/** Secondary branching buttons, borrowed pattern (see DECISIONS.md): report something without
 * leaving the current step, distinct from NEXT's linear advance. Mock only -- once the real
 * engine exists these become availableTransitions() entries, not free text.
 * 'advance' = docs/02's next state (e.g. bleeding pressure -> pack); 'handoff' = docs/02's
 * "ambulance here"/"paramedics" transition, real machines in both cardiac and bleeding;
 * 'restart' = demo-only reset, not in docs/02. */
export type MockBranch = { label: string; onSelect: 'advance' | 'restart' | 'handoff' };

export type MockCoachStep =
  | { kind: 'diagram'; line: string; caption: string; nextLabel: string; branches?: MockBranch[] }
  | { kind: 'ring'; line: string; count: number; total: number; rateBpm: number; pace: string; branches?: MockBranch[] }
  | { kind: 'pressure'; line: string; nextLabel: string; branches?: MockBranch[] };

/** docs/02 MACHINE: cardiac (Hands-Only CPR, adult). Source: AHA Hands-Only CPR guidance,
 * heart.org (docs/02 line 25). Real `compressions` is ONE continuous state -- coaching rules
 * fire repeatedly off live rate/recoil, not a paginated script -- exiting only on keyword
 * 'ambulance here'/'paramedics' or the always-available manual override (docs/02 line 11, 44).
 * These two mock steps stand in for that one state; CoachScreen wires the real exit keywords. */
export const MOCK_CARDIAC_STEPS: MockCoachStep[] = [
  {
    kind: 'diagram',
    line: 'Kneel beside them. Place the heel of one hand right on the marker, center of the chest.',
    caption: 'Hand placement',
    nextLabel: 'Begin compressions',
  },
  {
    kind: 'ring',
    line: 'Push hard and fast, at least two inches deep. Follow my beat. Do not stop.',
    count: 24,
    total: 30,
    rateBpm: 112,
    pace: 'good pace',
    branches: [{ label: 'Ambulance here', onSelect: 'handoff' }],
  },
  {
    kind: 'ring',
    line: "You're doing it. Keep going. If someone else is there, switch now and keep the rhythm.",
    count: 30,
    total: 30,
    rateBpm: 96,
    pace: 'a bit slow',
    branches: [{ label: 'Ambulance here', onSelect: 'handoff' }],
  },
];

/** docs/02 MACHINE: bleeding. Source: Stop the Bleed (stopthebleed.org) + ACS bleeding control
 * basics (docs/02 line 48, marked "verify and cite" -- not yet checked against the live source,
 * same caveat the docs carry). */
export const MOCK_BLEEDING_STEPS: MockCoachStep[] = [
  {
    kind: 'diagram',
    line: "First: are YOU safe? If the danger is still there, do not approach. Move to safety and tell me when it's safe.",
    caption: 'Scene safety',
    nextLabel: "It's safe",
  },
  {
    kind: 'diagram',
    line: 'Find where the blood is coming from. Open or cut clothing so you can see the wound.',
    caption: 'Find the wound',
    nextLabel: 'Found it',
  },
  {
    kind: 'pressure',
    line: 'Take cloth if you have it. Press it hard onto the wound with both hands. Push down with your full body weight. Do not lift your hands to look. Do not stop.',
    nextLabel: 'NEXT',
    branches: [
      { label: 'Blood soaking through', onSelect: 'advance' },
      { label: 'Ambulance here', onSelect: 'handoff' },
    ],
  },
  {
    kind: 'pressure',
    line: 'Do not remove the soaked cloth. Add more cloth on top and keep pressing. If the wound is deep, push the cloth INTO the wound and keep pressure on it.',
    nextLabel: 'NEXT',
    branches: [{ label: 'Ambulance here', onSelect: 'handoff' }],
  },
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
