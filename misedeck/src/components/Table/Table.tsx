// Table — semantic <table> with header, body, and optional footer.
//
// Used by the tools page (issue #21) for the installed tools list and
// elsewhere whenever a column of mono data needs to be scanned. Cells
// are mono; columns declare alignment per-call. A `numeric` column is
// right-aligned with tabular-nums so values stack visually. Columns that
// declare `sortValue` become click-to-sort headers (↑/↓ data glyphs,
// issue #105); version columns set `sortVersion` for segment-wise
// numeric comparison.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  HTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import styles from "./Table.module.css";
import { loadPersistent, savePersistent } from "../../hooks/usePersistentState";
import { sortRowsBy, type SortSpec, type SortState } from "./sortRows";

// Re-exported so `src/components/index.ts` and existing callers keep one
// import site for the table API.
export { sortRows, sortRowsBy, type SortSpec, type SortState } from "./sortRows";

/** localStorage namespace for persisted column widths (issue #104). */
const WIDTHS_STORAGE_PREFIX = "misedeck.tableWidths.";
/** Floor for columns that declare no `minWidth` of their own. */
const DEFAULT_MIN_COLUMN_WIDTH = 64;

function parsePx(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function loadWidths(storageKey: string): Record<string, number> {
  const parsed = loadPersistent<unknown>(storageKey, {});
  if (typeof parsed !== "object" || parsed === null) return {};
  const widths: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "number" && Number.isFinite(value)) widths[key] = value;
  }
  return widths;
}

export interface TableColumn<T> {
  /** Stable key used for React and for the cell-renderer lookup. */
  key: string;
  /** Column label rendered in <th>. */
  header: ReactNode;
  /** Render the cell for a given row. */
  cell: (row: T) => ReactNode;
  /** Right-align (numeric columns). */
  numeric?: boolean;
  /** Custom width, e.g. "120px" or "1fr". */
  width?: string;
  /** Minimum width for column resizing, e.g. "120px" (issue #103;
   * enforced by the drag-resize handle when `resizeKey` is set, #104). */
  minWidth?: string;
  /** Opt-in sorting (issue #105): extract the value this column sorts by.
   * Present ⇒ the header becomes a click-to-sort button. */
  sortValue?: (row: T) => string | number;
  /** Compare values segment-wise numerically as versions (2026.9.10 >
   * 2026.9.2) instead of lexically (issue #105). Requires `sortValue`. */
  sortVersion?: boolean;
}

interface TableProps<T> {
  columns: ReadonlyArray<TableColumn<T>>;
  rows: ReadonlyArray<T>;
  /** Stable key per row. */
  rowKey: (row: T, index: number) => string;
  /** Optional extra class on the inner <table>. */
  className?: string;
  /** Enables column drag-resize (issue #104): each fixed-width column gets
   * a drag handle on its header border (visible on hover, `col-resize`),
   * clamped to the column's `minWidth` (or a default floor). Adjusted
   * widths persist to localStorage under
   * `misedeck.tableWidths.<resizeKey>`, keyed per page+table by the
   * caller (e.g. "tools", "directory-preview.env"); per column by the
   * column key, so conditional columns keep their width independently. */
  resizeKey?: string;
  /** Opt-in fixed layout: declared column widths hold and long cells
   * ellipsize instead of ballooning the row (issue #81). Default behavior
   * (auto layout + shared `.scroller` horizontal scroll) is unchanged.
   * Consumers pass a className declaring `min-width` ≈ the sum of declared
   * column widths, so narrow windows scroll instead of crushing columns
   * (issue #90). */
  fixed?: boolean;
  /** Controlled sort state (issue #105). Pass together with
   * `onSortChange` when the caller must sort before further processing —
   * e.g. a paginated consumer sorts the full result set, then paginates. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** Caption / table summary, rendered above the rows. */
  caption?: ReactNode;
  /** Optional footer row, e.g. an aggregate. */
  footer?: ReactNode;
  /** Props spread onto the inner <table>. */
  tableProps?: HTMLAttributes<HTMLTableElement>;
  /** Optional hover/active state — used by selection lists. */
  onRowClick?: (row: T) => void;
  /** Optional element rendered when rows is empty. */
  empty?: ReactNode;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  className,
  caption,
  footer,
  tableProps,
  onRowClick,
  empty,
  fixed,
  resizeKey,
  sort,
  onSortChange,
}: TableProps<T>) {
  const tableClasses = [styles.table, className ?? "", fixed ? styles.fixed : ""]
    .filter(Boolean)
    .join(" ");

  const storageKey = resizeKey !== undefined ? WIDTHS_STORAGE_PREFIX + resizeKey : null;
  const [overrides, setOverrides] = useState<Record<string, number>>(() =>
    storageKey !== null ? loadWidths(storageKey) : {},
  );
  // The drag reads and writes widths through this ref, not through a
  // state updater (issue #290): persisting from inside `setOverrides`
  // ran a side effect in an updater, which StrictMode invokes twice.
  const overridesRef = useRef<Record<string, number>>(overrides);
  /** Merge one column's width into the latest map and reflect it. */
  const applyWidth = (key: string, next: number) => {
    const current = overridesRef.current;
    if (current[key] === next) return;
    const merged = { ...current, [key]: next };
    overridesRef.current = merged;
    setOverrides(merged);
  };

  // Sort state (issue #105): controlled when the caller passes
  // `onSortChange` (it needs the same order before paginating), otherwise
  // internal. Clicking a sortable header sorts ascending; clicking the
  // active one toggles direction.
  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const activeSort = onSortChange !== undefined ? (sort ?? null) : internalSort;
  const onHeaderSort = (column: TableColumn<T>) => {
    const next: SortState =
      activeSort?.key === column.key
        ? { key: column.key, direction: activeSort.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: "asc" };
    if (onSortChange !== undefined) onSortChange(next);
    else setInternalSort(next);
  };
  // The memo keys on values, never on the page's `columns` array (issue
  // #290): the array is rebuilt every render, so depending on it made the
  // sort recompute on every frame. `extract` is the column's module-level
  // `sortValue`, so the spec is reference-stable until the sort changes.
  const sortColumn =
    activeSort === null ? undefined : columns.find((c) => c.key === activeSort.key);
  const sortExtract = sortColumn?.sortValue;
  const sortByVersion = sortColumn?.sortVersion === true;
  const sortDirection = activeSort?.direction;
  const sortSpec = useMemo<SortSpec<T> | null>(
    () =>
      sortExtract === undefined || sortDirection === undefined
        ? null
        : { direction: sortDirection, extract: sortExtract, byVersion: sortByVersion },
    [sortExtract, sortDirection, sortByVersion],
  );
  const sortedRows = useMemo(() => sortRowsBy(rows, sortSpec), [rows, sortSpec]);

  // Unmount cleanup for the column drag (issue #290): the window
  // listeners otherwise only come off on pointerup / pointercancel.
  const endGestureRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      endGestureRef.current?.();
    },
    [],
  );

  const beginResize = (e: ReactPointerEvent<HTMLSpanElement>, column: TableColumn<T>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest("th");
    if (th === null) return;
    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width;
    const min = parsePx(column.minWidth) ?? DEFAULT_MIN_COLUMN_WIDTH;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(min, Math.round(startWidth + ev.clientX - startX));
      applyWidth(column.key, next);
    };
    // `pointerup` and `pointercancel` both end the gesture (#209): a
    // cancelled drag never fires `pointerup`, which used to leave the
    // window listeners and the `userSelect: none` body lock behind.
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.body.style.userSelect = previousUserSelect;
      endGestureRef.current = null;
      // Persist once, from the latest map — never inside a state updater.
      if (storageKey !== null) savePersistent(storageKey, overridesRef.current);
    };
    endGestureRef.current = onEnd;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  // An empty table renders no header band (issue #226): column headers
  // over zero rows — above an empty-state card — repeat "there is
  // nothing here" and float a labelled grid that labels nothing. The
  // empty state carries the whole message.
  const hasRows = sortedRows.length > 0;

  return (
    <div className={styles.scroller}>
      <table {...tableProps} className={tableClasses}>
        {caption !== undefined && <caption className={styles.caption}>{caption}</caption>}
        {hasRows && (
          <thead>
            <tr>
              {columns.map((c) => {
                const overridden = overrides[c.key];
                const width = overridden !== undefined ? `${overridden}px` : c.width;
                const thProps: ThHTMLAttributes<HTMLTableCellElement> = {
                  style:
                    width || c.minWidth
                      ? { width, minWidth: c.minWidth }
                      : undefined,
                };
                if (c.numeric) thProps.className = styles.numeric;
                const resizable = resizeKey !== undefined && c.width !== undefined;
                const sortable = c.sortValue !== undefined;
                const isSorted = sortable && activeSort?.key === c.key;
                if (isSorted) {
                  thProps["aria-sort"] =
                    activeSort.direction === "asc" ? "ascending" : "descending";
                }
                return (
                  <th
                    key={c.key}
                    {...thProps}
                    scope="col"
                    className={
                      [thProps.className ?? "", isSorted ? styles.sorted : ""]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => onHeaderSort(c)}
                        data-testid={`sort-${c.key}`}
                      >
                        {c.header}
                        {isSorted && (
                          // ↑/↓ are data glyphs (issue #105), exempt from the
                          // caret ban — same treatment as the upgrade-path →.
                          <span className={styles.sortIndicator} aria-hidden="true">
                            {activeSort.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                    {resizable && (
                      <span
                        className={styles.resizeHandle}
                        aria-hidden="true"
                        onPointerDown={(e) => beginResize(e, c)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {sortedRows.length === 0 && empty !== undefined ? (
            <tr>
              <td className={styles.empty} colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, index) => {
              const rowClass = onRowClick ? styles.rowClickable : styles.row;
              const key = rowKey(row, index);
              return (
                <tr
                  key={key}
                  className={rowClass}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => {
                    const tdProps: TdHTMLAttributes<HTMLTableCellElement> = {};
                    if (c.numeric) tdProps.className = styles.numeric;
                    return <td key={c.key} {...tdProps}>{c.cell(row)}</td>;
                  })}
                </tr>
              );
            })
          )}
        </tbody>
        {footer !== undefined && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
