import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'release/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'demo/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message: 'Use textContent / the h() helper; page text is untrusted.',
        },
      ],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-restricted-properties': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.*', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Node script whose callbacks run inside the page / extension worker.
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.webextensions } },
  },
);
