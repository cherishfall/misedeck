// ProgressDot — a tiny status dot (beam / grove / flare / breach / dim) with
// an attention-pulse animation. Replaces the hand-rolled `.dot` /
// `.dot--flare` rules the #17 starter page used to carry in App.css.

import type { CSSProperties } from "react";

import styles from "./ProgressDot.module.css";

export type ProgressDotTone = "beam" | "flare" | "breach" | "dim" | "ice" | "grove";

interface ProgressDotProps {
  tone?: ProgressDotTone;
  /** Enable the attention-pulse animation. Only used with flare/breach. */
  pulsing?: boolean;
  /** Optional accessible label, e.g. "outdated". */
  title?: string;
  /** Override the dot's pixel size. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function ProgressDot({
  tone = "beam",
  pulsing = false,
  title,
  size,
  className,
  style,
}: ProgressDotProps) {
  const pulse = pulsing || tone === "flare" || tone === "breach";
  const classes = [
    styles.dot,
    styles[`tone-${tone}`],
    pulse ? styles.pulse : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={classes}
      role={title !== undefined ? "status" : undefined}
      aria-label={title}
      style={
        size !== undefined
          ? { width: size, height: size, ...style }
          : style
      }
    />
  );
}
