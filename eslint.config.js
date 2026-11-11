// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", ".sim-build/*"],
  },
  {
    // Los scripts de tools/ corren en Node, no en el teléfono.
    files: ["tools/**/*.js"],
    languageOptions: { globals: globals.node },
  },
]);
