// Unit tests run in plain node against the pure modules. Kept separate from vite.config.ts so
// the dev-server plugins stay out of tests. Three trees: `src` (engine), `web` (browser app),
// and P2's suite under `tests/`; all run from the repo root because the boundary tests resolve
// paths from the CWD.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'web/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
