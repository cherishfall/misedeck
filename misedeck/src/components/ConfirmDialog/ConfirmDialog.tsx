// ConfirmDialog — reusable confirmation modal for destructive actions.
//
// Per docs/design/ui-ux-rules.md every destructive action (uninstall,
// unset, overwrite) must confirm first, and the confirmation is a
// teaching moment: it shows the exact mise command(s) that will run. This
// component is intentionally generic so future destructive actions
// (issue #56: "Same pattern is reusable for future destructive actions")
// only supply their own title / body / command / labels — they never
// re-implement the modal.
//
// The overlay renders inside the app window (never as a separate OS
// window, per the popover rule). Escape and a backdrop click cancel.
// Focus is chosen deliberately (issue #227): a destructive dialog
// starts on Cancel, so opening it with Enter and pressing Enter again
// does not run the destructive command — reaching it is a deliberate
// Tab. Tab / Shift-Tab cycle inside the dialog while it is open
// (`aria-modal` alone does not stop focus from leaving), Escape still
// cancels, and focus returns to whatever opened the dialog on close.
//
// The dialog is run-aware (issue #135 / #138): the caller passes
// `confirmBusy` — true only while the *specific* command this dialog
// dispatches is in flight. Confirm locks while `confirmBusy`, so a second
// confirm can't double-fire that command; Cancel (button, Escape,
// backdrop) always stays enabled. The lock is per-command, not global:
// a confirm dialog never locks because some unrelated command is running
// elsewhere (the single-flight rule from ADR-0005 was an accidental
// global lock and is dropped by issue #138). Because the lock lives
// here, the buttons that merely *open* a confirm dialog are not
// command-firing controls and never run-lock. A lock with no visible
// reason is a disabled control whose disability is unexplained, so the
// busy state also renders its reason in the dialog and points Confirm's
// `aria-describedby` at it (issue #227).

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { FOCUSABLE_SELECTOR } from "../../utils/focusable";
import { Button } from "../Button/Button";
import styles from "./ConfirmDialog.module.css";
import { initialDialogFocusTarget, nextFocusIndex } from "./focusTarget";

export interface ConfirmDialogProps {
  /** When false the dialog renders nothing. */
  open: boolean;
  /** Dialog title (already translated by the caller). */
  title: string;
  /** Supporting copy above the command (already translated). */
  body: string;
  /** The exact mise command(s) that will run, rendered as inline code.
   *  A multi-step action (e.g. an env rename: unset old key, then set
   *  new key) passes one entry per command, in execution order. */
  command: string | string[];
  /** Label for the confirm (destructive) button. */
  confirmLabel: string;
  /** Label for the cancel button. */
  cancelLabel: string;
  /** Use the danger variant for confirm when true (default). */
  danger?: boolean;
  /** True only while the specific command this dialog dispatches runs. */
  confirmBusy: boolean;
  /**
   * The directory context the confirmed command runs in. Global mode
   * (`null`) renders a "Working directory: ~ (home)" context line under
   * the command, because the terminal-perspective echo omits `-C $HOME`
   * there (issue #191); Directory mode shows the directory inline in
   * the `-C <dir>` echo and gets no extra line. Omit for non-mise
   * commands (e.g. the self-update confirmation).
   */
  cwd?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra node rendered under the command (e.g. a warning). */
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  body,
  command,
  confirmLabel,
  cancelLabel,
  danger = true,
  confirmBusy,
  cwd,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const busyNoteId = useId();

  // Runs once per opening: later changes (a command finishing, flipping
  // `confirmBusy`) must not steal focus back from wherever the user
  // tabbed to.
  useEffect(() => {
    if (!open) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const target = initialDialogFocusTarget({ danger, confirmBusy });
    (target === "cancel" ? cancelRef.current : confirmRef.current)?.focus();
    return () => opener?.focus();
    // Scope: this one effect. `danger` / `confirmBusy` are read only to
    // pick the initial target; re-running when they change would steal
    // focus back after a command finishes (see comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once per opening; danger/confirmBusy changes must not re-take focus
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      // Always preventDefault: Tab is ours to place now, whether there
      // is somewhere inside to send it or not.
      e.preventDefault();
      const index = nextFocusIndex(
        nodes.length,
        nodes.indexOf(document.activeElement as HTMLElement),
        e.shiftKey,
      );
      if (index < 0) {
        // Nothing focusable inside (busy dialog: Confirm is disabled) —
        // park focus on the dialog itself rather than let Tab escape.
        root.focus();
        return;
      }
      nodes[index].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const commands = Array.isArray(command) ? command : [command];

  return (
    <div
      className={styles.overlay}
      onClick={onCancel}
      data-testid="confirm-dialog-overlay"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        {commands.map((c, i) => (
          <div key={`${i}-${c}`} className={styles.commandWrap}>
            <code className={styles.command}>{c}</code>
          </div>
        ))}
        {cwd === null && (
          <p className={styles.workingDir}>
            {t(I18N_KEYS.execution.workingDirHome)}
          </p>
        )}
        {children}
        {confirmBusy && (
          <p id={busyNoteId} className={styles.busyNote}>
            {t(I18N_KEYS.common.confirmBusy)}
          </p>
        )}
        <div className={styles.actions}>
          <Button ref={cancelRef} variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? "danger" : "primary"}
            size="sm"
            disabled={confirmBusy}
            aria-describedby={confirmBusy ? busyNoteId : undefined}
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
