// Panel — the translucent surface every page in MiseDeck uses.
//
// Per docs/design/visual-language.md:
//   - `--hull` at 72% opacity (the `--panel` token)
//   - 1px `--line` border
//   - 8px radius
//   - `backdrop-filter: blur(12px)` so the dot-grid + glow show through
//   - the page's *primary* panel may add `corner` for the L-bracket framing
//
// The component is polymorphic via `as`; only the elements that make
// semantic sense for a panel are exposed (div, section, article, aside).
// This keeps the API honest without dragging in a full polymorphic
// helper.

import type { CSSProperties, ElementType, ReactNode } from "react";

import styles from "./Panel.module.css";

export type PanelTone = "default" | "info" | "warning" | "danger";
export type PanelCorner = "none" | "tl-br";

interface PanelProps {
  /** Visual emphasis. `default` is the standard surface. */
  tone?: PanelTone;
  /**
   * Add HUD corner brackets. Reserved for the page's *primary* panel —
   * one per screen per the visual language. `tl-br` draws the two
   * L-marks in the top-left and bottom-right corners.
   */
  corner?: PanelCorner;
  /** Render as a different semantic element. Defaults to `<section>`. */
  as?: "div" | "section" | "article" | "aside";
  /** Extra class on the outer element (e.g. layout utilities). */
  className?: string;
  /** Inline style for layout-only concerns (width, etc.). */
  style?: CSSProperties;
  children?: ReactNode;
}

export function Panel({
  tone = "default",
  corner = "none",
  as = "section",
  className,
  style,
  children,
}: PanelProps) {
  const Component: ElementType = as;
  const classes = [
    styles.panel,
    styles[`tone-${tone}`],
    corner !== "none" ? styles.corner : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} style={style}>
      {corner !== "none" && (
        <>
          <span className={styles.cornerTL} aria-hidden="true" />
          <span className={styles.cornerBR} aria-hidden="true" />
        </>
      )}
      {children}
    </Component>
  );
}
