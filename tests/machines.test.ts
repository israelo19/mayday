import { describe, expect, it } from 'vitest';
import { lintMachines, machines } from '../src/protocol';

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
