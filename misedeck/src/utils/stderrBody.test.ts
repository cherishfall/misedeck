// Conditional stderr copy (V-7, issue #262): a failure card must not
// promise a stderr block that is not rendered.

import assert from "node:assert/strict";
import { test } from "node:test";

import { hasStderr, stderrBodyKey } from "./stderrBody";

const WITH = "error.body";
const WITHOUT = "error.bodyNoStderr";

test("non-empty stderr selects the body that mentions it", () => {
  assert.equal(hasStderr("error: boom"), true);
  assert.equal(stderrBodyKey("error: boom", WITH, WITHOUT), WITH);
});

test("empty or missing stderr selects the body that does not", () => {
  assert.equal(stderrBodyKey("", WITH, WITHOUT), WITHOUT);
  assert.equal(stderrBodyKey(undefined, WITH, WITHOUT), WITHOUT);
  assert.equal(stderrBodyKey(null, WITH, WITHOUT), WITHOUT);
});

test("whitespace-only stderr is no stderr", () => {
  assert.equal(hasStderr("  \n\t "), false);
  assert.equal(stderrBodyKey("  \n", WITH, WITHOUT), WITHOUT);
});
