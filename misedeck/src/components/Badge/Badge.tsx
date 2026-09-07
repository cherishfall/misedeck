// Badge — small mono label, normal case.
//
// Used in the tools table for backend tags, in the context bar for
// status chips, in the version list for "Active" tags. Mono per the
// visual language; the border picks up the variant tint.

import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Badge.module.css";

export type BadgeVariant =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Data badge: the content is an identifier (backend name, setting type).
   *  Resets any inherited transform/tracking so data renders exactly as
   *  reported (docs/design/ui-ux-rules.md data honesty). */
  data?: boolean;
  /** Leading glyph slot (e.g. a tiny dot). Optional. */
  leading?: ReactNode;
  children: ReactNode;
}

export function Badge({
  variant = "default",
  data = false,
  leading,
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = [
    styles.badge,
    styles[`variant-${variant}`],
    data ? styles.data : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span {...rest} className={classes}>
      {leading !== undefined && <span className={styles.affix}>{leading}</span>}
      <span>{children}</span>
    </span>
  );
}
