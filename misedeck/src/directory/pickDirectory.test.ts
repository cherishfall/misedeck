// Tests for the shared directory-pick handler (issue #228). Run via
// `npm run test` (node:test through tsx — no extra framework).
//
// The dialog is injected, so these cover the split the ticket is about:
// a cancel is silent, a failed dialog reaches the caller as translated
// copy. Before the fix both were swallowed by one `catch`.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TFunction } from "i18next";

import { pickDirectory, type DirectoryPickOutcome } from "./pickDirectory";

/** Stand-in for react-i18next's `t`: keys are their own translation. */
const t = ((key: string) => key) as unknown as TFunction;

test("pickDirectory: a confirmed pick reaches onPick once", async () => {
  const picked: string[] = [];
  const errors: string[] = [];
  const outcome = await pickDirectory(t, (p) => picked.push(p), {
    openDialog: async () => "/Users/dev/proj",
    onError: (m) => errors.push(m),
  });
  assert.deepEqual(picked, ["/Users/dev/proj"]);
  assert.equal(outcome, "picked");
  assert.deepEqual(errors, []);
});

test("pickDirectory: cancel stays silent (the required behavior)", async () => {
  const picked: string[] = [];
  const errors: string[] = [];
  const outcome = await pickDirectory(t, (p) => picked.push(p), {
    openDialog: async () => null,
    onError: (m) => errors.push(m),
  });
  assert.equal(outcome, "cancelled");
  assert.deepEqual(picked, []);
  assert.deepEqual(errors, []);
});

test("pickDirectory: a failed dialog surfaces translated copy", async () => {
  const picked: string[] = [];
  const errors: string[] = [];
  const outcome = await pickDirectory(t, (p) => picked.push(p), {
    openDialog: async () => {
      throw new Error("plugin:dialog not registered");
    },
    onError: (m) => errors.push(m),
  });
  assert.equal(outcome, "failed");
  assert.deepEqual(picked, []);
  assert.deepEqual(errors, ["directory.pickerFailed"]);
});

test("pickDirectory: failure never throws when the caller has no error surface", async () => {
  const outcome: DirectoryPickOutcome = await pickDirectory(t, () => {}, {
    openDialog: async () => {
      throw new Error("blocked by the desktop portal");
    },
  });
  assert.equal(outcome, "failed");
});
