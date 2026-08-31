// Badge — small mono label with uppercase + tracking.
//
// Used in the tools table for backend tags, in the context bar for
// status chips, in the version list for "ACTIVE" tags. Mono + tracked
// per the visual language; the border picks up the variant tint.

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
  /** Leading glyph slot (e.g. a tiny dot). Optional. */
  leading?: ReactNode;
  children: ReactNode;
}

export function Badge({
  variant = "default",
  leading,
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = [styles.badge, styles[`variant-${variant}`], className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span {...rest} className={classes}>
      {leading !== undefined && <span className={styles.affix}>{leading}</span>}
      <span>{children}</span>
    </span>
  );
}
