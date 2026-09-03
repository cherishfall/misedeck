// FloatingMenu — a portal-based floating-layer primitive for MiseDeck
// (issue #63).
//
// Why this exists: the sidebar clips popovers (its `overflow: hidden`
// cuts the 120px language menu to ~39px when collapsed), and the two
// hand-rolled popovers had drifted apart on behavior and a11y. This is
// the shared primitive both of them (and future ones) render through.
//
// Design decisions (finalized with the owner, do not relitigate):
//   - React 19 `createPortal` into `document.body` — never a separate
//     overlay window (`ui-ux-rules.md:47`). Custom properties live on
//     `:root`, so themed tokens still inherit at body level.
//   - Hand-computed positioning from `getBoundingClientRect`, zero new
//     dependencies. No `@floating-ui/react`; the project is zero-UI /
//     zero-positioning-library by fiat.
//   - Click-outside is judged against the *trigger ref and the portal
//     container ref together*. Portaling a popover moves it outside its
//     old root, so the old `rootRef.contains(e.target)` test misreads an
//     in-menu click as "outside" and closes instantly.
//   - WAI-ARIA Menu Button Pattern: arrow/Home/End navigation, Enter/Space
//     activate (native buttons), Escape closes, Tab closes and leaves,
//     focus enters the first item on open and returns to the trigger on
//     close. `aria-controls` links trigger to menu.
//   - Configurable, not opinionated: placement (`up`/`down`), alignment,
//     gap, and arbitrary children. The directory menu (#64) keeps its own
//     shape; only the language menu is migrated here.
//   - No entrance animation (visual-language.md restraint).

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import styles from "./FloatingMenu.module.css";

/** Where the menu opens relative to the trigger. */
export type FloatingPlacement = "up" | "down";
/** Which trigger edge the menu aligns to. */
export type FloatingAlign = "start" | "end";

/** Props the caller spreads onto its trigger button. */
export interface FloatingTriggerProps {
  ref: (node: HTMLElement | null) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: (event: ReactMouseEvent) => void;
}

export interface FloatingMenuProps {
  /** Open state, controlled by the caller. */
  open: boolean;
  /** Request a state change (trigger click, Escape, click-outside, Tab). */
  onOpenChange: (open: boolean) => void;
  /** Direction the menu opens. Defaults to `up` (language menu). */
  placement?: FloatingPlacement;
  /** Which trigger edge the menu aligns to. Defaults to `start`. */
  align?: FloatingAlign;
  /** Gap between trigger and menu, in px. Defaults to 6. */
  gap?: number;
  /** Accessible label for the menu when it has no visible caption. */
  "aria-label"?: string;
  /** Trigger render-prop — spread the result onto the trigger button. */
  trigger: (props: FloatingTriggerProps) => ReactNode;
  /** Menu contents. Elements with `role="menuitem"` join keyboard nav. */
  children: ReactNode;
}

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

export function FloatingMenu({
  open,
  onOpenChange,
  placement = "up",
  align = "start",
  gap = 6,
  "aria-label": ariaLabel,
  trigger,
  children,
}: FloatingMenuProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  // Whether the next close should return focus to the trigger (Tab must not).
  const returnFocus = useRef(true);
  const prevOpen = useRef(false);

  const computePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const layerEl = layerRef.current;
    if (!triggerEl || !layerEl) return;
    const t = triggerEl.getBoundingClientRect();
    const m = layerEl.getBoundingClientRect();

    const top = placement === "up" ? t.top - m.height - gap : t.bottom + gap;
    let left = align === "end" ? t.right - m.width : t.left;
    // Keep the menu inside the viewport horizontally (no auto-flip).
    const maxLeft = window.innerWidth - m.width - 4;
    left = Math.max(4, Math.min(left, maxLeft));
    setCoords({ top, left });
  }, [placement, align, gap]);

  // Position after the layer mounts (and whenever geometry-affecting
  // props change). useLayoutEffect avoids a first-paint flash.
  useLayoutEffect(() => {
    if (open) computePosition();
  }, [open, computePosition]);

  // Re-anchor while open if the page reflows (internal scroll / resize).
  useEffect(() => {
    if (!open) return;
    const onReflow = () => computePosition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, computePosition]);

  // Dismissal: pointerdown outside (trigger ∪ portal) and key handling.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || layerRef.current?.contains(target)) return;
      returnFocus.current = true;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        returnFocus.current = true;
        onOpenChange(false);
      } else if (e.key === "Tab") {
        // Let the browser move focus naturally; do not yank it back.
        returnFocus.current = false;
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  // Focus management: enter the first item on open, return to the trigger
  // on close (except when Tab closed the menu).
  useEffect(() => {
    if (open && !prevOpen.current) {
      layerRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
    } else if (!open && prevOpen.current) {
      if (returnFocus.current) triggerRef.current?.focus();
      returnFocus.current = true;
    }
    prevOpen.current = open;
  }, [open]);

  // Keyboard navigation between menu items (WAI-ARIA Menu Button Pattern).
  const onMenuKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
        return;
      }
      const layer = layerRef.current;
      if (!layer) return;
      const items = Array.from(layer.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next = current;
      switch (e.key) {
        case "ArrowDown":
          next = current < 0 ? 0 : (current + 1) % items.length;
          break;
        case "ArrowUp":
          next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = items.length - 1;
          break;
      }
      e.preventDefault();
      items[next]?.focus();
    },
    [],
  );

  const triggerProps: FloatingTriggerProps = {
    ref: (node) => {
      triggerRef.current = node;
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": menuId,
    onClick: () => onOpenChange(!open),
  };

  return (
    <>
      {trigger(triggerProps)}
      {open &&
        createPortal(
          <div
            ref={layerRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            className={styles.layer}
            style={coords ? { top: coords.top, left: coords.left } : undefined}
            onKeyDown={onMenuKeyDown}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
