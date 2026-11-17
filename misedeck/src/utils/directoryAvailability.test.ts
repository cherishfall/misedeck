// Tests for the directory-availability decision (issue #214) and the
// canonical-cwd selection behind it (issue #305). The rejection of a
// stale probe matters: a fast A→B switch must not let A's answer mark
// B unavailable.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveCanonicalCwd,
  resolveDirectoryAvailability,
} from "./directoryAvailability";

test("resolveDirectoryAvailability: global mode needs no probe", () => {
  assert.deepEqual(resolveDirectoryAvailability({ kind: "global" }, null), {
    kind: "global",
  });
});

test("resolveDirectoryAvailability: a directory without a probe is still probing", () => {
  assert.deepEqual(
    resolveDirectoryAvailability({ kind: "dir", path: "/tmp/a" }, null),
    { kind: "probing", path: "/tmp/a" },
  );
});

test("resolveDirectoryAvailability: a probe for another path is stale", () => {
  assert.deepEqual(
    resolveDirectoryAvailability({ kind: "dir", path: "/tmp/b" }, {
      path: "/tmp/a",
      result: "missing",
    }),
    { kind: "probing", path: "/tmp/b" },
  );
});

test("resolveDirectoryAvailability: exists means available", () => {
  assert.deepEqual(
    resolveDirectoryAvailability({ kind: "dir", path: "/tmp/a" }, {
      path: "/tmp/a",
      result: "exists",
    }),
    { kind: "available", path: "/tmp/a" },
  );
});

test("resolveDirectoryAvailability: missing means unavailable", () => {
  assert.deepEqual(
    resolveDirectoryAvailability({ kind: "dir", path: "/tmp/a" }, {
      path: "/tmp/a",
      result: "missing",
    }),
    { kind: "unavailable", path: "/tmp/a" },
  );
});

test("resolveDirectoryAvailability: an unanswerable probe is unknown, never missing", () => {
  assert.deepEqual(
    resolveDirectoryAvailability({ kind: "dir", path: "/tmp/a" }, {
      path: "/tmp/a",
      result: "unknown",
    }),
    { kind: "unknown", path: "/tmp/a" },
  );
});

// Issue #305: the write-scope classifiers need the canonical form of
// the directory context, because mise reports source paths canonically
// (/private/tmp/x) while the context holds the user-visible path
// (/tmp/x).

test("resolveCanonicalCwd: global mode has no directory and stays null", () => {
  assert.equal(resolveCanonicalCwd({ kind: "global" }, null), null);
  assert.equal(resolveCanonicalCwd({ kind: "global" }, { path: "/tmp/a", canonical: "/private/tmp/a" }), null);
});

test("resolveCanonicalCwd: a resolved record yields the canonical path", () => {
  assert.equal(
    resolveCanonicalCwd(
      { kind: "dir", path: "/tmp/x" },
      { path: "/tmp/x", canonical: "/private/tmp/x" },
    ),
    "/private/tmp/x",
  );
});

test("resolveCanonicalCwd: a record for another path is stale and falls back to raw", () => {
  // A fast A→B switch must not let A's answer describe B.
  assert.equal(
    resolveCanonicalCwd(
      { kind: "dir", path: "/tmp/b" },
      { path: "/tmp/a", canonical: "/private/tmp/a" },
    ),
    "/tmp/b",
  );
});

test("resolveCanonicalCwd: a pending (null) resolution falls back to raw", () => {
  assert.equal(resolveCanonicalCwd({ kind: "dir", path: "/tmp/x" }, null), "/tmp/x");
  assert.equal(
    resolveCanonicalCwd({ kind: "dir", path: "/tmp/x" }, { path: "/tmp/x", canonical: null }),
    "/tmp/x",
  );
});
