import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Module boundaries: engine ← content ← persistence/export ← store ← ui.
const layer = (from, forbidden, extra = []) => ({
  files: [`src/${from}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...forbidden.map((m) => ({
            group: [`**/${m}`, `**/${m}/**`],
            message: `${from} may not import ${m}`,
          })),
          ...extra,
        ],
      },
    ],
  },
});

const noBrowser = {
  group: ['react', 'react-dom', 'dexie', 'zustand'],
  message: 'the engine is pure: no UI or storage',
};

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/screens/**', 'src/main.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'no default exports outside UI screens' },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/**/*.test.ts', 'src/engine/__tests__/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'indexedDB',
        'navigator',
        'crypto',
        'fetch',
      ],
    },
  },
  layer('engine', ['content', 'store', 'persistence', 'export', 'ui'], [noBrowser]),
  layer('content', ['store', 'persistence', 'export', 'ui'], [noBrowser]),
  layer('export', ['store', 'persistence', 'ui'], [noBrowser]),
  layer(
    'persistence',
    ['store', 'export', 'ui'],
    [{ group: ['react', 'react-dom', 'zustand'], message: 'persistence has no UI' }],
  ),
  layer('store', ['ui'], [{ group: ['react-dom'], message: 'the store has no DOM rendering' }]),
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/persistence', '**/persistence/**'],
              message: 'the UI talks to the store, not persistence',
            },
          ],
        },
      ],
    },
  },
);
