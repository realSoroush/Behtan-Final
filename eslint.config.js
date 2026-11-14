import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    // Build output and the generated local Supabase copy are not source.
    ignores: ['dist', 'dist-admin', 'dist-pro', '.cache', '.local-supabase', 'vite.config.js', 'vite.config.d.ts', '*.tsbuildinfo'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // TypeScript resolves identifiers (including Deno/React globals) during
      // type-checking; ESLint's base rule reports false positives in TS files.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The Vite app modules are Fast Refresh boundaries. Standalone preview and
    // browser test entry points mount their own roots and use a full reload.
    files: ['src/**/*.tsx'],
    ...reactRefresh.configs.vite,
  },
];
