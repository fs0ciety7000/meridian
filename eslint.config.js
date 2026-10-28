// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (docs/architecture.md §3), expressed with core rules so that
 * they need no module resolver: each zone lists the workspace packages it may NOT import.
 */
const forbid = (packages, extraPatterns = []) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...packages.map((p) => ({
          group: [p, `${p}/*`],
          message: `Boundary: ${p} is off-limits here (architecture §3).`,
        })),
        ...extraPatterns,
      ],
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'tools/geo-pipeline/.cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // packages/engine: pure, deterministic, isomorphic — no DOM, network, clock or randomness.
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      ...forbid([
        '@meridian/web',
        '@meridian/server',
        '@meridian/design-tokens',
        '@meridian/geo-pipeline',
        'react',
        'node:*',
      ]),
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'fetch',
        'navigator',
        'localStorage',
        'setTimeout',
        'setInterval',
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded PRNG passed through actions.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Time comes from actions, never from the clock.',
        },
      ],
    },
  },
  {
    files: ['packages/geo/src/**/*.ts', 'packages/content-schema/src/**/*.ts'],
    rules: forbid([
      '@meridian/engine',
      '@meridian/web',
      '@meridian/server',
      '@meridian/geo-pipeline',
      'react',
    ]),
  },
  {
    files: ['apps/server/src/**/*.ts'],
    rules: forbid(['@meridian/web', '@meridian/geo-pipeline', 'react']),
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: forbid(['@meridian/server', '@meridian/geo-pipeline']),
  },
  // The map is a generic component driven by props/commands: it never imports features.
  {
    files: ['apps/web/src/map/**/*.{ts,tsx}'],
    rules: forbid(
      ['@meridian/server', '@meridian/geo-pipeline'],
      [
        {
          group: ['**/features/**'],
          message: 'Boundary: map/ must not import features/ (architecture §3).',
        },
      ],
    ),
  },
);
