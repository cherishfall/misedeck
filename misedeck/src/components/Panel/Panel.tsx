// Panel — the solid surface every page in MiseDeck uses.
//
// Per docs/design/visual-language.md (rewritten for #37):
//   - solid `--panel` fill (the `--hull` token)
//   - 1px `--line` border
//   - 8px radius
//   - a quiet shadow only where elevation matters (popovers, deck)
//
// The component is polymorphic via `as`; only the elements that make
// semantic sense for a panel are exposed (div, section, article, aside).
// This keeps the API honest without dragging in a full polymorphic
// helper.

import type { CSSProperties, ElementType, ReactNode } from "react";

import styles from "./Panel.module.css";

export type PanelTone = "default" | "info" | "warning" | "danger";

interface PanelProps {
  /** Visual emphasis. `default` is the standard surface. */
  tone?: PanelTone;
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
  as = "section",
  className,
  style,
  children,
}: PanelProps) {
  const Component: ElementType = as;
  const classes = [styles.panel, styles[`tone-${tone}`], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} style={style}>
      {children}
    </Component>
  );
}
