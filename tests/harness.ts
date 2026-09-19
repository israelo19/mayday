// Shared test rig. The clock is an argument everywhere, so every test below is deterministic.
import { createEngine, machines, type EngineOutput } from '../src/protocol';
import { FakeFacts, type FakeControls } from '../src/perception/fake';
import type { CoachingEvent, EventLogEntry } from '../src/types';

export const T0 = 1_700_000_000_000;

export function harness(machineId: string, stateId?: string, controls: Partial<FakeControls> = {}) {
  const engine = createEngine(machines);
  const outputs: EngineOutput[] = [];
  engine.subscribe((o) => outputs.push(o));
  engine.tick(T0);
  engine.start(machineId, stateId);
  const facts = new FakeFacts(controls);

  return {
    engine,
    facts,
    outputs,
    /** Drive both the facts stream and the 100ms orchestrator tick, as session.ts will. */
    run(fromMs: number, toMs: number, stepMs = 100) {
      for (let t = T0 + fromMs; t <= T0 + toMs; t += stepMs) {
        engine.onFacts(facts.at(t));
        engine.tick(t);
      }
    },
    /** Tick only, as if perception had stopped reporting. */
    idle(fromMs: number, toMs: number, stepMs = 100) {
      for (let t = T0 + fromMs; t <= T0 + toMs; t += stepMs) engine.tick(t);
    },
    coach: (): CoachingEvent[] =>
      outputs.flatMap((o) => (o.type === 'coach' ? [o.event] : [])),
    fired: (dedupeKey: string): CoachingEvent[] =>
      outputs.flatMap((o) => (o.type === 'coach' && o.event.dedupeKey === dedupeKey ? [o.event] : [])),
    log: (): EventLogEntry[] => outputs.flatMap((o) => (o.type === 'log' ? [o.entry] : [])),
    stateKey: () => {
      const s = engine.currentState();
      return s ? `${s.machineId}.${s.state.id}` : null;
    },
  };
}
