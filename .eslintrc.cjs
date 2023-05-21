"use strict";

module.exports = {
  root: true,
  extends: ["@peggyjs"],
  ignorePatterns: [
    "docs/",
    "node_modules/",
  ],
  overrides: [
    {
      files: ["*.js"],
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2021,
      },
      rules: {
        "no-eq-null": "off",
        "eqeqeq": ["error", "always", { "null": "ignore" }],
      },
    },
    {
      files: ["test/*.js"],
      env: {
        mocha: true,
      },
    },
  ],
};
