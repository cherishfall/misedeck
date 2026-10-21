// Which elements can hold keyboard focus — shared by the confirm
// dialog's focus trap and by Tooltip's decision whether its trigger
// needs a tab stop (issue #227).
//
// Two exclusions carry the meaning:
//   - `[tabindex="-1"]` is focusable by script only, never by Tab, so it
//     belongs in neither a Tab cycle nor the "something focusable is
//     already inside" answer.
//   - Disabled form controls are not focusable. That is the case this
//     file exists for: a Tooltip wrapped around a disabled Button is the
//     standard way this app explains why a control is disabled, and a
//     wrapper that skipped itself there would leave the reason mouse-only.

export const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  // `tabindex="-1"` is script-focus only even on a button: KeyForm's
  // hidden submit button carries it so a form embedded in a dialog
  // never adds a dead stop to the Tab cycle (issue #260).
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");
