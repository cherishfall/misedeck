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
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
