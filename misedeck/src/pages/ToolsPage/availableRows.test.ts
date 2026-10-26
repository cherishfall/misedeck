// Row rules for the version-management region's "not installed" section
// (issue #286): the newest version appears once. The pinned `latest` row
// teaches the alias and carries the concrete version's action; the
// concrete row for that same version must not render again with the
// identical `mise use <tool>@<version>` action.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { MiseLsRemoteItem } from "../../types/tauri";
import { buildAvailableRows } from "./availableRows";

const remote = (...versions: string[]): MiseLsRemoteItem[] =>
  versions.map((version) => ({ version, createdAt: `2026-01-01 ${version}` }));

test("the newest version renders once, as the pinned latest row", () => {
  const rows = buildAvailableRows(remote("27.0.0", "26.1.0", "25.0.0"), new Set());
  assert.deepEqual(rows, [
    { kind: "latest", version: "27.0.0" },
    { kind: "version", version: "26.1.0", createdAt: "2026-01-01 26.1.0" },
    { kind: "version", version: "25.0.0", createdAt: "2026-01-01 25.0.0" },
  ]);
});

test("no two rows carry the same version", () => {
  const rows = buildAvailableRows(remote("27.0.0", "26.1.0", "25.0.0"), new Set());
  const versions = rows.map((r) => r.version);
  assert.equal(new Set(versions).size, versions.length);
});

test("on-disk versions are excluded, newest included", () => {
  const rows = buildAvailableRows(
    remote("27.0.0", "26.1.0", "25.0.0"),
    new Set(["27.0.0", "25.0.0"]),
  );
  assert.deepEqual(rows, [
    { kind: "version", version: "26.1.0", createdAt: "2026-01-01 26.1.0" },
  ]);
});

test("when the newest version is installed, no latest row is pinned", () => {
  const rows = buildAvailableRows(
    remote("27.0.0", "26.1.0"),
    new Set(["27.0.0"]),
  );
  assert.deepEqual(rows, [
    { kind: "version", version: "26.1.0", createdAt: "2026-01-01 26.1.0" },
  ]);
});

test("an empty remote list yields no rows", () => {
  assert.deepEqual(buildAvailableRows([], new Set()), []);
});

test("rows are newest first", () => {
  const rows = buildAvailableRows(
    remote("9.0.1", "10.0.0", "9.0.10"),
    new Set(),
  );
  assert.deepEqual(
    rows.map((r) => r.version),
    ["10.0.0", "9.0.10", "9.0.1"],
  );
});
