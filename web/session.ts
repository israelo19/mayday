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
import type { CoachingEvent, GeoFix, HandoffReport, PerceptionFacts, Sitrep, State } from '../src/types';
import type { DispatcherSim } from '../src/ai/dispatcher';
import type { Perception } from '../src/perception';
import { GUIDANCE } from '../src/perception';
import type { Voice, VoiceInStatus } from '../src/voice';
import { CONFIRM_WORDS, createEngine, machines, matchKeyword, REJECT_WORDS, routeKeyword, STALE_FACTS_MS, suggestRoute, type Engine, type TriageRoute } from '../src/protocol';
import { buildHandoff, buildSitrep, createEventLog, handoffQrPayload, qrDataUrl, type EventLog } from '../src/sitrep';

export type SessionPhase = 'idle' | 'triage' | 'coaching' | 'handoff';

/** A route the app thinks it heard but no keyword matched; entered only on yes, by its keyword. */
export type RouteSuggestion = { label: string; keyword: string; to: string; heard: string };

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
  /** Camera guidance the session is currently showing (spoken only in watching states). */
  guidance: string | null;
  listening: VoiceInStatus;
  suggestion: RouteSuggestion | null;
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
  vibrate?: (ms: number) => void;
  /** Defaults to the voice module's scripted call-taker. */
  dispatcher?: DispatcherFactory;
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
const HEARD_SHOWN_MS = 4_000;
const SUGGESTION_TTL_MS = 20_000;

/** Not medical: this is about the camera, spoken once per state when the hands never settle. */
export const ROI_FAILED_LINE = "I can't find your hands on the wound. I'll keep coaching by voice.";

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
  let lastHeard: string | null = null;
  let lastHeardAt = 0;
  let lastKeyword: string | null = null;
  let lastKeywordAt = -Infinity;
  let pendingTranscript: { text: string; t: number } | null = null;
  let suggestion: (RouteSuggestion & { route: TriageRoute; at: number }) | null = null;
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
      });
    }
    refreshReports(true);
    notify();
  }

  function onCoach(event: CoachingEvent): void {
    voice.out.enqueue(event);
    const current = engine.currentState()?.state.id;
    if (event.priority !== 'narration' && event.stateId === current && !event.dedupeKey?.startsWith('answer:')) {
      coaching = event;
      coachingAt = now();
    }
    notify();
  }

  function attachEngine(): void {
    unsubscribeEngine?.();
    unsubscribeEngine = engine.subscribe((out) => {
      if (out.type === 'coach') onCoach(out.event);
      else if (out.type === 'log') log.append(out.entry);
      else onStateEnter(out.machineId, out.stateId, out.metronome);
    });
  }

  // ---- perception -----------------------------------------------------------------------

  function onFacts(f: PerceptionFacts): void {
    facts = f;
    voice.out.noteFacts(f);
    engine.onFacts(f);
  }

  // ---- the clock -------------------------------------------------------------------------

  function tick(): void {
    const t = now();
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
    if (t - lastReportAt >= REPORT_MS) refreshReports(false);
    notify();
  }

  /**
   * A final transcript that fired no keyword: while a suggestion is open it can be the yes or
   * the no; in triage it can earn a suggestion from the phrase cues. Runs one tick after the
   * transcript so the listener's own keyword pass has already had its turn.
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
    if (phase !== 'triage') return;
    const found = suggestRoute(p.text);
    if (!found) return;
    suggestion = { route: found.route, at: t, label: found.route.label, keyword: routeKeyword(found.route), to: found.route.to, heard: p.text };
    log.append({ t, kind: 'system', detail: `sounds like ${found.route.label} (score ${found.score}): "${p.text}"` });
    voice.out.enqueue({ priority: 'correction', text: found.route.confirm, stateId: engine.currentState()?.state.id ?? '', dedupeKey: 'suggest', cooldownMs: 3000, t });
  }

  function refreshReports(force: boolean): void {
    const t = now();
    if (!force && t - lastReportAt < REPORT_MS) return;
    lastReportAt = t;
    if (phase === 'idle') return;
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
      onStatus: (s) => {
        listening = s;
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
      guidance,
      listening,
      suggestion: suggestion ? { label: suggestion.label, keyword: suggestion.keyword, to: suggestion.to, heard: suggestion.heard } : null,
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
      engine.tick(now());
      engine.start('triage');
      listen();
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
