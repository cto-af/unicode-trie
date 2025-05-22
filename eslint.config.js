import es6 from '@cto.af/eslint-config/es6.js';
import globals from '@cto.af/eslint-config/globals.js';
import mocha from 'eslint-plugin-mocha';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/coverage/**',
      '**/docs/**',
    ],
  },
  ...es6,
  {
    files: [
      'pkg/*/test/**/*.test.js',
    ],
    languageOptions: {
      globals: globals.mocha,
    },
    plugins: {
      mocha,
    },
    rules: {
      ...mocha.configs.recommended.rules,
      'mocha/no-mocha-arrows': 'off',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      // Don't want to import from Buffer, so that this code can test for
      // Buffer being defined at runtime, and fall back on worse code in the
      // browser.
      'n/prefer-global/buffer': 'off',
      'prefer-named-capture-group': 'off',
    },
  },
  {
    files: ['examples/getLineBreak.js'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
];
