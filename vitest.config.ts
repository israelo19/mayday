// Unit tests run in plain node against the pure modules (guide data, beat math,
// judgement). Kept separate from vite.config.ts so the dev-server plugins stay out of tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
