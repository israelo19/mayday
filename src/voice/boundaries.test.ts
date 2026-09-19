// CLAUDE.md principle 2 for this module, enforced instead of remembered: the coaching
// voice must keep working with the network unplugged, so nothing under src/voice may
// touch the network — except src/voice/providers/, where the flagged upgrades live,
// because the default provider is local and every upgrade falls back to it (docs/04).
// P2's repo-wide version of this test was lost with their branch; this is the voice
// module's own copy of the rule they designed. Owned by P3 (docs/07).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const VOICE_DIR = dirname(fileURLToPath(import.meta.url));
/** The one place a network call is allowed: injected via setProvider(), never the default. */
const NETWORK_ALLOWED = 'providers';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    // Shipping code only: tests may name the forbidden tokens (this file does, and the
    // provider tests fake fetch); only code that ships can place a call.
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Comments may name what the code must not do, so strip them before grepping. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const inProviders = (file: string): boolean =>
  relative(VOICE_DIR, file).split(sep).includes(NETWORK_ALLOWED);

describe('the voice module stays local', () => {
  const files = sourceFiles(VOICE_DIR);

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('makes no network calls outside src/voice/providers/', () => {
    const offenders = files
      .filter((f) => !inProviders(f))
      .filter((f) => /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|EventSource|navigator\.sendBeacon/.test(code(f)))
      .map((f) => relative(VOICE_DIR, f));
    expect(offenders, `networked speech belongs under src/voice/${NETWORK_ALLOWED}/`).toEqual([]);
  });

  it('keeps the queue itself free of the networked providers', () => {
    // setProvider() injects the upgrade; the queue never imports it, so the default path
    // is local by construction and the wifi-off demo cannot regress quietly.
    const queue = join(VOICE_DIR, 'out.ts');
    expect(new RegExp(`from\\s+['"][^'"]*${NETWORK_ALLOWED}`).test(code(queue))).toBe(false);
  });

  it('never imports the episodic AI module as a value', () => {
    // `import type` is fine (the DispatcherSim shape lives in src/ai); a value import is
    // how a network call would sneak in. npm run lint checks this too; here it runs with
    // the suite so a red shows up wherever tests do.
    const offenders = files
      .filter((f) => /(^|[^:])\bimport\s+(?!type\b)[^'"]*from\s+['"][^'"]*\/ai(\/|['"])/m.test(code(f)))
      .map((f) => relative(VOICE_DIR, f));
    expect(offenders).toEqual([]);
  });
});
