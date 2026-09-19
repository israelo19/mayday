// Core types, from docs/01-architecture.md. Owned by P2 (see docs/07); changes are announced before they land.

// Facts are measurements, never advice.
export type PerceptionFacts = {
  t: number; // ms epoch
  poseConfidence: number; // 0..1, min visibility across used landmarks
  compressionRate: number | null; // per minute, sliding 10s window
  compressionActive: boolean; // oscillation detected in last 2s
  recoilRatio: number | null; // 0..1, trough return quality proxy
  handsOnRegion: boolean | null; // bleeding module: hands within wound ROI
  handsOffMs: number | null; // continuous ms hands have been off ROI
};

export type CoachingEvent = {
  priority: 'critical' | 'correction' | 'narration';
  text: string; // canonical line from the state machine
  stateId: string;
  dedupeKey?: string; // e.g. 'rate-low' so we can rate-limit nags
};

export type EventLogEntry = {
  t: number;
  kind: 'state_enter' | 'metric' | 'coach' | 'user' | 'system';
  detail: string; // human-readable, goes into handoff report
};
