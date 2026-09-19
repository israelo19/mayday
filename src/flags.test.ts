// `?flag=` is the only switch for the episodic upgrades (docs/04). One name flips one flag;
// a comma list flips several, so a phone URL can turn on the ElevenLabs voice and the
// ElevenLabs dispatcher together. Unknown names are ignored, never an error.
import { describe, expect, it } from 'vitest';
import { parseFlags } from './flags';

describe('parseFlags', () => {
  it('defaults every flag off', () => {
    expect(parseFlags('')).toEqual({
      elevenLabs: false,
      dispatcherSim: false,
      visionDescribe: false,
      narrationFlavor: false,
    });
  });

  it('flips exactly the named flag', () => {
    expect(parseFlags('?flag=visionDescribe').visionDescribe).toBe(true);
    expect(parseFlags('?flag=visionDescribe').elevenLabs).toBe(false);
  });

  it('flips several flags from a comma list', () => {
    const f = parseFlags('?debug=1&flag=elevenLabs,dispatcherSim');
    expect(f.elevenLabs).toBe(true);
    expect(f.dispatcherSim).toBe(true);
    expect(f.narrationFlavor).toBe(false);
  });

  it('ignores unknown names and stray spaces', () => {
    const f = parseFlags('?flag=nope, elevenLabs ,');
    expect(f.elevenLabs).toBe(true);
    expect(f.dispatcherSim).toBe(false);
  });
});
