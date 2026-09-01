// DataRow — a definition-list row (dt + dd) with mono values, used on
// the Home page and everywhere else a label → value pair shows up
// (settings pages, env panels, plugin details). Promoted into its own
// component so the visual treatment stays consistent.

import type { ReactNode } from "react";

import styles from "./DataRow.module.css";

export type DataRowTone = "default" | "beam" | "muted";

interface DataRowProps {
  /** Tracked label, e.g. "VERSION". Pass an i18n key. */
  label: ReactNode;
  /** Mono value, e.g. "22.11.0" or "/usr/local/bin/mise". */
  value: ReactNode;
  /** Color emphasis for the value. */
  tone?: DataRowTone;
  /** When the value is multi-line / monospace block (e.g. raw JSON). */
  block?: boolean;
  /** Full-width value column (spans the row). */
  full?: boolean;
  className?: string;
}

export function DataRow({
  label,
  value,
  tone = "default",
  block = false,
  full = false,
  className,
}: DataRowProps) {
  const classes = [
    styles.row,
    full ? styles.full : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      <dt className={styles.label}>{label}</dt>
      <dd
        className={[
          styles.value,
          styles[`tone-${tone}`],
          block ? styles.block : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
