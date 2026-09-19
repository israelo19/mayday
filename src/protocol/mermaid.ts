// Diagrams generated from the machine data, so the picture in the README and the deck can
// never drift from the protocol the app actually runs.
import type { Machine, Transition } from '../types';

export function toMermaid(machine: Machine): string {
  const lines = ['stateDiagram-v2', `    [*] --> ${nodeId(machine.id, machine.initial)}`];
  for (const state of machine.states) {
    const from = nodeId(machine.id, state.id);
    lines.push(`    ${from}: ${state.id}${state.metronome ? ` (${state.metronome} bpm)` : ''}`);
    for (const t of state.transitions) {
      lines.push(`    ${from} --> ${nodeId(machine.id, t.to)}: ${edgeLabel(t)}`);
    }
    if (state.terminal) lines.push(`    ${from} --> [*]`);
  }
  return lines.join('\n');
}

export function allDiagrams(machines: readonly Machine[]): string {
  return machines
    .map((m) => `### ${m.id}\n\nSource: ${m.source}\n\n\`\`\`mermaid\n${toMermaid(m)}\n\`\`\``)
    .join('\n\n');
}

function edgeLabel(t: Transition): string {
  switch (t.on.kind) {
    case 'keyword':
      return `"${t.on.keyword}"`;
    case 'timerMs':
      return `after ${Math.round(t.on.ms / 1000)}s`;
    case 'fact':
      return `${t.label} (measured)`;
    case 'manualAdvance':
      return 'NEXT';
  }
}

/** Mermaid node ids cannot carry the dot we use for cross-machine targets. */
function nodeId(machineId: string, target: string): string {
  return (target.includes('.') ? target : `${machineId}.${target}`).replace(/\./g, '_');
}
