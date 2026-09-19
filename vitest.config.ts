import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so the dev server's HTTPS plugins never load in a test run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
