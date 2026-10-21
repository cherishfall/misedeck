// Three-state mapping for the shell-activation probe (issue #262).

import assert from "node:assert/strict";
import { test } from "node:test";

import { activationPresence } from "./activationPresence";

test("true means activated", () => {
  assert.equal(activationPresence(true), "activated");
});

test("false means not activated", () => {
  assert.equal(activationPresence(false), "notActivated");
});

test("null is unknown, never 'not activated'", () => {
  assert.equal(activationPresence(null), "unknown");
});
