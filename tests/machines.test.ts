import { describe, expect, it } from 'vitest';
import { lintMachines, machines } from '../src/protocol';
import type { Machine, State, Transition } from '../src/types';

describe('machine data', () => {
  it('passes the linter', () => {
    const issues = lintMachines(machines);
    expect(issues.map((i) => `${i.machineId}.${i.stateId ?? '-'}: ${i.message}`)).toEqual([]);
  });

  it('cites a guideline URL on every medical state', () => {
    for (const machine of machines.filter((m) => m.medical)) {
      for (const state of machine.states) {
        expect(state.source, `${machine.id}.${state.id}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('ships three protocols plus triage, as the architecture slide claims', () => {
    expect(machines.map((m) => m.id)).toEqual(['triage', 'cardiac', 'bleeding', 'choking']);
  });

  it('never coaches rescue breaths, because hands-only is what untrained bystanders are told', () => {
    const everyLine = machines
      .flatMap((m) => m.states.flatMap((s) => [...s.say, ...(s.coachingRules ?? []).map((r) => r.say)]))
      .join(' ')
      .toLowerCase();
    expect(everyLine).not.toContain('rescue breath');
    expect(everyLine).not.toContain('mouth to mouth');
  });

  it('mentions a tourniquet only as an answer to the word, never in an instruction', () => {
    const instructions = machines
      .flatMap((m) => m.states.flatMap((s) => [...s.say, ...(s.coachingRules ?? []).map((r) => r.say)]))
      .join(' ')
      .toLowerCase();
    expect(instructions).not.toContain('tourniquet');
    const answers = machines.flatMap((m) => m.keywordResponses ?? []);
    expect(answers.some((a) => a.keyword === 'tourniquet')).toBe(true);
  });

  it('labels and cites every answer, so the intent model can offer it and a human can check it', () => {
    for (const machine of machines) {
      for (const a of machine.keywordResponses ?? []) {
        expect(a.label, `${machine.id}: '${a.keyword}'`).toMatch(/\S/);
        expect(a.source, `${machine.id}: '${a.keyword}'`).toMatch(/^https:\/\//);
      }
    }
  });

  it('asks about scene safety before any bleeding instruction', () => {
    const bleeding = machines.find((m) => m.id === 'bleeding')!;
    expect(bleeding.initial).toBe('scene_safety');
    const sceneSafety = bleeding.states.find((s) => s.id === 'scene_safety')!;
    expect(sceneSafety.transitions.some((t) => t.on.kind === 'timerMs')).toBe(false);
  });

  it('tells the bystander to call 911 early in every medical machine', () => {
    for (const machine of machines.filter((m) => m.medical)) {
      const index = machine.states.findIndex((s) => s.call911);
      expect(index, `${machine.id} never shows CALL 911`).toBeGreaterThanOrEqual(0);
      expect(index, `${machine.id} shows CALL 911 too late`).toBeLessThanOrEqual(2);
    }
  });
});

/** A minimal machine the linter would otherwise pass, with one thing wrong. */
function tiny(patch: Partial<State> & { transitions?: Transition[] }, machinePatch: Partial<Machine> = {}): Machine {
  const first: State = {
    id: 'first',
    source: 'https://example.org/first',
    say: ['Say this.'],
    transitions: [
      { on: { kind: 'timerMs', ms: 8000 }, to: 'last', label: 'Called' },
      { on: { kind: 'manualAdvance' }, to: 'last', label: 'Next' },
    ],
    ...patch,
  };
  const last: State = { id: 'last', source: 'https://example.org/last', say: ['Done.'], terminal: true, transitions: [] };
  return { id: 'tiny', source: 'https://example.org', medical: true, initial: 'first', states: [first, last], ...machinePatch };
}

const messages = (machine: Machine): string[] => lintMachines([machine]).map((i) => i.message);

describe('the linter refuses', () => {
  it('a timer that fires at once', () => {
    const m = tiny({ transitions: [{ on: { kind: 'timerMs', ms: 0 }, to: 'last', label: 'Called' }, { on: { kind: 'manualAdvance' }, to: 'last', label: 'Next' }] });
    expect(messages(m)).toContain("timer to 'last' has no positive duration");
    expect(messages(tiny({}))).toEqual([]);
  });

  it('an empty line to say', () => {
    expect(messages(tiny({ say: ['Say this.', '  '] }))).toContain('state has an empty line to say');
  });

  it('a dot in a state id or a machine id', () => {
    expect(messages(tiny({}, { id: 'ti.ny' }))).toContain("machine id 'ti.ny' contains a dot");
    const m = tiny({ id: 'fi.rst', transitions: [{ on: { kind: 'manualAdvance' }, to: 'last', label: 'Next' }] }, { initial: 'fi.rst' });
    expect(messages(m)).toContain("state id 'fi.rst' contains a dot");
  });

  it('a keyword that is a global voice command', () => {
    const m = tiny({ transitions: [{ on: { kind: 'keyword', keyword: 'next' }, to: 'last', label: 'Go' }, { on: { kind: 'manualAdvance' }, to: 'last', label: 'Next' }] });
    expect(messages(m)).toContain("keyword 'next' is a global voice command");
  });

  it('a yes or a no bound by a state that asks no question', () => {
    const bind = (say: string[]) =>
      tiny({ say, transitions: [{ on: { kind: 'keyword', keyword: 'yes' }, to: 'last', label: 'Yes' }, { on: { kind: 'manualAdvance' }, to: 'last', label: 'Next' }] });
    expect(messages(bind(['Say this.']))).toContain("keyword 'yes' is a yes/no answer, and this state asks no question");
    expect(messages(bind(['Is he breathing?']))).toEqual([]);
    const answer = tiny({}, { keywordResponses: [{ keyword: 'no', label: 'No', say: 'Okay.', priority: 'correction', source: 'https://example.org' }] });
    expect(messages(answer)).toContain("answer 'no' is a yes/no answer");
  });

  it('a short keyword listed before a longer one that contains it and leads elsewhere', () => {
    const order = (first: [string, string], second: [string, string]) =>
      tiny({
        transitions: [
          { on: { kind: 'keyword', keyword: first[0] }, to: first[1], label: 'A' },
          { on: { kind: 'keyword', keyword: second[0] }, to: second[1], label: 'B' },
          { on: { kind: 'manualAdvance' }, to: 'last', label: 'Next' },
        ],
      });
    expect(messages(order(['breathing normally', 'last'], ['not breathing normally', 'first']))).toContain(
      "keyword 'not breathing normally' contains 'breathing normally' and leads elsewhere, so it must be listed first",
    );
    // The other way round is the rule, and a pair with one target may sit in either order.
    expect(messages(order(['not breathing normally', 'first'], ['breathing normally', 'last']))).toEqual([]);
    expect(messages(order(['safe', 'last'], ['safe now', 'last']))).toEqual([]);
  });
});
