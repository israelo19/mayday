// The architectural rules from CLAUDE.md, enforced instead of remembered. The coaching path
// is perception -> engine -> voice; if a network call ever appears inside it, the app stops
// working with the wifi off and principle 2 is gone.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REFLEX_PATH = ['src/perception', 'src/protocol', 'src/voice', 'src/sitrep'];

// One exemption, and only one. A speaker provider may stream audio from the network because
// the default provider is local and the upgrade falls back to it within 800ms (docs/04).
// P3: ElevenLabsProvider and the ElevenLabs dispatcher agent belong under this path. Anywhere
// else on the reflex path, a network call means the app stops working with the wifi off.
const NETWORK_ALLOWED = ['src/voice/providers'];

function exempt(file: string): boolean {
  const normalized = file.split('\\').join('/');
  return NETWORK_ALLOWED.some((prefix) => normalized.startsWith(prefix));
}

function sourceFiles(dir: string): string[] {
  if (!exists(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    // Test files may spell out the tokens they forbid; the rule is about shipped code.
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Comments are allowed to name what the code must not do, so they are stripped before grepping. */
function code(path: string): string {
  return (
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      // A type-only import has no runtime effect and cannot reach the network or a model; the
      // DispatcherSim interface lives in src/ai and P3 implements it in src/voice (docs/04).
      .replace(/^\s*(import|export)\s+type\s[^;]*;?\s*$/gm, ' ')
  );
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

describe('the reflex path stays local', () => {
  const files = REFLEX_PATH.flatMap(sourceFiles);

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('makes no network calls outside a speaker provider', () => {
    const offenders = files
      .filter((f) => !exempt(f))
      .filter((f) => /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(code(f)));
    expect(offenders, `move networked speaker providers under ${NETWORK_ALLOWED[0]}/`).toEqual([]);
  });

  it('keeps the voice queue itself free of the networked provider', () => {
    // setProvider() injects the upgrade, so the queue never imports it and the default stays
    // local. This is the seam in docs/07, asserted rather than remembered.
    const queue = 'src/voice/out.ts';
    if (!exists(queue)) return;
    expect(/from\s+['"][^'"]*providers/.test(code(queue))).toBe(false);
  });

  it('never imports the episodic AI module', () => {
    const offenders = files.filter((f) => /from\s+['"][^'"]*\/ai(\/|['"])/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});

describe('the engine stays deterministic', () => {
  const files = sourceFiles('src/protocol');

  it('never reads the clock itself, so every test can control time', () => {
    const offenders = files.filter((f) => /Date\.now\(\)|performance\.now\(\)/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('has no randomness anywhere near a medical decision', () => {
    const offenders = files.filter((f) => /Math\.random\(/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});

describe('a human dials 911 (principle 5)', () => {
  // The app renders a CALL 911 button and a SIMULATED dispatcher. It never places a call:
  // no tel: link, no telephony API, anywhere in shipped code. Grepped, not remembered.
  const files = [...sourceFiles('src'), ...sourceFiles('web')];

  it('never links or calls a phone number', () => {
    const offenders = files.filter((f) => /['"`]tel:|telephony/i.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('labels the dispatcher as simulated on the live screen', () => {
    expect(readFileSync('web/ui/live/LiveApp.tsx', 'utf8')).toContain('Simulated dispatcher');
  });
});
