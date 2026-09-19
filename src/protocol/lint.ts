// Structural checks on the machine data. These run as a test, so a machine that could wedge
// the demo or ship an uncited medical line fails the build instead of the stage.
import type { Machine, State, Transition } from '../types';

export type LintIssue = { machineId: string; stateId?: string; message: string };

type Key = string; // `${machineId}.${stateId}`

export function lintMachines(machines: readonly Machine[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const index = new Map<Key, { machine: Machine; state: State }>();
  for (const machine of machines) {
    for (const state of machine.states) index.set(`${machine.id}.${state.id}`, { machine, state });
  }

  for (const machine of machines) {
    const push = (stateId: string | undefined, message: string) =>
      issues.push({ machineId: machine.id, stateId, message });

    if (!machine.states.some((s) => s.id === machine.initial)) {
      push(undefined, `initial state '${machine.initial}' does not exist`);
    }
    const seenStates = new Set<string>();
    for (const state of machine.states) {
      if (seenStates.has(state.id)) push(state.id, 'duplicate state id');
      seenStates.add(state.id);

      if (machine.medical && !state.source.startsWith('http')) {
        push(state.id, 'medical state has no cited source URL');
      }
      if (state.say.length === 0 && !state.terminal) push(state.id, 'state says nothing');

      const keywords = new Set<string>();
      for (const t of state.transitions) {
        if (t.on.kind === 'keyword') {
          if (keywords.has(t.on.keyword)) push(state.id, `duplicate keyword '${t.on.keyword}'`);
          keywords.add(t.on.keyword);
        }
        if (!index.has(resolve(machine.id, t.to))) {
          push(state.id, `transition target '${t.to}' does not exist`);
        }
        if (!t.label.trim()) push(state.id, 'transition has no button label');
      }

      const hasManual = state.transitions.some((t) => t.on.kind === 'manualAdvance');
      if (!state.terminal && !hasManual) push(state.id, 'non-terminal state has no manualAdvance');
      if (state.terminal && state.transitions.length > 0) push(state.id, 'terminal state has transitions');

      const ruleIds = new Set<string>();
      for (const rule of state.coachingRules ?? []) {
        if (ruleIds.has(rule.id)) push(state.id, `duplicate rule id '${rule.id}'`);
        ruleIds.add(rule.id);
        if (!rule.say.trim()) push(state.id, `rule '${rule.id}' says nothing`);
        if (rule.everyMs && rule.cooldownMs && rule.cooldownMs > rule.everyMs) {
          push(state.id, `rule '${rule.id}' cooldown outlives its everyMs period`);
        }
      }

      // A required word absent from the canonical text would reject the canonical line itself.
      const spoken = state.say.join(' ').toLowerCase();
      for (const word of state.requiredWords ?? []) {
        if (!spoken.includes(word.toLowerCase())) {
          push(state.id, `requiredWord '${word}' does not appear in this state's own lines`);
        }
      }
    }
  }

  issues.push(...reachability(machines, index));
  return issues;
}

/** Dead states are demo landmines, and a state only reachable by a fact or a timer cannot be rescued by tapping. */
function reachability(
  machines: readonly Machine[],
  index: Map<Key, { machine: Machine; state: State }>,
): LintIssue[] {
  const issues: LintIssue[] = [];
  const roots = machines.map((m) => `${m.id}.${m.initial}`);
  const all = walk(index, roots, () => true);
  const byTap = walk(index, roots, (t) => t.on.kind === 'keyword' || t.on.kind === 'manualAdvance');

  for (const [key, { machine, state }] of index) {
    if (!all.has(key)) issues.push({ machineId: machine.id, stateId: state.id, message: 'dead state, nothing reaches it' });
    else if (!byTap.has(key)) {
      issues.push({ machineId: machine.id, stateId: state.id, message: 'state is not reachable by tapping a button' });
    }
  }
  return issues;
}

function walk(
  index: Map<Key, { machine: Machine; state: State }>,
  roots: readonly string[],
  allow: (t: Transition) => boolean,
): Set<Key> {
  const seen = new Set<Key>(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const key = queue.shift() as Key;
    const node = index.get(key);
    if (!node) continue;
    for (const t of node.state.transitions) {
      if (!allow(t)) continue;
      const next = resolve(node.machine.id, t.to);
      if (!seen.has(next) && index.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function resolve(machineId: string, target: string): Key {
  return target.includes('.') ? target : `${machineId}.${target}`;
}
