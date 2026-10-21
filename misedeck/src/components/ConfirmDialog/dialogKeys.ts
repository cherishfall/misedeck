import { FOCUSABLE_SELECTOR } from "../../utils/focusable";
import { nextFocusIndex } from "./focusTarget";

export interface DialogKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export function handleDialogKey(
  event: DialogKeyEvent,
  root: HTMLElement | null,
  onCancel: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onCancel();
    return;
  }
  if (event.key !== "Tab" || !root) return;
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  // Always preventDefault: Tab is ours to place now, whether there is
  // somewhere inside to send it or not.
  event.preventDefault();
  event.stopPropagation();
  const active = root.ownerDocument.activeElement;
  const index = nextFocusIndex(
    nodes.length,
    nodes.indexOf(active as HTMLElement),
    event.shiftKey,
  );
  if (index < 0) {
    // Nothing focusable inside (busy dialog: Confirm is disabled) —
    // park focus on the dialog itself rather than let Tab escape.
    root.focus();
    return;
  }
  nodes[index].focus();
}

/**
 * Capture phase: forms that render a dialog inside themselves (KeyForm)
 * stop Escape in their own onKeyDown, which would swallow a bubble-phase
 * listener. Stop propagation here so that form does not also act on it.
 */
export function subscribeDialogKeys(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  getRoot: () => HTMLElement | null,
  onCancel: () => void,
): () => void {
  const onKey = (event: Event) => {
    handleDialogKey(event as unknown as DialogKeyEvent, getRoot(), onCancel);
  };
  target.addEventListener("keydown", onKey, true);
  return () => target.removeEventListener("keydown", onKey, true);
}
