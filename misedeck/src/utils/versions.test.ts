// Tests for the version comparators. `compareToolVersions` is the
// prefix-aware comparator the Tools page version-management section
// sorts with (issue #178); `compareVersions` is the legacy date-based comparator.
// Run via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import { compareToolVersions } from "./versions";

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
