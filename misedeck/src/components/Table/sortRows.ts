// The Table's sorting half (issue #105), split out of `Table.tsx` so it
// stays a pure module the unit suite can import (Table.tsx pulls in a CSS
// module) and so the sort memo can key on values.
//
// `SortSpec` is what the memo depends on (issue #290): the extractor plus
// its two flags, never the caller's `columns` array. Pages rebuild that
// array on every render, so a `columns`-keyed memo never hit and a
// 3 000-row list (java's remote versions) re-sorted on every frame.
// Callers therefore keep `sortValue` at module scope — pure `(row) => …`
// functions whose identity is stable.

import { compareVersions } from "../../utils/versions";

/** Column sort state (issue #105): which column, which direction. */
export interface SortState {
  key: string;
  direction: "asc" | "desc";
}

/** The value side of a sort: everything `sortRowsBy` needs, resolved. */
export interface SortSpec<T> {
  direction: "asc" | "desc";
  extract: (row: T) => string | number;
  /** Compare the extracted values as versions (2026.9.10 > 2026.9.2). */
  byVersion: boolean;
}

/** The part of a column that sorting reads. `TableColumn` is assignable. */
export interface SortableColumn<T> {
  key: string;
  sortValue?: (row: T) => string | number;
  sortVersion?: boolean;
}

/** Sort `rows` by an already-resolved spec; `null` keeps the order. */
export function sortRowsBy<T>(
  rows: ReadonlyArray<T>,
  spec: SortSpec<T> | null,
): T[] {
  if (spec === null) return [...rows];
  const { direction, extract, byVersion } = spec;
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = extract(a);
    const bv = extract(b);
    let cmp: number;
    if (byVersion) {
      cmp = compareVersions(String(av), String(bv));
    } else if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return cmp * sign;
  });
}

/**
 * Sort `rows` by the column named in `sort`. Returns a new array; a
 * missing/unsortable column leaves the order untouched. The comparator is
 * stable (Array.prototype.sort), so callers that paginate can sort the
 * full set first and slice afterwards — and the Table re-sorting its
 * already-sorted window is a no-op.
 */
export function sortRows<T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<SortableColumn<T>>,
  sort: SortState | null,
): T[] {
  if (sort === null) return [...rows];
  const column = columns.find((c) => c.key === sort.key);
  if (column?.sortValue === undefined) return [...rows];
  return sortRowsBy(rows, {
    direction: sort.direction,
    extract: column.sortValue,
    byVersion: column.sortVersion === true,
  });
}
