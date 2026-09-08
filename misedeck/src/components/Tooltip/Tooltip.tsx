// Tooltip — hover layer for ellipsized data (issue #89).
//
// Why this exists: ellipsized data cells carried the full value in a
// native `title`, whose delay (~1s+, often requiring a perfectly still
// pointer), styling, and non-interactivity are OS behavior the frontend
// cannot control. This primitive shows the full value after a ~250ms
// hover intent and appends a copy button; the layer stays open while
// the pointer is over it so the button is clickable.
//
// Scope (finalized in beta7): data surfaces only. Buttons and icons
// keep their native `title` — short labels, no copy need.
//
// Shares the floating-layer rules with FloatingMenu: createPortal into
// document.body (custom properties live on :root, so themed tokens
// inherit), hand-computed position from getBoundingClientRect, z-index
// from --z-popover, no entrance animation.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { CopyButton } from "../CopyButton";
import styles from "./Tooltip.module.css";

/** Hover intent before the layer opens — well under the OS ~1s title. */
const OPEN_DELAY_MS = 250;
/** Grace window for the pointer to travel from trigger to layer. */
const CLOSE_DELAY_MS = 120;
/** Gap between trigger and layer, in px. */
const GAP_PX = 6;

export interface TooltipProps {
  /** The full value: shown in the layer and copied by its button. */
  text: string;
  children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  useEffect(
    () => () => {
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
    },
    [],
  );

  const scheduleOpen = useCallback(() => {
    clearTimer(closeTimerRef);
    if (openTimerRef.current !== null) return;
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimer(openTimerRef);
    if (closeTimerRef.current !== null) return;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }, []);

  // Position once open: above the trigger, flipped below when the layer
  // would clip the viewport top; left-aligned, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const triggerEl = triggerRef.current;
    const layerEl = layerRef.current;
    if (!triggerEl || !layerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const layerRect = layerEl.getBoundingClientRect();
    let top = rect.top - layerRect.height - GAP_PX;
    if (top < 0) top = rect.bottom + GAP_PX;
    const left = Math.max(
      GAP_PX,
      Math.min(rect.left, window.innerWidth - layerRect.width - GAP_PX),
    );
    setCoords({ top, left });
  }, [open, text]);

  // A scroll moves the trigger out from under the layer; close rather
  // than trail stale coordinates.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Empty value guard (issue #107): no pop when there is no full value
  // to show — an empty or "—" (missing-data) cell renders untouched.
  // One guard here covers every call site.
  const trimmed = text.trim();
  if (!trimmed || trimmed === "—") return <>{children}</>;

  return (
    <span
      ref={triggerRef}
      className={styles.trigger}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={layerRef}
            id={tooltipId}
            role="tooltip"
            className={styles.layer}
            style={
              coords
                ? { top: coords.top, left: coords.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
          >
            <span className={styles.text}>{text}</span>
            <CopyButton text={text} className={styles.copy} />
          </div>,
          document.body,
        )}
    </span>
  );
}
