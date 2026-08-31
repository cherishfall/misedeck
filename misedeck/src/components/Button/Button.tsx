// Button — primary, secondary, ghost, danger. Sizes sm/md.
//
// Per docs/design/visual-language.md:
//   - primary: beam fill, void text
//   - secondary: line border, text fill
//   - ghost: no border, dim → text on hover
//   - danger: breach fill, void text
//
// All hover / focus / active states are ≤120ms ease per the
// "motion" rule (only three ambient loops exist; everything else is
// a state change). Loading uses the same disabled treatment + a
// mono label; we don't introduce a new animation just for the spinner.

import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Glyph rendered before the label, e.g. "▸". Optional. */
  leading?: ReactNode;
  /** Glyph rendered after the label, e.g. "▾". Optional. */
  trailing?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  leading,
  trailing,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    loading ? styles.loading : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {leading !== undefined && <span className={styles.affix}>{leading}</span>}
      <span className={styles.label}>{children}</span>
      {trailing !== undefined && <span className={styles.affix}>{trailing}</span>}
    </button>
  );
}
