// Focus decisions for the shared ConfirmDialog (issue #227).
//
// Why these live apart from the component: they are the modal's
// keyboard behavior that can be decided without a DOM, so they are
// unit-tested here (`focusTarget.test.ts`). The DOM half — reading which
// elements are focusable, calling `.focus()` — stays in the component,
// which this repo cannot render in tests (there is no DOM environment).

/** Which in-dialog control receives focus when the modal opens. */
export type DialogFocusTarget = "cancel" | "confirm";

/**
 * Initial focus for a confirm dialog.
 *
 * A destructive dialog must not arm its own destructive button: opening
 * it with Enter and then hitting Enter again would run the destructive
 * command before the user read what it does — so `danger` starts on
 * Cancel, and the keyboard path to destruction stays a deliberate Tab
 * plus Enter. `confirmBusy` also starts on Cancel because a busy Confirm
 * renders disabled and a disabled button cannot hold focus: focusing it
 * would drop focus to the body and the first Tab would leave the modal.
 * Everything else — the rare, non-destructive confirmation — keeps
 * Confirm, where a keyboard user expects to land.
 */
export function initialDialogFocusTarget({
  danger,
  confirmBusy,
}: {
  danger: boolean;
  confirmBusy: boolean;
}): DialogFocusTarget {
  return danger || confirmBusy ? "cancel" : "confirm";
}

/**
 * The focus-trap wrap: given the dialog's focusable elements and the
 * index of the focused one, where Tab / Shift-Tab lands.
 *
 * `activeIndex` is -1 when focus is not on any of them — nothing inside
 * is focusable, or it escaped the modal before this ran. Tab then enters
 * the set from the near end instead of reaching the page behind the
 * overlay. Returns -1 only for an empty set: with nothing to move to,
 * the caller keeps focus where it is rather than handing Tab to the page.
 */
export function nextFocusIndex(
  count: number,
  activeIndex: number,
  backwards: boolean,
): number {
  if (count <= 0) return -1;
  if (activeIndex < 0) return backwards ? count - 1 : 0;
  if (!backwards) return (activeIndex + 1) % count;
  return (activeIndex - 1 + count) % count;
}
