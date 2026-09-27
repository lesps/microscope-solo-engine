import { defineConfig } from 'vitest/config';

// Mutation testing runs the engine-facing (node) tests only; the DOM suite adds minutes and
// cannot kill engine mutants the engine tests miss.
export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/fixtures/make-fixtures.test.ts'],
    environment: 'node',
  },
});
