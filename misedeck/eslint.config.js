// Minimal ESLint config (#258).
//
// The repo already has bespoke guards for i18n, tokens, spacing, command
// hints, focus and layout; what it had no guard for is the class of React
// bug a compiler cannot see. Two rules only — style stays out of ESLint:
//
//   * react-hooks/rules-of-hooks   — hook calls in conditions/loops are
//     real runtime bugs (the hook order breaks on the second render).
//   * react-hooks/exhaustive-deps  — a missing dependency silently reads a
//     stale value; intentional omissions carry a scoped disable comment
//     with the reason at the call site.
//
// Invoked by `npm run lint:eslint` (wired into `npm run ci`) with
// `--max-warnings=0`, so an exhaustive-deps warning fails the gate.

import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
