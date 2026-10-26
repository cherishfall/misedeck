// Pure sort behavior for the shared Table (issue #105), including the
// value-resolved spec the sort memo keys on (issue #290): the memo may
// only depend on `(direction, extract, byVersion)`, so `sortRowsBy` has to
// be correct on its own — a wrong comparison here is a wrong table.

import assert from "node:assert/strict";
import { test } from "node:test";

import { sortRows, sortRowsBy, type SortableColumn } from "./sortRows";

interface Row {
  name: string;
  version: string;
  count: number;
}

const rows: Row[] = [
  { name: "go", version: "1.27.0", count: 3 },
  { name: "java", version: "2026.9.2", count: 1 },
  { name: "node", version: "2026.9.10", count: 2 },
];

const byName = (r: Row) => r.name;
const byVersion = (r: Row) => r.version;
const byCount = (r: Row) => r.count;

test("sortRowsBy sorts ascending and descending without mutating the input", () => {
  const order = rows.map((r) => r.name);
  assert.deepEqual(
    sortRowsBy(rows, { direction: "asc", extract: byName, byVersion: false }).map((r) => r.name),
    ["go", "java", "node"],
  );
  assert.deepEqual(
    sortRowsBy(rows, { direction: "desc", extract: byName, byVersion: false }).map((r) => r.name),
    ["node", "java", "go"],
  );
  assert.deepEqual(rows.map((r) => r.name), order, "the source array is untouched");
});

test("sortRowsBy compares versions segment-wise when asked", () => {
  // Lexically "2026.9.10" < "2026.9.2"; as versions the opposite holds.
  assert.deepEqual(
    sortRowsBy(rows, { direction: "asc", extract: byVersion, byVersion: true }).map(
      (r) => r.version,
    ),
    ["1.27.0", "2026.9.2", "2026.9.10"],
  );
  assert.deepEqual(
    sortRowsBy(rows, { direction: "asc", extract: byVersion, byVersion: false }).map(
      (r) => r.version,
    ),
    ["1.27.0", "2026.9.10", "2026.9.2"],
  );
});

test("sortRowsBy compares numbers numerically and a null spec keeps the order", () => {
  assert.deepEqual(
    sortRowsBy(rows, { direction: "asc", extract: byCount, byVersion: false }).map((r) => r.count),
    [1, 2, 3],
  );
  assert.deepEqual(sortRowsBy(rows, null), rows);
});

test("sortRows resolves the named column and leaves unsortable columns alone", () => {
  const columns: SortableColumn<Row>[] = [
    { key: "name", sortValue: byName },
    { key: "version", sortValue: byVersion, sortVersion: true },
    { key: "count" },
  ];
  assert.deepEqual(
    sortRows(rows, columns, { key: "version", direction: "desc" }).map((r) => r.version),
    ["2026.9.10", "2026.9.2", "1.27.0"],
  );
  assert.deepEqual(sortRows(rows, columns, { key: "count", direction: "asc" }), rows);
  assert.deepEqual(sortRows(rows, columns, { key: "missing", direction: "asc" }), rows);
  assert.deepEqual(sortRows(rows, columns, null), rows);
});
