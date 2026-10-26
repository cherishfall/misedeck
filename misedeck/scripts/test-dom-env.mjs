// jsdom environment for the render-level suite (issue #291).
//
// Why this file exists instead of a test-runner migration: the repo's 269
// pure-function tests run on `node:test` through tsx, and a framework swap
// (vitest/jest) would re-pay for that whole suite to gain a DOM. `--import`
// keeps the same runner and adds exactly what rendering needs:
//
//   1. loader hooks that map `.css` imports to an empty class map
//      (`test-dom-hooks.mjs`) — tsx cannot load CSS;
//   2. jsdom installed as the global window/document (`global-jsdom`).
//
// Isolation: this file is only passed to the `.test.tsx` invocation
// (`npm run test:ui`). The pure `node:test` files run in their own process
// without it, so no DOM global ever leaks into them.

import { register } from "node:module";

import "global-jsdom/register";

register(new URL("./test-dom-hooks.mjs", import.meta.url));

// React 19 asks the host to declare whether updates are wrapped in `act`.
// @testing-library/react does that per call, but the flag must exist for
// the renderer to treat the environment as a test one from the first
// commit — without it React logs a "not wrapped in act" warning for the
// initial effect flush.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
