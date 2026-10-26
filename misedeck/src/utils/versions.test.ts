// Tests for the version comparators. `compareToolVersions` is the
// prefix-aware comparator the Tools page version-management section
// sorts with (issue #178); `compareVersions` is the legacy date-based comparator.
// Run via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import { compareToolVersions, hasUpgradeTarget, selectToolVersion } from "./versions";

const desc = (versions: string[]): string[] =>
  [...versions].sort((a, b) => compareToolVersions(b, a));

test("compareToolVersions: plain numeric versions compare segment-wise", () => {
  assert.ok(compareToolVersions("2026.9.10", "2026.9.2") > 0);
  assert.ok(compareToolVersions("2026.9.2", "2026.9.10") < 0);
  assert.ok(compareToolVersions("22.11.0", "22.2.0") > 0);
  assert.equal(compareToolVersions("17.0.7", "17.0.7"), 0);
});

test("compareToolVersions: vendor prefixes do not poison the compare", () => {
  // The beta12 bug: the old comparator returned 0 for every one of
  // java's prefixed versions, so "descending" was the CLI's own order.
  assert.ok(compareToolVersions("graalvm-community-17.0.8", "graalvm-community-17.0.7") > 0);
  assert.ok(compareToolVersions("temurin-jre-21.0.0+35.0.LTS", "graalvm-community-17.0.7") > 0);
  assert.ok(compareToolVersions("temurin-17.0.7", "temurin-17.0.7") === 0);
});

test("compareToolVersions: the numeric core dominates over the prefix", () => {
  // Newest-first across distributions: 21.x outranks 17.x no matter the
  // vendor, so the list groups by version number, not alphabet.
  assert.ok(compareToolVersions("graalvm-community-21.0.0", "temurin-17.0.9") > 0);
});

test("compareToolVersions: metadata suffixes sort below the bare release", () => {
  // Build metadata (+35) is newer than the bare version…
  assert.ok(compareToolVersions("21.0.0+35", "21.0.0") > 0);
  // …and a label suffix (.LTS) is older than the same build without it.
  assert.ok(compareToolVersions("temurin-jre-21.0.0+35.0.LTS", "temurin-jre-21.0.0+35.0") < 0);
});

test("compareToolVersions: descending sort puts the newest first", () => {
  assert.deepEqual(
    desc(["graalvm-community-17.0.7", "temurin-21.0.0", "17.0.7", "corretto-21.0.1"]),
    ["corretto-21.0.1", "temurin-21.0.0", "graalvm-community-17.0.7", "17.0.7"],
  );
});

test("compareToolVersions: garbage input never throws and stays deterministic", () => {
  const weird = ["", "latest", "—", "abc", "v", "1.0.0-rc.1", "..", "21"];
  for (const a of weird) {
    for (const b of weird) {
      const cmp = compareToolVersions(a, b);
      assert.equal(Number.isNaN(cmp), false);
      // Normalize -0 so the antisymmetry check is exact.
      assert.equal(compareToolVersions(b, a), cmp === 0 ? 0 : -cmp);
    }
  }
  // A string with no digits falls back to a lexical comparison.
  assert.ok(compareToolVersions("beta", "alpha") > 0);
});

// `hasUpgradeTarget` is the one predicate behind every upgrade surface
// (issue #224): the Tools table's chip, the "N tools outdated" count,
// and the version-management section's active hint. External behaviour
// only — an outdated row's state in, an upgrade-offered decision out.
test("hasUpgradeTarget: a latest newer than current is an update", () => {
  assert.equal(hasUpgradeTarget({ name: "node", current: "20.11.0", latest: "20.18.1" }), true);
});

test("hasUpgradeTarget: latest equal to current is not an update", () => {
  // The audited rust row: requested `latest`, mise reports both
  // `current` and `latest` as "stable" — the badge would promise an
  // update to the version already active.
  assert.equal(
    hasUpgradeTarget({ name: "rust", requested: "latest", current: "stable", latest: "stable" }),
    false,
  );
});

test("hasUpgradeTarget: a missing or empty latest is not an update", () => {
  assert.equal(hasUpgradeTarget({ name: "node", current: "20.11.0" }), false);
  assert.equal(hasUpgradeTarget({ name: "node", current: "20.11.0", latest: "" }), false);
});

test("hasUpgradeTarget: a latest with no current is not an upgrade", () => {
  // Requested-but-missing (`installed:false`, `current:null`): there is
  // nothing installed to upgrade, and the row carries the not-installed
  // badge instead (issue #269).
  assert.equal(hasUpgradeTarget({ name: "node", latest: "20.18.1" }), false);
  const rawNull = { name: "node", current: null, latest: "20.18.1" } as never;
  assert.equal(hasUpgradeTarget(rawNull), false);
});

test("hasUpgradeTarget: a missing-request list never contributes an outdated count", () => {
  const rows = [
    { name: "node", current: null, latest: "22.0.0" } as never,
    { name: "python", current: "3.13.2", latest: "3.13.3" },
  ];
  assert.equal(rows.filter(hasUpgradeTarget).length, 1);
});

// Row selection (issue #269): active → newest installed → missing request.
// The real `mise ls` probe returns the missing request alongside an
// installed version; picking `items[0]` showed the uninstalled version
// as if it were active.
test("selectToolVersion: the active version wins", () => {
  const picked = selectToolVersion([
    { version: "22.0.0", installed: false, active: false },
    { version: "20.19.0", installed: true, active: true },
    { version: "21.7.0", installed: true, active: false },
  ]);
  assert.equal(picked?.item.version, "20.19.0");
  assert.equal(picked?.missing, false);
});

test("selectToolVersion: without an active row the newest installed wins", () => {
  const picked = selectToolVersion([
    { version: "22.0.0", installed: false, active: false },
    { version: "20.9.0", installed: true, active: false },
    { version: "20.19.0", installed: true, active: false },
  ]);
  assert.equal(picked?.item.version, "20.19.0");
  assert.equal(picked?.missing, false);
});

test("selectToolVersion: nothing installed surfaces the missing request", () => {
  const picked = selectToolVersion([
    { version: "22.0.0", requestedVersion: "22.0.0", installed: false, active: false },
  ]);
  assert.equal(picked?.item.version, "22.0.0");
  assert.equal(picked?.missing, true);
});

test("selectToolVersion: an empty list selects nothing", () => {
  assert.equal(selectToolVersion([]), null);
});
