import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'virtual:pwa-register/react': path.join(root, 'tests/support/pwa-stub.ts') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['tests/support/dom-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**', 'src/main.tsx', 'src/**/index.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Floors, not targets: CI fails if coverage drops below them. The engine is held higher.
      thresholds: {
        statements: 98,
        lines: 98,
        functions: 95,
        branches: 90,
        'src/engine/**': { statements: 99, lines: 99, functions: 100, branches: 93 },
      },
    },
  },
});
