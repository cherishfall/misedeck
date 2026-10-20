// Tests for the ConfirmDialog focus decision + focus-trap wrap (issue #227).
// Run via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import { initialDialogFocusTarget, nextFocusIndex } from "./focusTarget";

test("initialDialogFocusTarget: danger never arms its own destructive button", () => {
  assert.equal(initialDialogFocusTarget({ danger: true, confirmBusy: false }), "cancel");
});

test("initialDialogFocusTarget: busy confirm is disabled, so it cannot take focus", () => {
  assert.equal(initialDialogFocusTarget({ danger: true, confirmBusy: true }), "cancel");
  assert.equal(initialDialogFocusTarget({ danger: false, confirmBusy: true }), "cancel");
});

test("initialDialogFocusTarget: a non-destructive confirmation keeps Confirm", () => {
  assert.equal(initialDialogFocusTarget({ danger: false, confirmBusy: false }), "confirm");
});

test("nextFocusIndex: Tab cycles inside the dialog and wraps at the end", () => {
  assert.equal(nextFocusIndex(2, 0, false), 1);
  assert.equal(nextFocusIndex(2, 1, false), 0);
});

test("nextFocusIndex: Shift-Tab cycles backwards and wraps at the start", () => {
  assert.equal(nextFocusIndex(2, 1, true), 0);
  assert.equal(nextFocusIndex(2, 0, true), 1);
});

test("nextFocusIndex: focus outside the dialog enters from the near end", () => {
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, -1, true), 2);
});

test("nextFocusIndex: a single focusable element keeps focus on itself", () => {
  assert.equal(nextFocusIndex(1, 0, false), 0);
  assert.equal(nextFocusIndex(1, 0, true), 0);
});

test("nextFocusIndex: nothing focusable keeps focus put instead of escaping", () => {
  assert.equal(nextFocusIndex(0, -1, false), -1);
  assert.equal(nextFocusIndex(0, 0, true), -1);
});
