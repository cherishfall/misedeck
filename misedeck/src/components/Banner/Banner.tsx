// Banner — full-width notice with leading dot, label, body, optional
// trailing action. Used for the trust gate, outdated-tool nudges, and
// anything else that needs a callout without a modal. Shares the Panel
// surface but adds a structure (label row + body) and a tone-tinted
// leading dot.

import type { ReactNode } from "react";

import styles from "./Banner.module.css";

export type BannerTone = "info" | "warning" | "danger" | "success";

interface BannerProps {
  tone?: BannerTone;
  /** Label rendered in the top row, e.g. "Untrusted config". */
  label: ReactNode;
  /** Body text / children. */
  children: ReactNode;
  /** Optional call-to-action on the right side of the top row. */
  action?: ReactNode;
  className?: string;
  /** Live-region role. Informational banners are polite (`status`);
   *  a failure the user did not ask for must interrupt (`alert`) —
   *  the global failure notices opt in (issue #249). */
  role?: "status" | "alert";
}

export function Banner({
  tone = "info",
  label,
  children,
  action,
  className,
  role = "status",
}: BannerProps) {
  const classes = [styles.banner, styles[`tone-${tone}`], className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} role={role}>
      <div className={styles.row}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
        {action !== undefined && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
