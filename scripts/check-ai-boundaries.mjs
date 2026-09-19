#!/usr/bin/env node
// Enforces CLAUDE.md principle 3 (cognition is episodic) and docs/07 task "AI seams": nothing
// under src/perception, src/protocol or src/voice may pull a *value* out of src/ai. A `import
// type` is fine (e.g. src/voice's DispatcherSim, docs/04) because a type has no runtime effect
// and can never place a network call.
//
// This exists instead of the ESLint `no-restricted-imports` rule docs/07 P4 task 4 calls for
// because typescript-eslint does not yet support TypeScript 7 (see DECISIONS.md). Same intent,
// same "npm run lint" entry point, zero new dependency.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
// src/platform is the Expo Go shell bridge: a reflex path (speech, haptics), so it is guarded too.
const GUARDED_DIRS = ['src/perception', 'src/protocol', 'src/voice', 'src/platform'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// Matches: import ... from 'X'; export ... from 'X'; import('X'). Captures the `type` keyword
// right after `import`/`export` (if present) and the specifier.
const IMPORT_RE = /\b(import|export)\s+(type\s+)?(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function targetsAi(specifier) {
  return specifier.split('/').includes('ai');
}

let violations = [];

for (const dir of GUARDED_DIRS) {
  let files;
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue; // dir doesn't exist yet (e.g. src/protocol pre-P2)
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    for (const m of src.matchAll(IMPORT_RE)) {
      const [, , isType, specifier] = m;
      if (!targetsAi(specifier)) continue;
      if (isType) continue; // `import type` / `export type` — no runtime effect, allowed
      violations.push(`${rel}: value import of src/ai ('${specifier}')`);
    }
    for (const m of src.matchAll(DYNAMIC_IMPORT_RE)) {
      const specifier = m[1];
      if (targetsAi(specifier)) violations.push(`${rel}: dynamic import of src/ai ('${specifier}')`);
    }
  }
}

if (violations.length > 0) {
  console.error('AI boundary violation: perception/protocol/voice/platform may not import src/ai at runtime.\n');
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nUse `import type` if only a shared shape is needed (see src/ai/dispatcher.ts).');
  process.exit(1);
}

console.log('AI boundary check passed: no perception/protocol/voice/platform file imports a value from src/ai.');
