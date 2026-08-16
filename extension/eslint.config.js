// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * INV-7 — client-side only, zero network egress in src/background/** and
 * src/content/**. This rule set bans the network-capable globals so a fetch/
 * XHR/WebSocket/sendBeacon call in those directories is a LINT ERROR, not
 * just a code-review nit. Mirrored by the static-scan test in
 * test/networkBan.test.ts, which greps the same directories independent of
 * ESLint (defense-in-depth — a disabled/misconfigured lint rule still fails
 * the test).
 */
const networkBanRules = {
  "no-restricted-globals": [
    "error",
    { name: "fetch", message: "INV-7: no network egress in background/content scripts." },
    { name: "XMLHttpRequest", message: "INV-7: no network egress in background/content scripts." },
    { name: "WebSocket", message: "INV-7: no network egress in background/content scripts." },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "MemberExpression[object.name='navigator'][property.name='sendBeacon']",
      message: "INV-7: navigator.sendBeacon is network egress and is banned in background/content scripts.",
    },
    {
      selector: "CallExpression[callee.name='fetch']",
      message: "INV-7: fetch() is banned in background/content scripts.",
    },
    {
      selector: "NewExpression[callee.name='XMLHttpRequest']",
      message: "INV-7: XMLHttpRequest is banned in background/content scripts.",
    },
    {
      selector: "NewExpression[callee.name='WebSocket']",
      message: "INV-7: WebSocket is banned in background/content scripts.",
    },
    {
      selector: "MemberExpression[property.name='sendBeacon']",
      message: "INV-7: sendBeacon is network egress and is banned in background/content scripts.",
    },
  ],
};

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js", "*.config.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // INV-7 network ban — background + content scripts only.
    files: ["src/background/**/*.ts", "src/content/**/*.ts", "src/content/**/*.tsx"],
    rules: networkBanRules,
  },
);
