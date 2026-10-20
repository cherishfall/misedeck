// Tests for the outdated-hint copy dispatch (issue #217).
// Pure mapping only — the component adds the retry button and the
// translation call; no DOM involved.

import assert from "node:assert/strict";
import { test } from "node:test";

import { I18N_KEYS } from "../../i18n/keys";
import { outdatedHintKey } from "./outdatedHintText";

test("outdatedHintKey: pending reads as the outdated check, not generic loading", () => {
  assert.equal(outdatedHintKey("loading", 0), I18N_KEYS.common.outdatedChecking);
  assert.notEqual(outdatedHintKey("loading", 0), I18N_KEYS.common.loading);
});

test("outdatedHintKey: failure keeps its own copy", () => {
  assert.equal(outdatedHintKey("error", 0), I18N_KEYS.common.outdatedError);
});

test("outdatedHintKey: success splits on the count", () => {
  assert.equal(outdatedHintKey("ok", 0), I18N_KEYS.common.allUpToDate);
  assert.equal(outdatedHintKey("ok", 3), I18N_KEYS.common.outdatedCount);
});
