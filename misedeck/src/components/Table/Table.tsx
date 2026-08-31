// Table — semantic <table> with header, body, and optional footer.
//
// Used by the tools page (issue #21) for the installed tools list and
// elsewhere whenever a column of mono data needs to be scanned. Cells
// are mono; columns declare alignment per-call. A `numeric` column is
// right-aligned with tabular-nums so values stack visually.

import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import styles from "./Table.module.css";

export interface TableColumn<T> {
  /** Stable key used for React and for the cell-renderer lookup. */
  key: string;
  /** Tracked label rendered in <th>. */
  header: ReactNode;
  /** Render the cell for a given row. */
  cell: (row: T) => ReactNode;
  /** Right-align (numeric columns). */
  numeric?: boolean;
  /** Custom width, e.g. "120px" or "1fr". */
  width?: string;
}

interface TableProps<T> {
  columns: ReadonlyArray<TableColumn<T>>;
  rows: ReadonlyArray<T>;
  /** Stable key per row. */
  rowKey: (row: T, index: number) => string;
  /** Optional extra class on the inner <table>. */
  className?: string;
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
}: TableProps<T>) {
  const tableClasses = [styles.table, className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={styles.scroller}>
      <table {...tableProps} className={tableClasses}>
        {caption !== undefined && <caption className={styles.caption}>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const thProps: ThHTMLAttributes<HTMLTableCellElement> = {
                style: c.width ? { width: c.width } : undefined,
              };
              if (c.numeric) thProps.className = styles.numeric;
              return (
                <th key={c.key} {...thProps} scope="col">
                  {c.header}
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
