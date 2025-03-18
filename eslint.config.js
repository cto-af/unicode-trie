import es6 from '@cto.af/eslint-config/es6.js';
import mocha from '@cto.af/eslint-config/mocha.js';

export default [
  ...es6,
  ...mocha,
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
];
