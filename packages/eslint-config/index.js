module.exports = {
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
      "ecmaVersion": 2021,
      "sourceType": "module"
  },
  "plugins": [
      "@typescript-eslint", "prettier"
  ],
  "extends": [
      "plugin:@typescript-eslint/recommended",
      "prettier/@typescript-eslint",
      "plugin:prettier/recommended"
  ],
  "rules": {
      "curly": "warn",
      "eqeqeq": "error",
      "no-throw-literal": "warn",
      "@typescript-eslint/no-empty-function": "off"
  }
};
