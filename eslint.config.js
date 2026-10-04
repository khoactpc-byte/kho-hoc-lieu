import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    'dist/**',
    'node_modules/**',
    '.npm-cache/**',
    'backup_corrupted/**'
  ]),
  {
    files: ['src/**/*.{js,jsx}', 'test/**/*.{js,jsx}', 'netlify/**/*.mjs', 'scripts/*.mjs', '*.config.js'],
    extends: [js.configs.recommended, reactRefresh.configs.vite],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } }
    }
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['test/**/*.{js,jsx}', 'netlify/**/*.mjs', 'scripts/*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node }
  }
]);
