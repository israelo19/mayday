// The architectural rules from CLAUDE.md, enforced instead of remembered. The coaching path
// is perception -> engine -> voice; if a network call ever appears inside it, the app stops
// working with the wifi off and principle 2 is gone.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REFLEX_PATH = ['src/perception', 'src/protocol', 'src/voice', 'src/sitrep'];

function sourceFiles(dir: string): string[] {
  if (!exists(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Comments are allowed to name what the code must not do, so they are stripped before grepping. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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

  it('makes no network calls', () => {
    const offenders = files.filter((f) => /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(code(f)));
    expect(offenders).toEqual([]);
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
