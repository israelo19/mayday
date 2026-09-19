// Core types, from docs/01-architecture.md. Owned by P2 (see docs/07); changes are announced before they land.

// ---------------------------------------------------------------------------
// Perception -> engine
// ---------------------------------------------------------------------------

// Facts are measurements, never advice.
export type PerceptionFacts = {
  t: number; // ms epoch
  poseConfidence: number; // 0..1, min visibility across used landmarks
  compressionRate: number | null; // per minute, sliding 10s window
  compressionActive: boolean; // oscillation detected in last 2s
  recoilRatio: number | null; // 0..1, trough return quality proxy
  handsOnRegion: boolean | null; // bleeding module: hands within wound ROI
  handsOffMs: number | null; // continuous ms hands have been off ROI
  /**
   * What the camera sees before anyone is coached, for triage only: a person lying still.
   * A cue, never a route; the session asks and the human confirms (docs/03 "Scene hint").
   */
  sceneHint?: SceneHint | null;
};

export type SceneHint = 'person_down';

/** Below this, perception is not trustworthy and the engine coaches by voice alone (docs/03). */
export const BLIND_CONFIDENCE = 0.5;

// ---------------------------------------------------------------------------
// Engine -> voice
// ---------------------------------------------------------------------------

export type CoachingPriority = 'critical' | 'correction' | 'narration';

export type CoachingEvent = {
  priority: CoachingPriority;
  text: string; // canonical line from the state machine
  stateId: string;
  dedupeKey?: string; // e.g. 'rate-low' so we can rate-limit nags
  /** The voice queue drops a repeat of the same dedupeKey inside this window (docs/04). */
  cooldownMs?: number;
  /**
   * Timestamp of the fact that triggered this, so P3 can measure fact-to-audible latency. The
   * engine always sets it; voice-internal lines (read-aloud, dispatcher) and the guide gallery's
   * demo events do not, and the queue falls back to the newest fact it was told about.
   */
  t?: number;
};

// ---------------------------------------------------------------------------
// Event log -> SITREP
// ---------------------------------------------------------------------------

export type EventKind = 'state_enter' | 'metric' | 'coach' | 'user' | 'system';

/** Machine-readable twin of `detail`, so the SITREP builder never parses prose. */
export type EventData =
  | { type: 'state_enter'; machineId: string; stateId: string }
  | {
      type: 'metric';
      rate: number | null;
      compressionActive: boolean;
      handsOnRegion: boolean | null;
      poseConfidence: number;
      blind: boolean;
    }
  | { type: 'coach'; priority: CoachingPriority; dedupeKey?: string };

export type EventLogEntry = {
  t: number;
  kind: EventKind;
  detail: string; // human-readable, goes into handoff report
  data?: EventData;
};

// ---------------------------------------------------------------------------
// Protocol machines (pure data, docs/02)
// ---------------------------------------------------------------------------

/** Everything a rule may look at besides the facts themselves. */
export type RuleContext = {
  /** Perception is not trustworthy right now: low confidence, stale, or never started. */
  blind: boolean;
  /** Time since the current state was entered. */
  inStateMs: number;
};

export type FactPredicate = (f: PerceptionFacts, ctx: RuleContext) => boolean;

/**
 * A coaching rule fires while its state is active. `id` doubles as the dedupe key, so it is
 * unique within a state and shared across states on purpose when the nag is the same.
 */
export type Rule = {
  id: string;
  when: FactPredicate;
  say: string;
  priority: CoachingPriority;
  /** `when` must hold continuously for this long before the rule fires. */
  forMs?: number;
  /** Fire on this period while `when` holds, instead of once (e.g. the 120s swap reminder). */
  everyMs?: number;
  /** Minimum gap between two firings of this id, anywhere. Default 6000. */
  cooldownMs?: number;
  /** Skipped unless every listed fact is non-null, so a missing measurement never coaches. */
  requires?: (keyof PerceptionFacts)[];
  /** Only rules marked safe may fire while blind; everything else is suppressed. */
  blindSafe?: boolean;
  /** Log kind for this line. Blind lines are spoken as critical but logged as system (docs/07). */
  logKind?: EventKind;
};

export type Trigger =
  | { kind: 'keyword'; keyword: string }
  | { kind: 'timerMs'; ms: number }
  | { kind: 'fact'; predicate: FactPredicate }
  | { kind: 'manualAdvance' };

export type Transition = {
  on: Trigger;
  /** `stateId` in this machine, or `machineId.stateId` to cross machines. */
  to: string;
  /** Button text. Every keyword transition gets a button twin (docs/05). */
  label: string;
};

/** A keyword the machine answers without changing state, e.g. 'tourniquet' (docs/02). */
export type KeywordResponse = {
  keyword: string;
  say: string;
  priority: CoachingPriority;
  source: string;
};

export type State = {
  id: string;
  say: string[];
  /** Beats per minute while in this state. Absent stops the metronome. */
  metronome?: number;
  coachingRules?: Rule[];
  transitions: Transition[];
  /** Words a paraphrase must keep, or the canonical line is spoken instead (docs/04). */
  requiredWords?: string[];
  /** URL of the guideline this text was transcribed from. */
  source: string;
  /** End of the machine. Exempt from the linter's manual-advance rule. */
  terminal?: boolean;
  /** Show the CALL 911 button prominently on this state. */
  call911?: boolean;
};

export type Machine = {
  id: string;
  /** Guideline this machine was transcribed from. */
  source: string;
  /** Medical machines must cite a URL on every state. Triage only routes. */
  medical: boolean;
  initial: string;
  states: State[];
  keywordResponses?: KeywordResponse[];
  /** Ships as data with detection disabled (choking). */
  enabled?: boolean;
};

// ---------------------------------------------------------------------------
// SITREP and handoff
// ---------------------------------------------------------------------------

/** `address` arrives later than lat/lon (reverse geocoding is a second, non-blocking network
 * round trip, web/geocode.ts) and is optional: readAloud() falls back to coordinates if it
 * never resolves, per "fail loud, never wrong" -- a wrong address is worse than none. */
export type GeoFix = { lat: number; lon: number; accuracyM?: number; address?: string };

export type SitrepMetrics = {
  cprStartedAt: number | null;
  averageRate: number | null;
  compressionPauses: number; // pauses longer than 10s
  longestPauseMs: number;
  continuousPressureMs: number; // longest unbroken hands-on-wound stretch
  totalPressureMs: number;
  /** Time perception could not see. Never reported as a pause; saying so would be a false claim. */
  unmeasuredMs: number;
};

export type Sitrep = {
  t: number;
  location: GeoFix | null;
  emergency: string;
  startedAt: number | null;
  elapsedMs: number;
  currentState: string;
  metrics: SitrepMetrics;
  /** Lines the bystander reads to the dispatcher, in order. */
  readAloud: string[];
  timeline: readonly EventLogEntry[];
};

export type HandoffReport = {
  generatedAt: number;
  emergency: string;
  startedAt: number | null;
  durationMs: number;
  location: GeoFix | null;
  metrics: SitrepMetrics;
  headline: string[];
  timeline: readonly EventLogEntry[];
};
