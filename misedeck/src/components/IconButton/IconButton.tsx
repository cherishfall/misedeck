// IconButton — a square button carrying only a glyph.
//
// Used wherever a control needs a visual but no label (the language
// switcher's option pill, the corner kebab in tables, etc.). Square
// footprint, transparent background, dim → beam on hover/focus. Shares
// the same variant set as Button but renders no label.

import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./IconButton.module.css";

export type IconButtonVariant = "ghost" | "secondary";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: "sm" | "md";
  /** Required for accessibility — describe what the button does. */
  "aria-label": string;
  children: ReactNode;
}

export function IconButton({
  variant = "ghost",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = [
    styles.iconButton,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...rest} type={type} className={classes}>
      <span className={styles.glyph} aria-hidden="true">
        {children}
      </span>
    </button>
  );
}
