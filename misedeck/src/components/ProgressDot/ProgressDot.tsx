// ProgressDot — a tiny status dot (beam / flare / breach / dim) with
// an attention-pulse animation. Replaces the hand-rolled `.dot` /
// `.dot--flare` rules in App.css for new components; the legacy class
// names remain for the starter page.

import type { CSSProperties } from "react";

import styles from "./ProgressDot.module.css";

export type ProgressDotTone = "beam" | "flare" | "breach" | "dim" | "ice";

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
