// Tests for the update-check presentation mapping (issue #236).
// Pure mapping — no DOM, no Tauri, no network.

import assert from "node:assert/strict";
import { test } from "node:test";

import { I18N_KEYS } from "../../i18n/keys";
import { summarizeCheck } from "./appVersionCopy";

test("summarizeCheck: idle says nothing and offers the check", () => {
  assert.deepEqual(summarizeCheck({ kind: "idle" }), {
    statusKey: null,
    statusTone: "ice",
    action: "check",
    busy: false,
  });
});

test("summarizeCheck: checking reports progress and disables the action", () => {
  const summary = summarizeCheck({ kind: "checking" });
  assert.equal(summary.statusKey, I18N_KEYS.about.checking);
  assert.equal(summary.busy, true);
  assert.equal(summary.action, "check");
});

test("summarizeCheck: up to date is a success tone, not a neutral one", () => {
  const summary = summarizeCheck({ kind: "current", version: "1.0.0-beta.16" });
  assert.equal(summary.statusKey, I18N_KEYS.about.upToDate);
  assert.equal(summary.statusTone, "grove");
  assert.equal(summary.action, "check", "the check stays available");
});

test("summarizeCheck: a newer build points at the download, not another check", () => {
  const summary = summarizeCheck({
    kind: "available",
    version: "1.0.0-beta.17",
    url: "https://github.com/cherishfall/misedeck/releases/tag/v1.0.0-beta.17",
  });
  assert.equal(summary.statusKey, I18N_KEYS.about.available);
  assert.equal(summary.statusTone, "flare");
  assert.equal(summary.action, "download");
  assert.equal(summary.busy, false);
});

test("summarizeCheck: a failure is honest and retryable", () => {
  const summary = summarizeCheck({ kind: "error" });
  assert.equal(summary.statusKey, I18N_KEYS.about.checkFailed);
  assert.equal(summary.statusTone, "breach");
  assert.equal(summary.action, "retry");
  assert.equal(summary.busy, false);
});

test("summarizeCheck: no state reuses a mise or Tool update key", () => {
  const forbidden = new Set<string>([
    I18N_KEYS.common.outdatedChecking,
    I18N_KEYS.miseManagement.selfUpdateButton,
    I18N_KEYS.doctor.updateNotice.title,
    I18N_KEYS.tools.addTool.upgradeAvailable,
  ]);
  const states = [
    { kind: "idle" as const },
    { kind: "checking" as const },
    { kind: "current" as const, version: "1.0.0-beta.16" },
    { kind: "available" as const, version: "1.0.0-beta.17", url: "u" },
    { kind: "error" as const },
  ];
  for (const state of states) {
    const { statusKey } = summarizeCheck(state);
    assert.ok(
      statusKey === null || !forbidden.has(statusKey),
      `state ${state.kind} must not borrow mise's update wording (${statusKey})`,
    );
  }
});
