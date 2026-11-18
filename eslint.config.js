import { fileURLToPath } from "node:url";
import tsParser from "@typescript-eslint/parser";
import html from "@html-eslint/eslint-plugin";
import vue from "eslint-plugin-vue";
import oxlint from "eslint-plugin-oxlint";

export default [
  {
    // Standalone scripts are checked by Oxlint, including direct ESLint invocations.
    ignores: [
      "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-ssr/**",
      ".tmp/**",
      "public/**",
    ],
  },
  ...vue.configs["flat/recommended"].map((config) => ({
    ...config,
    files: ["**/*.vue"],
  })),
  {
    files: ["**/*.html"],
    plugins: { html },
    language: "html/html",
    rules: {
      ...html.configs.recommended.rules,
      // Oxfmt owns layout; lint checks HTML semantics and structure.
      "html/no-extra-spacing-tags": "off",
      "html/attrs-newline": "off",
      "html/element-newline": "off",
      "html/indent": "off",
      "html/quotes": "off",
      "html/require-closing-tags": ["error", { selfClosing: "always" }],
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tsParser, extraFileExtensions: [".vue"] },
    },
    // Formatting belongs to Oxfmt; this repository uses Vue 3.
    rules: {
      "vue/html-self-closing": "off",
      "vue/no-multi-spaces": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/html-indent": "off",
      "vue/attributes-order": "off",
      "vue/order-in-components": "off",
      "vue/html-comment-content-spacing": "off",
      "vue/html-comment-content-newline": "off",
      "vue/no-spaces-around-equal-signs-in-attribute": "off",
      "vue/mustache-interpolation-spacing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/html-quotes": "off",
      "vue/static-class-names-order": "off",
      "vue/html-closing-bracket-spacing": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/padding-line-between-blocks": "off",
      "vue/block-order": "off",
      "vue/block-tag-newline": "off",
      "vue/v-slot-style": "off",
      "vue/v-on-style": "off",
      "vue/v-bind-style": "off",
      "vue/v-for-delimiter-style": "off",
      "vue/prefer-true-attribute-shorthand": "off",
      "vue/prefer-separate-static-class": "off",
      "vue/no-static-inline-styles": "off",
      "vue/no-v-for-template-key": "off",
      "vue/no-v-model-argument": "off",
      "vue/no-custom-modifiers-on-v-model": "off",
      "vue/no-multiple-template-root": "off",
      "vue/no-root-v-if": "off",
      "vue/multi-word-component-names": "off",
      "vue/no-shadow-native-events": "warn",
    },
  },
  // Disable only rules enabled by our Oxlint config. Keep this last.
  ...(await oxlint.buildFromConfigFile(
    fileURLToPath(new URL("./.oxlintrc.json", import.meta.url)),
  )),
];
