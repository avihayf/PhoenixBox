const globals = require("globals");
const promise = require("eslint-plugin-promise");
const noUnsanitized = require("eslint-plugin-no-unsanitized");
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    // `.claude/` holds agent scratch space, including git worktrees with their
    // own full checkout. Linting those reports errors against a copy of the
    // tree that this config's `files` globs don't apply to.
    ignores: ["**/coverage", "dist/**", "**/dist/**", ".claude/**", ".codex/**", "web-ext-artifacts/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {},
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.webextensions,
        Utils: true,
        CONTAINER_ORDER_STORAGE_KEY: true,
        proxifiedContainers: true,
        MozillaVPN: true,
        MozillaVPN_Background: true,
        PhoenixBoxReviewHelpers: true,
        PhoenixBoxPageActionHelpers: true,
        PhoenixBoxRequestHeaderHelpers: true,
      },
    },
    plugins: {
      promise,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      "promise/always-return": "off",
      "promise/avoid-new": "off",
      "promise/catch-or-return": "error",
      "promise/no-callback-in-promise": "warn",
      "promise/no-native": "off",
      "promise/no-nesting": "warn",
      "promise/no-promise-in-callback": "warn",
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "no-unsanitized/method": ["error"],
      "no-unsanitized/property": ["error"],

      eqeqeq: "error",
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      "no-throw-literal": "error",
      "no-warning-comments": "warn",
      "no-var": "error",
      "prefer-const": "error",
      quotes: ["error", "double"],
      radix: "error",
      semi: ["error", "always"],
    },
  },
  {
    files: ["test/**/*.js", "test/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      "no-restricted-globals": ["error", "browser"],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
  {
    files: ["src/js/**/*.js"],
    languageOptions: {
      globals: {
        LOG: true,
        assignManager: true,
        backgroundLogic: true,
        identityState: true,
        messageHandler: true,
        sync: true,
        userAgentFetcher: true,
      },
    },
  },
  // The popup (TypeScript/React). It had no lint coverage at all: ESLint's
  // flat config only picks up JavaScript unless told otherwise. Correctness
  // rules only — the JS style rules above would be pure churn here.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/popup-ui/**/*.{ts,tsx}"],
  })),
  {
    files: ["src/popup-ui/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    plugins: {
      "react-hooks": reactHooks,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      // The WebExtension API surface is loosely typed; `any` at that boundary
      // is deliberate and commented where it matters.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
    },
  },
];
