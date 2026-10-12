import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // `.trash` is the gitignored scratch area (project rule: unwanted files move
    // there instead of being deleted). Linting it reported errors from throwaway
    // probes that never ship, so it is ignored alongside the build output.
    ignores: ['dist', 'coverage', 'node_modules', '.playwright', 'playwright-report', '.trash'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Node-context config files.
  {
    files: ['*.config.{ts,js}', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
