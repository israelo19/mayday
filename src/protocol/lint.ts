// Structural checks on the machine data. These run as a test, so a machine that could wedge
// the demo or ship an uncited medical line fails the build instead of the stage.
import type { Machine, State, Transition } from '../types';
import { GLOBAL_KEYWORDS } from './engine';
import { isSubsequence, stemKey, tokens } from './language';
import { CONFIRM_WORDS, REJECT_WORDS } from './phrases';

export type LintIssue = { machineId: string; stateId?: string; message: string };

type Key = string; // `${machineId}.${stateId}`

/** The session answers a yes/no question on screen with these before the engine hears them. */
const ANSWER_WORDS = new Set([...CONFIRM_WORDS, ...REJECT_WORDS].map(stemKey));
const GLOBALS = new Set(GLOBAL_KEYWORDS.map(stemKey));

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
    // The engine reads `machine.state` as a cross-machine target, so a dot in either id would
    // split it in the wrong place.
    if (machine.id.includes('.')) push(undefined, `machine id '${machine.id}' contains a dot`);
    const seenStates = new Set<string>();
    for (const state of machine.states) {
      if (seenStates.has(state.id)) push(state.id, 'duplicate state id');
      seenStates.add(state.id);
      if (state.id.includes('.')) push(state.id, `state id '${state.id}' contains a dot`);

      if (machine.medical && !state.source.startsWith('http')) {
        push(state.id, 'medical state has no cited source URL');
      }
      if (state.say.length === 0 && !state.terminal) push(state.id, 'state says nothing');
      if (state.say.some((line) => !line.trim())) push(state.id, 'state has an empty line to say');
      const asksQuestion = state.say.some((line) => line.includes('?'));

      const keywords = new Map<string, string>();
      const listed: { keyword: string; words: string[]; to: string }[] = [];
      for (const t of state.transitions) {
        if (t.on.kind === 'keyword') {
          // Two keywords that stem alike ('choke', 'choking') are one keyword twice: the matcher
          // could only ever return the longer one, so the other would never resolve to itself.
          const key = stemKey(t.on.keyword);
          const clash = keywords.get(key);
          if (clash !== undefined) push(state.id, `duplicate keyword '${t.on.keyword}' (same words as '${clash}')`);
          keywords.set(key, t.on.keyword);
          // A state's keywords get first refusal, so one spelled like NEXT or REPEAT would take
          // the voice command away from every other state's behaviour.
          if (GLOBALS.has(key)) push(state.id, `keyword '${t.on.keyword}' is a global voice command`);
          // Yes and no belong to whatever the app last asked. A state may bind them only when
          // it asks a question of its own (cardiac.check_breathing: "Is he breathing normally?").
          if (ANSWER_WORDS.has(key) && !asksQuestion) {
            push(state.id, `keyword '${t.on.keyword}' is a yes/no answer, and this state asks no question`);
          }
          // Priority is data order: the engine takes the first keyword it heard. When a keyword
          // sits inside a longer one ('breathing normally' inside 'not breathing normally') and
          // they lead to different places, the longer one must be listed first, or the shorter
          // one would win on the sentence that means the longer one.
          const words = tokens(t.on.keyword);
          for (const earlier of listed) {
            if (earlier.to !== t.to && earlier.words.length < words.length && isSubsequence(earlier.words, words)) {
              push(state.id, `keyword '${t.on.keyword}' contains '${earlier.keyword}' and leads elsewhere, so it must be listed first`);
            }
          }
          listed.push({ keyword: t.on.keyword, words, to: t.to });
        }
        if (t.on.kind === 'timerMs' && !(t.on.ms > 0)) push(state.id, `timer to '${t.to}' has no positive duration`);
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

  for (const machine of machines) {
    const push = (message: string) => issues.push({ machineId: machine.id, message });
    // An answer's phrase must not be one a step already owns: the matcher would hand the
    // words to whichever candidate sorts longer, and a question could become a transition.
    const owned = new Map<string, string>();
    for (const state of machine.states) {
      for (const t of state.transitions) if (t.on.kind === 'keyword') owned.set(stemKey(t.on.keyword), `${state.id}: '${t.on.keyword}'`);
    }
    const seen = new Map<string, string>();
    for (const a of machine.keywordResponses ?? []) {
      const key = stemKey(a.keyword);
      const owner = owned.get(key);
      if (owner) push(`answer '${a.keyword}' is also a step's keyword (${owner})`);
      if (GLOBALS.has(key)) push(`answer '${a.keyword}' is a global voice command`);
      if (ANSWER_WORDS.has(key)) push(`answer '${a.keyword}' is a yes/no answer`);
      const twin = seen.get(key);
      if (twin !== undefined) push(`duplicate answer keyword '${a.keyword}' (same words as '${twin}')`);
      seen.set(key, a.keyword);
      if (!a.label.trim()) push(`answer '${a.keyword}' has no label`);
      if (!a.say.trim()) push(`answer '${a.keyword}' says nothing`);
      if (machine.medical && !a.source.startsWith('http')) push(`answer '${a.keyword}' has no cited source URL`);
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
