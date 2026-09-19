// The deterministic protocol engine (docs/02). It is a pure function of machine data, facts,
// keywords and time: no MediaPipe, no TTS, no network, no Date.now(). Medical authority lives
// in the machine data it executes, never here and never in a model.
import {
  BLIND_CONFIDENCE,
  type CoachingEvent,
  type EventLogEntry,
  type Machine,
  type PerceptionFacts,
  type Rule,
  type RuleContext,
  type State,
  type Transition,
} from '../types';
import { matchKeyword } from './keywords';
import { NO_FACTS, RuleEvaluator } from './rules';

/** Facts older than this are treated as blind: a frozen number must never coach (principle 4). */
export const STALE_FACTS_MS = 2000;
/** With no facts at all, wait this long before announcing blindness so model load is not "blind". */
const NO_FACTS_GRACE_MS = 3000;
const METRIC_SAMPLE_MS = 5000;

/** Handled in any state, after the state's own keywords get first refusal. */
export const GLOBAL_KEYWORDS = ['next', 'repeat'] as const;

export type EngineOutput =
  | { type: 'coach'; event: CoachingEvent }
  | { type: 'state_enter'; machineId: string; stateId: string; metronome: number | null }
  | { type: 'log'; entry: EventLogEntry };

export interface Engine {
  start(machineId: string, stateId?: string): void;
  onFacts(f: PerceptionFacts): void;
  /** Raw transcript or an exact keyword; matching is phrase level and word bounded. */
  onKeyword(k: string): void;
  /** The NEXT button. Always legal, so a demo can never wedge (docs/05). */
  advance(): void;
  tick(now: number): void;
  currentState(): { machineId: string; state: State } | null;
  keywords(): string[];
  availableTransitions(): { label: string; keyword: string }[];
  subscribe(cb: (out: EngineOutput) => void): () => void;
}

export function createEngine(machines: readonly Machine[]): Engine {
  return new ProtocolEngine(machines);
}

class ProtocolEngine implements Engine {
  private readonly registry = new Map<string, Machine>();
  private readonly subs = new Set<(out: EngineOutput) => void>();
  private readonly evaluator = new RuleEvaluator();
  private machine: Machine | null = null;
  private state: State | null = null;
  private enteredAt = 0;
  private now = 0;
  private facts: PerceptionFacts | null = null;
  private lastMetricAt = 0;
  private lastMetricShape = '';

  constructor(machines: readonly Machine[]) {
    for (const m of machines) this.registry.set(m.id, m);
  }

  start(machineId: string, stateId?: string): void {
    const machine = this.registry.get(machineId);
    if (!machine) throw new Error(`unknown machine: ${machineId}`);
    const state = machine.states.find((s) => s.id === (stateId ?? machine.initial));
    if (!state) throw new Error(`unknown state: ${machineId}.${stateId}`);
    this.enter(machine, state);
  }

  onFacts(f: PerceptionFacts): void {
    this.facts = f;
    if (f.t > this.now) this.now = f.t;
    this.logMetric(f);
    if (this.fireFactTransition(f)) return;
    this.runRules();
  }

  onKeyword(k: string): void {
    const state = this.state;
    const machine = this.machine;
    if (!state || !machine) return;
    this.log('user', `heard: ${k}`);
    const spoken = state.transitions.filter(isKeyword).map((t) => t.on.keyword);
    const answers = machine.keywordResponses ?? [];
    const hit = matchKeyword(k, [...spoken, ...answers.map((a) => a.keyword), ...GLOBAL_KEYWORDS]);
    if (hit === null) return;
    const transition = state.transitions.find((t) => isKeyword(t) && t.on.keyword === hit);
    if (transition) {
      this.go(transition.to);
      return;
    }
    const answer = answers.find((a) => a.keyword === hit);
    if (answer) {
      this.speak(answer.say, answer.priority, `answer:${answer.keyword}`);
      return;
    }
    if (hit === 'next') this.advance();
    if (hit === 'repeat') this.sayLines(state);
  }

  advance(): void {
    const transition = this.state?.transitions.find((t) => t.on.kind === 'manualAdvance');
    if (transition) this.go(transition.to);
  }

  tick(now: number): void {
    if (now > this.now) this.now = now;
    if (!this.state) return;
    const timer = this.state.transitions.find(
      (t) => t.on.kind === 'timerMs' && this.now - this.enteredAt >= t.on.ms,
    );
    if (timer) {
      this.go(timer.to);
      return;
    }
    this.runRules();
  }

  currentState(): { machineId: string; state: State } | null {
    return this.machine && this.state ? { machineId: this.machine.id, state: this.state } : null;
  }

  keywords(): string[] {
    const state = this.state;
    if (!state || !this.machine) return [];
    const answers = this.machine.keywordResponses?.map((a) => a.keyword) ?? [];
    return [...state.transitions.filter(isKeyword).map((t) => t.on.keyword), ...answers, ...GLOBAL_KEYWORDS];
  }

  availableTransitions(): { label: string; keyword: string }[] {
    return (this.state?.transitions ?? [])
      .filter(isKeyword)
      .map((t) => ({ label: t.label, keyword: t.on.keyword }));
  }

  subscribe(cb: (out: EngineOutput) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  // -- internals -------------------------------------------------------------

  /** True when perception cannot be trusted, so only blind-safe rules may speak. */
  private isBlind(): boolean {
    if (!this.facts) return this.now - this.enteredAt >= NO_FACTS_GRACE_MS;
    if (this.now - this.facts.t > STALE_FACTS_MS) return true;
    return this.facts.poseConfidence < BLIND_CONFIDENCE;
  }

  private context(): RuleContext {
    return { blind: this.isBlind(), inStateMs: this.now - this.enteredAt };
  }

  private runRules(): void {
    const state = this.state;
    if (!state?.coachingRules) return;
    const facts = this.facts ?? NO_FACTS;
    const fired = this.evaluator.evaluate(state.coachingRules, facts, this.context(), this.now);
    for (const rule of fired) this.fire(rule, state.id);
  }

  private fire(rule: Rule, stateId: string): void {
    this.emit({
      type: 'coach',
      event: {
        priority: rule.priority,
        text: rule.say,
        stateId,
        dedupeKey: rule.id,
        cooldownMs: rule.cooldownMs,
        t: this.facts?.t ?? this.now,
      },
    });
    this.log(rule.logKind ?? 'coach', rule.say, {
      type: 'coach',
      priority: rule.priority,
      dedupeKey: rule.id,
    });
  }

  private fireFactTransition(f: PerceptionFacts): boolean {
    const ctx = this.context();
    const transition = this.state?.transitions.find(
      (t) => t.on.kind === 'fact' && !ctx.blind && t.on.predicate(f, ctx),
    );
    if (!transition) return false;
    this.go(transition.to);
    // Logged after the move so the entry lands under the new state, where the session can
    // say out loud that the camera, not a tap, is what advanced.
    this.log('system', `camera: ${transition.label.toLowerCase()}`, { type: 'fact_transition', label: transition.label });
    return true;
  }

  /** Resolves `stateId` or `machineId.stateId`. Cross-machine targets are how triage hands off. */
  private go(target: string): void {
    const [head, tail] = target.includes('.') ? target.split('.') : [this.machine?.id ?? '', target];
    const machine = this.registry.get(head);
    const state = machine?.states.find((s) => s.id === tail);
    if (!machine || !state) throw new Error(`unknown transition target: ${target}`);
    this.enter(machine, state);
  }

  private enter(machine: Machine, state: State): void {
    this.machine = machine;
    this.state = state;
    this.enteredAt = this.now;
    this.evaluator.enterState(this.now);
    this.emit({
      type: 'state_enter',
      machineId: machine.id,
      stateId: state.id,
      metronome: state.metronome ?? null,
    });
    this.log('state_enter', `${machine.id}.${state.id}`, {
      type: 'state_enter',
      machineId: machine.id,
      stateId: state.id,
    });
    this.sayLines(state);
  }

  private sayLines(state: State): void {
    state.say.forEach((text, i) => this.speak(text, 'narration', `${state.id}:say:${i}`));
  }

  private speak(text: string, priority: CoachingEvent['priority'], dedupeKey: string): void {
    this.emit({
      type: 'coach',
      event: { priority, text, stateId: this.state?.id ?? '', dedupeKey, t: this.now },
    });
    this.log('coach', text, { type: 'coach', priority, dedupeKey });
  }

  /** Log a metric sample on every edge the SITREP cares about, plus a slow heartbeat. */
  private logMetric(f: PerceptionFacts): void {
    const blind = this.isBlind();
    const shape = `${f.compressionActive}|${f.handsOnRegion}|${blind}`;
    if (shape === this.lastMetricShape && this.now - this.lastMetricAt < METRIC_SAMPLE_MS) return;
    this.lastMetricShape = shape;
    this.lastMetricAt = this.now;
    this.log('metric', describeMetric(f, blind), {
      type: 'metric',
      rate: f.compressionRate,
      compressionActive: f.compressionActive,
      handsOnRegion: f.handsOnRegion,
      poseConfidence: f.poseConfidence,
      blind,
    });
  }

  private log(kind: EventLogEntry['kind'], detail: string, data?: EventLogEntry['data']): void {
    this.emit({ type: 'log', entry: { t: this.now, kind, detail, data } });
  }

  private emit(out: EngineOutput): void {
    for (const cb of this.subs) cb(out);
  }
}

type KeywordTransition = Transition & { on: { kind: 'keyword'; keyword: string } };

function isKeyword(t: Transition): t is KeywordTransition {
  return t.on.kind === 'keyword';
}

function describeMetric(f: PerceptionFacts, blind: boolean): string {
  if (blind) return 'camera unreliable, coaching by voice';
  const parts: string[] = [];
  parts.push(f.compressionActive ? 'compressions active' : 'no compressions');
  if (f.compressionRate !== null) parts.push(`${Math.round(f.compressionRate)}/min`);
  if (f.handsOnRegion !== null) parts.push(f.handsOnRegion ? 'hands on wound' : 'hands off wound');
  return parts.join(', ');
}
