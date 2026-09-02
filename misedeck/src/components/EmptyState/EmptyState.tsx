// EmptyState — eyebrow + title + body + optional CTA. Used when a page
// or panel has nothing to show yet (no tools installed, no tasks
// defined, no plugins registered). The eyebrow follows the
// `MISE / SECTION` convention so the empty context is clear.

import type { ReactNode } from "react";

import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  /** Tracked eyebrow, e.g. "MISE / TOOLS". Optional — omit when the page header already carries the eyebrow. */
  eyebrow?: ReactNode;
  /** Display title, e.g. "No tools installed". */
  title: ReactNode;
  /** Body text — one or two sentences. */
  body?: ReactNode;
  /** Optional CTA element (e.g. a <Button>). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  eyebrow,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={[styles.empty, className ?? ""].filter(Boolean).join(" ")}>
      {eyebrow !== undefined && <div className={styles.eyebrow}>{eyebrow}</div>}
      <div className={styles.title}>{title}</div>
      {body !== undefined && <p className={styles.body}>{body}</p>}
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}
