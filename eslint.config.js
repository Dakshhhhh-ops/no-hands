import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  Image: 'readonly',
  HTMLElement: 'readonly',
  SpeechRecognition: 'readonly',
  webkitSpeechRecognition: 'readonly',
  localStorage: 'readonly',
  self: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  AbortController: 'readonly',
  IntersectionObserver: 'readonly',
  MutationObserver: 'readonly',
  Element: 'readonly',
  sessionStorage: 'readonly',
  performance: 'readonly',
  requestIdleCallback: 'readonly',
};

const nodeGlobals = {
  Buffer: 'readonly',
  structuredClone: 'readonly',
  process: 'readonly',
  global: 'readonly',
  __dirname: 'readonly',
  module: 'readonly',
  require: 'readonly',
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: { ...browserGlobals },
    },
    settings: { react: { version: '18.3' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The TypeScript rule understands JSX references; the core rule double-reports.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['**/*.test.js', '**/*.test.ts', '**/tests/**/*.js'],
    languageOptions: { globals: { ...nodeGlobals, ...browserGlobals } },
    rules: { 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': 'off' },
  },
  {
    files: ['src/data/*.js', 'src/data/*.ts', 'src/utils/*.js'],
    languageOptions: { globals: { ...nodeGlobals, ...browserGlobals } },
  },
  {
    files: ['src/main.jsx'],
    languageOptions: { globals: browserGlobals },
  },
  {
    files: ['src/hooks/*.ts'],
    languageOptions: { globals: browserGlobals },
  },
  {
    files: ['public/*.js'],
    languageOptions: { globals: { ...browserGlobals, self: 'readonly' } },
  }
);