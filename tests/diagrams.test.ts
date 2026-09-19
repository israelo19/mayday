// The diagrams in docs/ are generated from the machine data. This test regenerates them with
// `npm run diagrams` and otherwise fails when the committed file has drifted, so the picture
// in the README and the deck always matches the protocol the engine actually runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { machines } from '../src/protocol';
import { allDiagrams } from '../src/protocol/mermaid';

const PATH = 'docs/protocol-diagrams.md';

const HEADER = `# Protocol diagrams

Generated from \`src/protocol/machines\`. Do not edit by hand: change the machine data and run
\`npm run diagrams\`. Every edge below is a transition the engine can actually take, and every
NEXT edge is a button on screen.
`;

function render(): string {
  return `${HEADER}\n${allDiagrams(machines)}\n`;
}

describe('protocol diagrams', () => {
  it('draws every machine', () => {
    const diagram = allDiagrams(machines);
    expect(diagram).toContain('stateDiagram-v2');
    expect(diagram).toContain('cardiac_compressions: compressions (110 bpm)');
    // Cross-machine edges must survive, or the diagram would tell a comforting lie.
    expect(diagram).toContain('choking_back_blows --> cardiac_position');
  });

  it('matches the committed file', () => {
    const wanted = render();
    if (process.env.UPDATE_DIAGRAMS === '1') {
      writeFileSync(PATH, wanted);
      return;
    }
    const found = (() => {
      try {
        return readFileSync(PATH, 'utf8');
      } catch {
        return '';
      }
    })();
    // Git may check this file out with CRLF (core.autocrlf on Windows); compare content, not
    // line-ending convention.
    const normalize = (s: string) => s.replace(/\r\n/g, '\n');
    expect(normalize(found), `${PATH} is stale, run: npm run diagrams`).toBe(normalize(wanted));
  });
});
