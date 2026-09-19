// The guide data is checked against docs/02 itself: every key names a state (or a
// keyword-triggered line) of its machine and every caption is a docs/02 line verbatim.
// This is the "authority is deterministic" guard for the pictures.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUIDES, guideFor, guideKeys } from './guides';
import { SCENE_IDS } from './types';

const DOC = readFileSync(new URL('../../../docs/02-protocols.md', import.meta.url), 'utf8');

/** The docs/02 section for one machine. */
function sectionOf(machine: string): string {
  const start = DOC.indexOf(`## MACHINE: ${machine}`);
  if (start === -1) throw new Error(`docs/02 has no "## MACHINE: ${machine}" section`);
  const end = DOC.indexOf('\n## ', start + 1);
  return DOC.slice(start, end === -1 ? undefined : end);
}

/** State ids docs/02 numbers, transition targets it names, and keywords it quotes, for one machine. */
function idsOf(machine: string): Set<string> {
  const section = sectionOf(machine);
  const ids = new Set<string>();
  for (const m of section.matchAll(/^\d+\. `([a-z_0-9]+)`/gm)) ids.add(m[1]);
  for (const m of section.matchAll(/=> ([a-z_0-9]+)/g)) ids.add(m[1]);
  for (const m of section.matchAll(/says '([a-z_0-9]+)'/g)) ids.add(m[1]);
  return ids;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.?!]+$/, '').trim();
const DOC_NORMALIZED = normalize(DOC);
const DASHES = /[\u2013\u2014]/;

describe('guide data', () => {
  it('has unique keys and at least one step each', () => {
    const keys = guideKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const g of GUIDES) expect(g.steps.length, g.key).toBeGreaterThan(0);
  });

  it('keys name a state, a transition target or a quoted keyword of that machine in docs/02', () => {
    for (const g of GUIDES) {
      const [machine, id] = g.key.split('.');
      expect(idsOf(machine).has(id), `${g.key} is not in docs/02`).toBe(true);
    }
  });

  it('every caption is a docs/02 line, verbatim', () => {
    for (const g of GUIDES) {
      for (const s of g.steps) {
        expect(DOC_NORMALIZED.includes(normalize(s.caption)), `${g.key}: "${s.caption}"`).toBe(true);
      }
    }
  });

  it('uses only registered scenes and readable hold times', () => {
    const scenes = new Set<string>(SCENE_IDS);
    for (const g of GUIDES) {
      for (const s of g.steps) {
        expect(scenes.has(s.scene), `${g.key} uses unknown scene ${s.scene}`).toBe(true);
        expect(s.holdMs, `${g.key} hold`).toBeGreaterThanOrEqual(3_000);
      }
    }
  });

  it('beat guides follow the AHA 100-120 range', () => {
    const withBeat = GUIDES.filter((g) => g.beat);
    expect(withBeat.map((g) => g.key)).toEqual(['cardiac.compressions']);
    for (const g of withBeat) {
      expect(g.beat!.bpm).toBeGreaterThanOrEqual(100);
      expect(g.beat!.bpm).toBeLessThanOrEqual(120);
      for (const s of g.steps) expect(s.scene).toBe('compressions');
    }
  });

  it('writes with plain hyphens, never dashes', () => {
    for (const g of GUIDES) {
      expect(DASHES.test(g.title), g.key).toBe(false);
      for (const s of g.steps) expect(DASHES.test(s.caption), g.key).toBe(false);
    }
  });

  it('guideFor returns null for a state without a picture', () => {
    expect(guideFor('bleeding.handoff')).toBeNull();
    expect(guideFor('triage.listening')).toBeNull();
    expect(guideFor('cardiac.position')?.steps.length).toBe(4);
  });
});
