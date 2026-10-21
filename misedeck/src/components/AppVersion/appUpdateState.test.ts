// Tests for the silent launch check's state machine (#238).
// Pure decisions only — no DOM, no Tauri, no network.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHECK_INTERVAL_MS,
  EMPTY_UPDATE_STATE,
  applyCheckResult,
  isCheckDue,
  isStoredUpdateNewer,
  parseUpdateState,
  type AvailableUpdate,
} from "./appUpdateState";

const MARKER: AvailableUpdate = {
  version: "1.0.0-beta.18",
  url: "https://github.com/cherishfall/misedeck/releases/tag/v1.0.0-beta.18",
};

test("parseUpdateState: a missing value means never checked", () => {
  assert.deepEqual(parseUpdateState(null), EMPTY_UPDATE_STATE);
});

test("parseUpdateState: corrupt JSON and wrong shapes degrade to empty", () => {
  for (const raw of ["", "{", "[]", "null", '"text"', "42", "true"]) {
    assert.deepEqual(parseUpdateState(raw), EMPTY_UPDATE_STATE, `raw: ${raw}`);
  }
});

test("parseUpdateState: a valid payload survives the round trip", () => {
  const raw = JSON.stringify({ lastAttemptAt: 1_700_000_000_000, available: MARKER });
  assert.deepEqual(parseUpdateState(raw), {
    lastAttemptAt: 1_700_000_000_000,
    available: MARKER,
  });
});

test("parseUpdateState: a broken marker is dropped, the timestamp is kept", () => {
  const raw = JSON.stringify({
    lastAttemptAt: 1_700_000_000_000,
    available: { version: "", url: MARKER.url },
  });
  assert.deepEqual(parseUpdateState(raw), {
    lastAttemptAt: 1_700_000_000_000,
    available: null,
  });
});

test("parseUpdateState: a marker link must be an http(s) URL", () => {
  for (const url of ["javascript:alert(1)", "/releases/tag/x", "not a url", ""]) {
    const raw = JSON.stringify({
      lastAttemptAt: null,
      available: { version: "1.0.0-beta.18", url },
    });
    assert.equal(parseUpdateState(raw).available, null, `url: ${url}`);
  }
});

test("parseUpdateState: a non-finite or negative timestamp is no timestamp", () => {
  for (const lastAttemptAt of ["soon", -1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const raw = JSON.stringify({ lastAttemptAt, available: null });
    assert.equal(parseUpdateState(raw).lastAttemptAt, null);
  }
});

test("isCheckDue: a launch without a recorded attempt checks", () => {
  assert.equal(isCheckDue(null, 1_700_000_000_000), true);
});

test("isCheckDue: inside the window stays quiet, at the boundary it is due", () => {
  const now = 1_700_000_000_000;
  assert.equal(isCheckDue(now - CHECK_INTERVAL_MS + 1, now), false);
  assert.equal(isCheckDue(now - CHECK_INTERVAL_MS, now), true);
  assert.equal(isCheckDue(now - CHECK_INTERVAL_MS - 1, now), true);
});

test("isCheckDue: clock skew counts as due", () => {
  const now = 1_700_000_000_000;
  assert.equal(isCheckDue(now + CHECK_INTERVAL_MS, now), true);
  assert.equal(isCheckDue(now + 1, now), true);
});

test("isStoredUpdateNewer: a newer beta is still newer", () => {
  assert.equal(isStoredUpdateNewer(MARKER, "1.0.0-beta.17"), true);
});

test("isStoredUpdateNewer: the same or an older build clears the marker", () => {
  assert.equal(isStoredUpdateNewer(MARKER, "1.0.0-beta.18"), false);
  assert.equal(isStoredUpdateNewer(MARKER, "1.0.0-beta.19"), false);
  assert.equal(isStoredUpdateNewer(MARKER, "1.0.0"), false);
});

test("isStoredUpdateNewer: a final release outranks the beta it came from", () => {
  const final: AvailableUpdate = {
    version: "1.0.0",
    url: MARKER.url,
  };
  assert.equal(isStoredUpdateNewer(final, "1.0.0-beta.18"), true);
});

test("isStoredUpdateNewer: unparsable input or no running version never claims an update", () => {
  assert.equal(isStoredUpdateNewer(null, "1.0.0-beta.17"), false);
  assert.equal(isStoredUpdateNewer(MARKER, null), false);
  assert.equal(isStoredUpdateNewer({ ...MARKER, version: "nightly" }, "1.0.0-beta.17"), false);
  assert.equal(isStoredUpdateNewer(MARKER, "dev"), false);
});

test("applyCheckResult: a failure records the attempt and keeps the known build", () => {
  const state = { lastAttemptAt: 1, available: MARKER };
  assert.deepEqual(applyCheckResult(state, { status: "err" }, "1.0.0-beta.17", 2), {
    lastAttemptAt: 2,
    available: MARKER,
  });
});

test("applyCheckResult: current records the attempt and clears the marker", () => {
  const state = { lastAttemptAt: 1, available: MARKER };
  assert.deepEqual(
    applyCheckResult(state, { status: "current", version: "1.0.0-beta.17" }, "1.0.0-beta.17", 2),
    { lastAttemptAt: 2, available: null },
  );
});

test("applyCheckResult: a genuinely newer build becomes the marker", () => {
  assert.deepEqual(
    applyCheckResult(
      EMPTY_UPDATE_STATE,
      { status: "available", version: MARKER.version, url: MARKER.url },
      "1.0.0-beta.17",
      2,
    ),
    { lastAttemptAt: 2, available: MARKER },
  );
});

test("applyCheckResult: a feed that lags behind the running build plants no dot", () => {
  assert.deepEqual(
    applyCheckResult(
      { lastAttemptAt: 1, available: MARKER },
      { status: "available", version: MARKER.version, url: MARKER.url },
      "1.0.0-beta.19",
      2,
    ),
    { lastAttemptAt: 2, available: null },
  );
});
