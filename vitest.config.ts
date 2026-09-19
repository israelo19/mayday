// Unit tests run in plain node against the pure modules. Kept separate from vite.config.ts so
// the dev-server plugins stay out of tests. Two layouts coexist: P2's suite under tests/, and
// everyone else's *.test.ts beside the module it covers.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
