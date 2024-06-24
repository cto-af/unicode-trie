import es6 from '@cto.af/eslint-config/es6.js';
import globals from '@cto.af/eslint-config/globals.js';
import mocha from 'eslint-plugin-mocha';

export default [
  {
    ignores: [
      '**/*.d.ts',
    ],
  },
  ...es6,
  {
    files: ['**/*.js'],
    rules: {
      'n/prefer-global/buffer': 'off',
      'prefer-named-capture-group': 'off',
    },
  },
  {
    files: ['test/*.js'],
    plugins: {
      mocha,
    },
    languageOptions: {
      globals: globals.mocha,
    },
    rules: {
      ...mocha.configs.recommended.rules,
      'mocha/no-mocha-arrows': 'off',
    },
  },
];
