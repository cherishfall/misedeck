// Table — semantic <table> with header, body, and optional footer.
//
// Used by the tools page (issue #21) for the installed tools list and
// elsewhere whenever a column of mono data needs to be scanned. Cells
// are mono; columns declare alignment per-call. A `numeric` column is
// right-aligned with tabular-nums so values stack visually.

import { useState } from "react";
import type {
  HTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import styles from "./Table.module.css";

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
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const widths: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) widths[key] = value;
    }
    return widths;
  } catch {
    // Corrupt localStorage falls back to declared widths.
    return {};
  }
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
}: TableProps<T>) {
  const tableClasses = [styles.table, className ?? "", fixed ? styles.fixed : ""]
    .filter(Boolean)
    .join(" ");

  const storageKey = resizeKey !== undefined ? WIDTHS_STORAGE_PREFIX + resizeKey : null;
  const [overrides, setOverrides] = useState<Record<string, number>>(() =>
    storageKey !== null ? loadWidths(storageKey) : {},
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
      setOverrides((prev) => (prev[column.key] === next ? prev : { ...prev, [column.key]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = previousUserSelect;
      setOverrides((prev) => {
        if (storageKey !== null) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(prev));
          } catch {
            // Quota/serialization failure drops persistence, not the drag.
          }
        }
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={styles.scroller}>
      <table {...tableProps} className={tableClasses}>
        {caption !== undefined && <caption className={styles.caption}>{caption}</caption>}
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
              return (
                <th key={c.key} {...thProps} scope="col">
                  {c.header}
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
        <tbody>
          {rows.length === 0 && empty !== undefined ? (
            <tr>
              <td className={styles.empty} colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const rowClass = onRowClick ? styles.rowClickable : styles.row;
              return (
                <tr
                  key={rowKey(row, index)}
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
