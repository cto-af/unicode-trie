'use strict';

module.exports = {
  extends: '@cto.af/eslint-config/modules',
  parserOptions: {
    ecmaVersion: 2022,
  },
  rules: {
    'prefer-named-capture-group': 'off',
    'semi': ['error', 'always'],
    'semi-style': ['error', 'last'],
    'n/prefer-global/buffer': ['error', 'always'],
  },
};
