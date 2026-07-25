// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    settings: {
      "import/resolver": {
        alias: {
          map: [["@", "."]],
          extensions: [".js", ".jsx", ".json"],
        },
      },
    },
    rules: {
      // JSX entities render as literal text in React Native; normal apostrophes
      // are both safe and more readable in customer-facing copy.
      "react/no-unescaped-entities": "off",
    },
  }
]);
