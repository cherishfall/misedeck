// useTableFilter — the shared text filter for data tables (issue #106).
//
// One interaction everywhere: a case-insensitive substring match over
// the row's searchable text. The hook owns only the query string and
// the filtered row set; the input itself is the shared `TableFilter`
// component.
//
// Composition: filtering applies to the FULL row set, before sorting
// (Table's `sortRows`, issue #105) and before any client-side
// pagination — the same ordering VersionQuerySection uses for sorting.
// A paginated consumer resets its page when `query` changes (the
// current fixed tables render all rows, so there is no page to reset).

import { useMemo, useState } from "react";

export interface TableFilterState<T> {
  /** The live query string (controlled input value). */
  query: string;
  setQuery: (query: string) => void;
  /** Reset the query to empty. */
  clear: () => void;
  /** True when a non-empty (trimmed) query is actively filtering. */
  active: boolean;
  /** The rows passing the filter; the original array when inactive. */
  rows: ReadonlyArray<T>;
}

export function useTableFilter<T>(
  rows: ReadonlyArray<T>,
  /** Extract the row's searchable text (data only, original case — the
   *  hook lowercases both sides). */
  searchText: (row: T) => string,
): TableFilterState<T> {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q === ""
        ? rows
        : rows.filter((row) => searchText(row).toLowerCase().includes(q)),
    [rows, q, searchText],
  );
  return {
    query,
    setQuery,
    clear: () => setQuery(""),
    active: q !== "",
    rows: filtered,
  };
}
