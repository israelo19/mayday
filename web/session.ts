// The session orchestrator, docs/07 P4 task 2 and docs/08-protocol-integration.md. It is the
// only place perception, the protocol engine, the voice module and the event log meet:
//
//   perception facts  ->  engine.onFacts  ->  coaching events  ->  voice queue
//   mic keywords      ->  engine.onKeyword ->  state changes    ->  lines, metronome, camera mode
//   engine log        ->  event log       ->  SITREP, handoff report
//
// It owns the two things the engine deliberately does not: the clock (engine.tick every 100 ms)
// and the camera mode (hands are tracked only while a bleeding state needs them). It never
// decides what to say: every spoken line comes out of the machine data, and the few lines that
// originate here are about the phone and the camera, never about the patient.
// Lives in web/ because it owns the clock, geolocation and the DOM; src/ stays the engine.
// Zero network calls. Owned by P4 (docs/07); built by P1 on the `listen` branch.
import type { CoachingEvent, GeoFix, HandoffReport, PerceptionFacts, SceneAssessment, Sitrep, State } from '../src/types';
import type { SceneAssessor } from '../src/ai/assess';
import { ASSESS_FRAME_PX } from '../src/ai/assess';
import type { IntentMatch, IntentRouter } from '../src/ai/intent';
import type { DispatcherSim } from '../src/ai/dispatcher';
import type { Perception, RoiState } from '../src/perception';
import { GUIDANCE } from '../src/perception';
import type { Voice, VoiceInStatus } from '../src/voice';
import { ASSESSMENT_HINTS, confirmLine, CONFIRM_WORDS, createEngine, machines, matchKeyword, REJECT_WORDS, routeKeyword, SCENE_HINTS, STALE_FACTS_MS, suggestRoute, TRIAGE_ROUTES, type Engine } from '../src/protocol';
import { buildHandoff, buildSitrep, createEventLog, handoffQrPayload, qrDataUrl, type EventLog } from '../src/sitrep';

export type SessionPhase = 'idle' | 'triage' | 'coaching' | 'handoff';

/** A route the app thinks it heard but no keyword matched; entered only on yes, by its keyword. */
export type RouteSuggestion = { label: string; keyword: string; to: string; heard: string; source: 'voice' | 'camera' | 'model' };

/** 'scripted' is the offline call-taker; the rest are the ElevenLabs agent's states (docs/04 item 3). */
export type DispatcherStatus = 'scripted' | 'connecting' | 'live' | 'fallback' | 'ended';
export type DispatcherLine = { who: 'dispatcher' | 'you'; text: string };

/** How the session obtains its dispatcher: the scripted one from the voice module, or a flagged wrapper around it. */
export type DispatcherFactory = (
  scripted: DispatcherSim,
  hooks: { onStatus: (s: Exclude<DispatcherStatus, 'scripted'>) => void; onTranscript: (t: string) => void },
) => { dispatcher: DispatcherSim; status: DispatcherStatus };

/** A button that does exactly what saying its keyword does (docs/05: every voice path has a twin). */
export type ButtonTwin = { label: string; keyword: string; to: string };

/**
 * What the camera is doing right now, for the screen: `error` is a refused or missing camera,
 * `blind` is a running camera that cannot see a rescuer (docs/03 confidence gate).
 */
export type EyesStatus = 'off' | 'starting' | 'watching' | 'blind' | 'error';
export type Eyes = {
  status: EyesStatus;
  /** Frames processed in the last second; 0 until the loop runs. */
  fps: number;
  /** A rescuer's shoulders are being measured. */
  rescuer: boolean;
  /** Wound-region tracking state while a bleeding state has it on, else null. */
  hands: RoiState | null;
  /** The last thing the camera did on its own (a `fact` transition), shown briefly. */
  saw: string | null;
  /** Why the camera is off, when it is. */
  error: string | null;
};

export type SessionSnapshot = {
  phase: SessionPhase;
  machineId: string | null;
  machineLabel: string;
  stateId: string | null;
  /** `machine.state`, the key the step guides use. */
  stateKey: string | null;
  /** The current state's canonical lines, in spoken order. */
  lines: readonly string[];
  /** The line the voice is on, or has most recently finished. */
  lineIndex: number;
  /** When the current state was entered (session clock), so the screen can shrink a read card. */
  stateEnteredAt: number;
  /** The app itself is talking; the mic is muted for echo while this is true (docs/09). */
  speaking: boolean;
  twins: readonly ButtonTwin[];
  canAdvance: boolean;
  call911: boolean;
  metronomeBpm: number | null;
  /** performance.now() when the metronome last started, so pictures can land on the beat. */
  beatOriginMs: number;
  facts: PerceptionFacts | null;
  /** The latest critical or correction for this state, cleared on state change or after a while. */
  coaching: CoachingEvent | null;
  blind: boolean;
  eyes: Eyes;
  /** Camera guidance the session is currently showing (spoken only in watching states). */
  guidance: string | null;
  listening: VoiceInStatus;
  /** The recognizer's last error code ('not-allowed', 'network', ...), so the chip can say why the mic is off. */
  listenError: string | null;
  suggestion: RouteSuggestion | null;
  /** The scene model's latest answer this triage, for the screen (docs/04 item 7). */
  assessment: SceneAssessment | null;
  /** A frame is with the scene model right now. */
  assessing: boolean;
  lastHeard: string | null;
  lastHeardAt: number;
  lastKeyword: string | null;
  callActive: boolean;
  dispatcherStatus: DispatcherStatus;
  dispatcherLines: readonly DispatcherLine[];
  sitrep: Sitrep | null;
  handoff: HandoffReport | null;
  geo: GeoFix | null;
  startedAt: number | null;
};

export interface Session {
  /** Call inside the tap that starts help: unlocks audio, starts triage, starts listening. */
  start(): void;
  stop(): void;
  /** Begin again from triage with an empty log. */
  restart(): void;
  /** The NEXT button. */
  advance(): void;
  /** A button twin: exactly what hearing the keyword does. */
  say(keyword: string): void;
  /** A transcript from anywhere but the mic (a typed test line); routed like speech. */
  heard(transcript: string): void;
  /** Jump to the current machine's terminal state, e.g. the ambulance arrived. */
  finish(): void;
  /** "Sounds like choking. Yes?" The yes: enters the suggested route by its first keyword. */
  confirmSuggestion(): void;
  rejectSuggestion(): void;
  /** Open the SIMULATED dispatcher. Never a real line (CLAUDE.md principle 5). */
  call911(): void;
  replyToDispatcher(text: string): void;
  hangUp(): void;
  /** Start listening again from inside a tap: iOS refuses recognition that did not start in a user gesture. */
  retryListening(): void;
  readSitrepAloud(): void;
  /** Data URL of the handoff QR, or null when the encoder is unavailable. */
  qr(): Promise<string | null>;
  snapshot(): SessionSnapshot;
  subscribe(cb: () => void): () => void;
  readonly engine: Engine;
  readonly log: EventLog;
}

export type SessionDeps = {
  perception: Perception;
  voice: Voice;
  engine?: Engine;
  log?: EventLog;
  now?: () => number;
  /** Test seam: replaces setInterval; returns a cancel function. */
  interval?: (fn: () => void, ms: number) => () => void;
  geolocate?: () => Promise<GeoFix | null>;
  /** Turns the coordinate fix into a street address for readAloud(). Defaults to a no-op so
   * this file's own code stays true to "zero network calls" (line 13); the real implementation
   * (web/geocode.ts, a Nominatim fetch) is injected from LiveApp.tsx, same as `dispatcher`. */
  reverseGeocode?: (lat: number, lon: number) => Promise<string | null>;
  vibrate?: (ms: number) => void;
  /** Defaults to the voice module's scripted call-taker. */
  dispatcher?: DispatcherFactory;
  /** Diagnostics only (web/trace.ts): every recognizer event, by name. Never routes. */
  micTrace?: (name: string, detail?: string) => void;
  /** One frame to a scene model in triage (docs/04 item 7). Absent: the camera's own cues only. */
  assessor?: SceneAssessor;
  /** A missed sentence to a text model (docs/04 item 8). Absent: the local phrase cues only. */
  router?: IntentRouter;
};

export const MACHINE_LABEL: Record<string, string> = {
  triage: 'What happened?',
  cardiac: 'CPR',
  bleeding: 'Severe bleeding',
  choking: 'Choking',
};

/** States where the camera is expected to see the rescuer; camera guidance is spoken only here. */
export const WATCHING_STATES: ReadonlySet<string> = new Set([
  'cardiac.position',
  'cardiac.compressions',
  'bleeding.pressure',
  'bleeding.pack',
]);
/** States where the wound region is tracked (docs/08: setMode + lockRoi on entry). */
export const HANDS_STATES: ReadonlySet<string> = new Set(['bleeding.pressure', 'bleeding.pack']);

export const TICK_MS = 100;
const REPORT_MS = 1000;
const GUIDANCE_COOLDOWN_MS = 10_000;
const COACHING_SHOWN_MS = 8_000;
const SCENE_HINT_RETRY_MS = 30_000;
const HEARD_SHOWN_MS = 4_000;
const SUGGESTION_TTL_MS = 20_000;
const CAMERA_SAW_SHOWN_MS = 5_000;
/** The camera gets a moment to expose and find a pose before a frame is worth sending. */
const ASSESS_AFTER_MS = 1_200;
/** An unclear answer is tried once more, later; a clear one stands. */
const ASSESS_RETRY_MS = 6_000;
const ASSESS_MAX_TRIES = 2;
/** One sentence at a time to the intent router, and a breath between tries, so a talkative
 * bystander cannot turn a missed keyword into a stream of questions. */
const INTENT_COOLDOWN_MS = 8_000;

/** Not medical: this is about the camera, spoken once per state when the hands never settle. */
export const ROI_FAILED_LINE = "I can't find your hands on the wound. I'll keep coaching by voice.";
/** Not medical: the camera moved the machine, and the bystander should know it was watching. */
export const CAMERA_SAW_LINE = 'I can see you pushing.';

export function createSession(deps: SessionDeps): Session {
  const { perception, voice } = deps;
  const engine = deps.engine ?? createEngine(machines);
  const log = deps.log ?? createEventLog();
  const now = deps.now ?? (() => Date.now());
  const interval =
    deps.interval ??
    ((fn: () => void, ms: number) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });
  const geolocate = deps.geolocate ?? defaultGeolocate;
  const reverseGeocode = deps.reverseGeocode ?? (async () => null);
  const vibrate = deps.vibrate ?? ((ms: number) => navigator.vibrate?.(ms));

  const subs = new Set<() => void>();
  let phase: SessionPhase = 'idle';
  let facts: PerceptionFacts | null = null;
  let coaching: CoachingEvent | null = null;
  let coachingAt = 0;
  let metronomeBpm: number | null = null;
  let beatOriginMs = 0;
  let guidance: string | null = null;
  let stateEnteredAt = 0;
  let guidanceSpokenAt = -Infinity;
  let listening: VoiceInStatus = 'stopped';
  let listenError: string | null = null;
  let lastHeard: string | null = null;
  let lastHeardAt = 0;
  let lastKeyword: string | null = null;
  let lastKeywordAt = -Infinity;
  let pendingTranscript: { text: string; t: number } | null = null;
  let suggestion: (RouteSuggestion & { at: number }) | null = null;
  // After a camera suggestion is rejected or ignored, the camera waits this long before asking again.
  let sceneAskedAt = -Infinity;
  let callActive = false;
  let call: { sayToDispatcher(t: string): void; hangup(): void } | null = null;
  let dispatcherStatus: DispatcherStatus = 'scripted';
  let dispatcherLines: DispatcherLine[] = [];
  const dispatcherFactory: DispatcherFactory = deps.dispatcher ?? ((scripted) => ({ dispatcher: scripted, status: 'scripted' }));
  let sitrep: Sitrep | null = null;
  let handoff: HandoffReport | null = null;
  let geo: GeoFix | null = null;
  let geoRequested = false;
  let roiAnnouncedFor: string | null = null;
  let cameraSaw: { label: string; at: number } | null = null;
  let assessment: SceneAssessment | null = null;
  let assessing = false;
  let assessTries = 0;
  let assessedAt = -Infinity;
  let routing = false;
  let routedAt = -Infinity;
  // A camera question the person said no to waits SCENE_HINT_RETRY_MS before either camera
  // source may ask about that route again (docs/03: a rejected hint waits 30 s).
  const rejectedAt = new Map<string, number>();
  // A call911 state entered while the simulated call is already open is skipped on the next
  // tick: telling someone on the line to call is noise, and the state's own lines go stale
  // unplayed when the engine moves on (docs/09). Not medical: it is about the phone.
  let skipCallPrompt = false;
  let handsMode = false;
  let lastReportAt = 0;
  let cancelTick: (() => void) | null = null;
  let unsubscribePerception: (() => void) | null = null;
  let unsubscribeEngine: (() => void) | null = null;
  let snap: SessionSnapshot | null = null;

  // ---- engine outputs --------------------------------------------------------------------

  function onStateEnter(machineId: string, stateId: string, bpm: number | null): void {
    const key = `${machineId}.${stateId}`;
    const state = engine.currentState()?.state;
    coaching = null;
    stateEnteredAt = now();
    phase = machineId === 'triage' ? 'triage' : state?.terminal ? 'handoff' : 'coaching';
    if (callActive && state?.call911) skipCallPrompt = true;
    if (machineId === 'triage') {
      assessment = null;
      assessTries = 0;
      rejectedAt.clear();
    }

    if (bpm === null) {
      if (metronomeBpm !== null) voice.out.stopMetronome();
      metronomeBpm = null;
    } else {
      voice.out.startMetronome(bpm);
      metronomeBpm = bpm;
      beatOriginMs = typeof performance !== 'undefined' ? performance.now() : 0;
    }

    const wantHands = HANDS_STATES.has(key);
    if (wantHands && !handsMode) {
      perception.setMode('pose+hands');
      perception.lockRoi();
      handsMode = true;
      roiAnnouncedFor = null;
    } else if (!wantHands && handsMode) {
      perception.unlockRoi();
      perception.setMode('pose');
      handsMode = false;
    }

    if (machineId !== 'triage' && !geoRequested) {
      geoRequested = true;
      void geolocate().then((fix) => {
        geo = fix;
        log.append({
          t: now(),
          kind: 'system',
          detail: fix ? `location fix ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}` : 'no location fix',
        });
        refreshReports(true);
        // Address arrives later, if at all (reverseGeocode defaults to a no-op, see above);
        // readAloud() falls back to coordinates until/unless this resolves.
        if (fix) {
          void reverseGeocode(fix.lat, fix.lon).then((address) => {
            if (address === null || geo !== fix) return; // superseded by a newer fix meanwhile
            geo = { ...fix, address };
            refreshReports(true);
          });
        }
      });
    }
    refreshReports(true);
    notify();
  }

  function onCoach(event: CoachingEvent): void {
    voice.out.enqueue(event);
    const current = engine.currentState()?.state.id;
    if (event.priority !== 'narration' && event.stateId === current && !event.dedupeKey?.startsWith('answer:') && event.dedupeKey !== 'camera-saw') {
      coaching = event;
      coachingAt = now();
    }
    notify();
  }

  /** The camera advanced the machine on its own. Say so; the label is the button it stood in for. */
  function onCameraTransition(label: string): void {
    const t = now();
    cameraSaw = { label, at: t };
    // Narration, not correction: correction would jump the remaining protocol lines
    // ("Push hard and fast") and talk over the machine. The chip already shows what it saw.
    voice.out.enqueue({ priority: 'narration', text: CAMERA_SAW_LINE, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'camera-saw', cooldownMs: 10_000, t });
  }

  function attachEngine(): void {
    unsubscribeEngine?.();
    unsubscribeEngine = engine.subscribe((out) => {
      if (out.type === 'coach') onCoach(out.event);
      else if (out.type === 'log') {
        log.append(out.entry);
        if (out.entry.data?.type === 'fact_transition') onCameraTransition(out.entry.data.label);
      } else onStateEnter(out.machineId, out.stateId, out.metronome);
    });
  }

  // ---- perception -----------------------------------------------------------------------

  function onFacts(f: PerceptionFacts): void {
    facts = f;
    voice.out.noteFacts(f);
    engine.onFacts(f);
    clearResolvedCoaching(f);
  }

  /**
   * A correction stays on screen while its rule still holds and leaves the moment it stops:
   * "Don't let go" next to a mint "pressure held" was the screen contradicting itself.
   */
  function clearResolvedCoaching(f: PerceptionFacts): void {
    if (!coaching?.dedupeKey) return;
    const rule = engine.currentState()?.state.coachingRules?.find((r) => r.id === coaching?.dedupeKey);
    if (!rule) return;
    if (!rule.when(f, { blind: blindNow(), inStateMs: now() - stateEnteredAt })) coaching = null;
  }

  // ---- the clock -------------------------------------------------------------------------

  function tick(): void {
    const t = now();
    if (skipCallPrompt) {
      skipCallPrompt = false;
      log.append({ t, kind: 'system', detail: 'already on the line with the simulated dispatcher, skipped the call 911 prompt' });
      engine.advance();
    }
    engine.tick(t);
    const key = stateKey();
    if (key && WATCHING_STATES.has(key)) {
      const g = perception.getCameraGuidance();
      guidance = g;
      // The engine's own blind rule already covers "I can't see you"; only the fixable ones speak.
      if (g && g !== GUIDANCE.unseen && t - guidanceSpokenAt >= GUIDANCE_COOLDOWN_MS) {
        guidanceSpokenAt = t;
        voice.out.enqueue({ priority: 'correction', text: g, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'camera', cooldownMs: GUIDANCE_COOLDOWN_MS, t });
        log.append({ t, kind: 'system', detail: `camera guidance: ${g}` });
      }
    } else {
      guidance = null;
    }
    if (key && HANDS_STATES.has(key) && roiAnnouncedFor !== key && perception.roi().state === 'failed') {
      roiAnnouncedFor = key;
      voice.out.enqueue({ priority: 'correction', text: ROI_FAILED_LINE, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'roi-failed', cooldownMs: 60_000, t });
      log.append({ t, kind: 'system', detail: 'hands never settled on the wound, coaching by voice' });
    }
    if (coaching && t - coachingAt > COACHING_SHOWN_MS) coaching = null;
    considerTranscript(t);
    if (suggestion && t - suggestion.at > SUGGESTION_TTL_MS) suggestion = null;
    considerScene(t);
    considerAssessment(t);
    if (t - lastReportAt >= REPORT_MS) refreshReports(false);
    notify();
  }

  /**
   * A final transcript that fired no keyword: while a suggestion is open it can be the yes or
   * the no; in triage it can earn a suggestion from the phrase cues; and if those miss, the
   * intent router gets a turn. Runs one tick after the transcript so the listener's own
   * keyword pass has already had its turn.
   */
  function considerTranscript(t: number): void {
    const p = pendingTranscript;
    if (!p) return;
    pendingTranscript = null;
    if (lastKeywordAt >= p.t) return; // the listener already routed this one
    if (suggestion) {
      if (matchKeyword(p.text, CONFIRM_WORDS)) return session.confirmSuggestion();
      if (matchKeyword(p.text, REJECT_WORDS)) return session.rejectSuggestion();
      return;
    }
    if (phase === 'triage') {
      const found = suggestRoute(p.text);
      if (found) {
          suggestion = { at: t, label: found.route.label, keyword: routeKeyword(found.route), to: found.route.to, heard: p.text, source: 'voice' };
        log.append({ t, kind: 'system', detail: `sounds like ${found.route.label} (score ${found.score}): "${p.text}"` });
        voice.out.enqueue({ priority: 'correction', text: found.route.confirm, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'suggest', cooldownMs: 3000, t });
        return;
      }
    }
    considerIntent(p.text, t);
  }

  /**
   * The cloud upgrade to the phrase cues (docs/04 item 8): a sentence both the matcher and
   * `suggestRoute` missed, and the buttons that are on the screen right now. The model answers
   * with the number of one of them, never with words, so the worst it can do is point at the
   * wrong button the person is already looking at. It earns the same Yes/No question a heard
   * phrase does, and the engine still moves only on the keyword the human confirms.
   */
  function considerIntent(transcript: string, t: number): void {
    const router = deps.router;
    if (!router || routing || phase === 'idle' || phase === 'handoff') return;
    if (t - routedAt < INTENT_COOLDOWN_MS) return;
    const options = twinsOf(engine.currentState()?.state ?? null).map((twin) => ({ keyword: twin.keyword, label: twin.label }));
    if (options.length === 0) return;
    routing = true;
    void router.route({ transcript, options }).then((match) => {
      routing = false;
      routedAt = now();
      if (match) suggestFromIntent(match, transcript);
      else log.append({ t: now(), kind: 'system', detail: `no match from the intent router: "${transcript}"` });
      notify();
    });
  }

  function suggestFromIntent(match: IntentMatch, transcript: string): void {
    const t = now();
    if (suggestion) return; // something else asked while the model was thinking
    const twin = twinsOf(engine.currentState()?.state ?? null).find((b) => b.keyword === match.keyword);
    if (!twin) return; // the state moved on under the answer
    const route = TRIAGE_ROUTES.find((r) => r.to === twin.to);
    suggestion = { at: t, label: twin.label, keyword: twin.keyword, to: twin.to, heard: transcript, source: 'model' };
    log.append({ t, kind: 'system', detail: `intent router (${match.model}, ${match.confidence}) reads "${transcript}" as ${twin.label}` });
    voice.out.enqueue({ priority: 'correction', text: route?.confirm ?? confirmLine(twin.label), stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'suggest', cooldownMs: 3000, t });
  }

  /**
   * The camera's one triage cue: a person lying still (docs/03 "Scene hint"). It earns the same
   * suggestion a heard phrase does, spoken as a question; the human says yes or taps, and only
   * then does the engine move, on a keyword triage already accepts. Asked once per half minute.
   */
  function considerScene(t: number): void {
    if (phase !== 'triage' || suggestion || !facts || facts.sceneHint !== 'person_down') return;
    if (t - facts.t > STALE_FACTS_MS || t - sceneAskedAt < SCENE_HINT_RETRY_MS) return;
    const hint = SCENE_HINTS.person_down;
    const route = TRIAGE_ROUTES.find((r) => r.to === hint.to);
    if (!route || t - (rejectedAt.get(hint.to) ?? -Infinity) < SCENE_HINT_RETRY_MS) return;
    sceneAskedAt = t;
    suggestion = { at: t, label: hint.label, keyword: hint.keyword, to: hint.to, heard: 'camera: a person lying still', source: 'camera' };
    log.append({ t, kind: 'system', detail: 'camera: a person lying still, asked whether someone collapsed' });
    voice.out.enqueue({ priority: 'correction', text: hint.confirm, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'suggest', cooldownMs: 3000, t });
  }

  /**
   * One frame to the scene model (docs/04 item 7, docs/11): once the camera has had a moment
   * in triage, and once more later if the first answer was unclear. The label earns the same
   * Yes/No question a heard phrase does; the engine never moves on it.
   */
  function considerAssessment(t: number): void {
    const assessor = deps.assessor;
    if (!assessor || phase !== 'triage' || assessing || assessTries >= ASSESS_MAX_TRIES) return;
    if (t - stateEnteredAt < ASSESS_AFTER_MS) return;
    if (assessTries > 0 && (assessment?.label !== 'unclear' || t - assessedAt < ASSESS_RETRY_MS)) return;
    if (perception.debug.status() !== 'running' || !facts || t - facts.t > STALE_FACTS_MS) return;
    const size = perception.debug.frameSize();
    const image = perception.captureFrame(ASSESS_FRAME_PX);
    if (!image || !size) return;
    const scale = Math.min(1, ASSESS_FRAME_PX / Math.max(size.width, size.height));
    assessing = true;
    assessTries++;
    log.append({ t, kind: 'system', detail: 'camera: one frame sent to the scene model' });
    void assessor
      .assess({ image, mime: 'image/jpeg', width: Math.round(size.width * scale), height: Math.round(size.height * scale) })
      .then((result) => {
        assessing = false;
        assessedAt = now();
        if (!result) {
          log.append({ t: now(), kind: 'system', detail: 'camera: no answer from the scene model' });
        } else {
          assessment = result;
          log.append({ t: now(), kind: 'system', detail: `camera: looks like ${result.label} (${result.confidence})${result.scene ? `: ${result.scene}` : ''}` });
          suggestFromAssessment(result);
        }
        notify();
      });
  }

  function suggestFromAssessment(a: SceneAssessment): void {
    if (a.label === 'unclear' || phase !== 'triage' || suggestion) return;
    const hint = ASSESSMENT_HINTS[a.label];
    const route = TRIAGE_ROUTES.find((r) => r.to === hint.to);
    const t = now();
    if (!route || t - (rejectedAt.get(hint.to) ?? -Infinity) < SCENE_HINT_RETRY_MS) return;
    suggestion = { at: t, label: hint.label, keyword: hint.keyword, to: hint.to, heard: `camera: ${a.scene || a.label}`, source: 'camera' };
    voice.out.enqueue({ priority: 'correction', text: hint.confirm, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'suggest', cooldownMs: 3000, t });
  }

  function refreshReports(force: boolean): void {
    const t = now();
    if (!force && t - lastReportAt < REPORT_MS) return;
    lastReportAt = t;
    if (phase === 'idle') return;
    // Freeze the closing report the moment it's first built after the ambulance arrives.
    // Without this, the per-tick refresh below (called every second regardless of phase)
    // kept calling buildHandoff() with a fresh `now()`, so `generatedAt` and `durationMs`
    // drifted every second on a screen whose whole point is a final, stable snapshot --
    // the QR encodes those fields, so it silently re-rendered as a different image every
    // second. A phone scanning it mid-change read garbage instead of the payload.
    if (phase === 'handoff' && handoff) return;
    sitrep = buildSitrep(log, geo, t);
    handoff = buildHandoff(log, t, geo);
  }

  // ---- listening -------------------------------------------------------------------------

  function listen(): void {
    if (!voice.in.available) {
      listening = 'unavailable';
      return;
    }
    voice.listen({
      keywords: () => engine.keywords(),
      spot: matchKeyword,
      onEvent: deps.micTrace,
      onKeyword: (k) => {
        lastKeyword = k;
        lastKeywordAt = now();
        lastHeardAt = now();
        suggestion = null;
        engine.onKeyword(k);
        notify();
      },
      onTranscript: (text) => {
        lastHeard = text;
        lastHeardAt = now();
        pendingTranscript = { text, t: now() };
        log.append({ t: now(), kind: 'user', detail: text });
        notify();
      },
      // What the mic hears while the person still speaks, shown on the chip and nowhere else.
      onInterim: (text) => {
        lastHeard = text;
        lastHeardAt = now();
        notify();
      },
      onStatus: (s) => {
        listening = s;
        if (s === 'listening') listenError = null;
        notify();
      },
      onError: (code) => {
        listenError = code;
        log.append({ t: now(), kind: 'system', detail: `speech recognition error: ${code}` });
        notify();
      },
    });
  }

  // ---- snapshot --------------------------------------------------------------------------

  function terminalStateOf(machineId: string): string | null {
    const m = machines.find((x) => x.id === machineId);
    return m?.states.find((s) => s.terminal)?.id ?? null;
  }

  function stateKey(): string | null {
    const cur = engine.currentState();
    return cur ? `${cur.machineId}.${cur.state.id}` : null;
  }

  function lineIndexOf(state: State | null): number {
    if (!state || state.say.length === 0) return 0;
    const spoken = voice.out.recentlySpoken();
    for (let i = state.say.length - 1; i >= 0; i--) if (spoken.includes(state.say[i])) return i;
    return 0;
  }

  function twinsOf(state: State | null): ButtonTwin[] {
    if (!state) return [];
    const cur = engine.currentState();
    const terminal = cur ? terminalStateOf(cur.machineId) : null;
    const seen = new Set<string>();
    const twins: ButtonTwin[] = [];
    for (const tr of state.transitions) {
      if (tr.on.kind !== 'keyword' || seen.has(tr.to)) continue;
      // "Ambulance is here" is a standing button in every coaching state (finish()), so a
      // state's own keyword to the terminal state would be the same button twice.
      if (terminal !== null && (tr.to === terminal || tr.to === `${cur?.machineId}.${terminal}`)) continue;
      seen.add(tr.to);
      twins.push({ label: tr.label, keyword: tr.on.keyword, to: tr.to });
    }
    return twins;
  }

  function blindNow(): boolean {
    if (!facts) return false;
    return now() - facts.t > STALE_FACTS_MS || facts.poseConfidence < 0.5;
  }

  function eyesNow(): Eyes {
    const status = perception.debug.status();
    const t = now();
    const running = status === 'running';
    const rescuer = running && !!facts && t - facts.t <= STALE_FACTS_MS && facts.poseConfidence >= 0.5;
    return {
      status:
        status === 'error' ? 'error'
        : status === 'loading-model' || status === 'starting-camera' || status === 'idle' ? 'starting'
        : running ? (blindNow() || !facts ? 'blind' : 'watching')
        : 'off',
      fps: running ? perception.debug.fps() : 0,
      rescuer,
      hands: handsMode ? perception.roi().state : null,
      saw: cameraSaw && t - cameraSaw.at <= CAMERA_SAW_SHOWN_MS ? cameraSaw.label : null,
      error: status === 'error' ? perception.debug.error() : null,
    };
  }

  function build(): SessionSnapshot {
    const cur = engine.currentState();
    const state = cur?.state ?? null;
    const machineId = cur?.machineId ?? null;
    const t = now();
    return {
      phase,
      machineId,
      machineLabel: machineId ? (MACHINE_LABEL[machineId] ?? machineId) : '',
      stateId: state?.id ?? null,
      stateKey: stateKey(),
      lines: state?.say ?? [],
      lineIndex: lineIndexOf(state),
      stateEnteredAt,
      speaking: voice.out.isSpeaking(),
      twins: twinsOf(state),
      canAdvance: !!state && !state.terminal && state.transitions.some((tr) => tr.on.kind === 'manualAdvance'),
      call911: !!state?.call911,
      metronomeBpm,
      beatOriginMs,
      facts,
      coaching,
      blind: blindNow(),
      eyes: eyesNow(),
      guidance,
      listening,
      listenError,
      suggestion: suggestion ? { label: suggestion.label, keyword: suggestion.keyword, to: suggestion.to, heard: suggestion.heard, source: suggestion.source } : null,
      assessment,
      assessing,
      lastHeard: t - lastHeardAt <= HEARD_SHOWN_MS ? lastHeard : null,
      lastHeardAt,
      lastKeyword: t - lastHeardAt <= HEARD_SHOWN_MS ? lastKeyword : null,
      callActive,
      dispatcherStatus,
      dispatcherLines,
      sitrep,
      handoff,
      geo,
      startedAt: sitrep?.startedAt ?? null,
    };
  }

  function notify(): void {
    snap = build();
    for (const cb of subs) cb();
  }

  // ---- the surface -----------------------------------------------------------------------

  const session: Session = {
    engine,
    log,

    start(): void {
      if (phase !== 'idle') return;
      // No await before the first spoken line: iOS only allows speech that starts inside the tap.
      void voice.out.unlock();
      attachEngine();
      unsubscribePerception?.();
      unsubscribePerception = perception.subscribe(onFacts);
      // Mic before we talk: SpeechRecognition.start must be in this tap, and on iOS it loses
      // the permission sheet if speechSynthesis is already going (the prompt then waits until
      // the next tap, which was the looking card).
      listen();
      engine.tick(now());
      engine.start('triage');
      cancelTick?.();
      cancelTick = interval(tick, TICK_MS);
      notify();
    },

    stop(): void {
      cancelTick?.();
      cancelTick = null;
      unsubscribePerception?.();
      unsubscribePerception = null;
      voice.stopListening();
      voice.out.cancelAll();
      if (metronomeBpm !== null) voice.out.stopMetronome();
      metronomeBpm = null;
      if (handsMode) {
        perception.unlockRoi();
        perception.setMode('pose');
        handsMode = false;
      }
      call?.hangup();
      call = null;
      callActive = false;
      phase = 'idle';
      notify();
    },

    restart(): void {
      session.stop();
      log.clear();
      sitrep = null;
      handoff = null;
      coaching = null;
      dispatcherLines = [];
      geoRequested = false;
      roiAnnouncedFor = null;
      cameraSaw = null;
      assessment = null;
      assessing = false;
      assessTries = 0;
      rejectedAt.clear();
      routing = false;
      routedAt = -Infinity;
      skipCallPrompt = false;
      session.start();
    },

    advance(): void {
      engine.advance();
      notify();
    },

    say(keyword: string): void {
      lastKeyword = keyword;
      lastHeardAt = now();
      engine.onKeyword(keyword);
      notify();
    },

    heard(transcript: string): void {
      // Same path as the mic: a keyword routes at once, anything else may earn a suggestion.
      lastHeard = transcript;
      lastHeardAt = now();
      log.append({ t: now(), kind: 'user', detail: transcript });
      const keyword = matchKeyword(transcript, engine.keywords());
      if (keyword) {
        lastKeyword = keyword;
        lastKeywordAt = now();
        suggestion = null;
        engine.onKeyword(keyword);
      } else {
        pendingTranscript = { text: transcript, t: now() };
      }
      notify();
    },

    confirmSuggestion(): void {
      const s = suggestion;
      if (!s) return;
      suggestion = null;
      log.append({ t: now(), kind: 'user', detail: `confirmed: ${s.label}` });
      session.say(s.keyword);
    },

    rejectSuggestion(): void {
      if (!suggestion) return;
      log.append({ t: now(), kind: 'user', detail: `rejected: ${suggestion.label}` });
      if (suggestion.source === 'camera') rejectedAt.set(suggestion.to, now());
      suggestion = null;
      notify();
    },

    finish(): void {
      const cur = engine.currentState();
      if (!cur || cur.machineId === 'triage' || cur.state.terminal) return;
      const terminal = terminalStateOf(cur.machineId);
      if (!terminal) return;
      log.append({ t: now(), kind: 'user', detail: 'ambulance arrived (button)' });
      engine.start(cur.machineId, terminal);
      notify();
    },

    call911(): void {
      if (callActive) return;
      vibrate(200);
      callActive = true;
      dispatcherLines = [];
      log.append({ t: now(), kind: 'user', detail: 'called 911 (SIMULATED dispatcher)' });
      const made = dispatcherFactory(voice.dispatcher, {
        onStatus: (s) => {
          dispatcherStatus = s;
          log.append({ t: now(), kind: 'system', detail: `simulated dispatcher: ${s}` });
          notify();
        },
        onTranscript: (text) => {
          dispatcherLines = [...dispatcherLines, { who: 'you', text }];
          log.append({ t: now(), kind: 'user', detail: `to dispatcher: ${text}` });
          notify();
        },
      });
      dispatcherStatus = made.status;
      call = made.dispatcher.connect((line) => {
        dispatcherLines = [...dispatcherLines, { who: 'dispatcher', text: line }];
        notify();
      });
      notify();
    },

    replyToDispatcher(text: string): void {
      if (!call) return;
      dispatcherLines = [...dispatcherLines, { who: 'you', text }];
      log.append({ t: now(), kind: 'user', detail: `to dispatcher: ${text}` });
      call.sayToDispatcher(text);
      notify();
    },

    hangUp(): void {
      call?.hangup();
      call = null;
      callActive = false;
      dispatcherStatus = 'ended';
      log.append({ t: now(), kind: 'user', detail: 'hung up (SIMULATED dispatcher)' });
      notify();
    },

    retryListening(): void {
      if (phase === 'idle') return;
      voice.stopListening();
      listenError = null;
      log.append({ t: now(), kind: 'user', detail: 'retry listening (tap)' });
      listen();
      notify();
    },

    readSitrepAloud(): void {
      refreshReports(true);
      if (sitrep) voice.readAloud.start(sitrep.readAloud);
    },

    async qr(): Promise<string | null> {
      refreshReports(true);
      return handoff ? qrDataUrl(handoffQrPayload(handoff)) : null;
    },

    snapshot(): SessionSnapshot {
      return (snap ??= build());
    },

    subscribe(cb: () => void): () => void {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };

  return session;
}

/** Every line the machines can say, for warming a networked speaker's cache (docs/09). */
export function canonicalLines(): string[] {
  const lines = new Set<string>();
  for (const m of machines) {
    for (const st of m.states) {
      for (const line of st.say) lines.add(line);
      for (const r of st.coachingRules ?? []) lines.add(r.say);
    }
    for (const a of m.keywordResponses ?? []) lines.add(a.say);
  }
  return [...lines];
}

function defaultGeolocate(): Promise<GeoFix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
