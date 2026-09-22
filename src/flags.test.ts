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
      sceneAssess: false,
      intentRoute: false,
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

  it('ignores a name the object only inherits', () => {
    const f = parseFlags('?flag=toString,constructor');
    expect(f).toEqual(parseFlags(''));
    expect(Object.hasOwn(f, 'toString')).toBe(false);
    expect(() => String(f)).not.toThrow();
  });

  it('honours every flag= in the query, not just the first', () => {
    const f = parseFlags('?flag=elevenLabs&debug=1&flag=dispatcherSim');
    expect(f.elevenLabs).toBe(true);
    expect(f.dispatcherSim).toBe(true);
    expect(f.visionDescribe).toBe(false);
  });
});
