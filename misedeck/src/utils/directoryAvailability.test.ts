// Tests for the directory-availability decision (issue #214).
// The rejection of a stale probe matters: a fast A→B switch must not
// let A's answer mark B unavailable.

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDirectoryAvailability } from "./directoryAvailability";

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
