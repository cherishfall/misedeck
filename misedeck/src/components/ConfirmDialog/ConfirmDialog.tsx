// ConfirmDialog — reusable confirmation modal for destructive actions.
//
// Per docs/design/ui-ux-rules.md every destructive action (uninstall,
// unset, overwrite) must confirm first, and the confirmation is a
// teaching moment: it shows the exact mise command that will run. This
// component is intentionally generic so future destructive actions
// (issue #56: "Same pattern is reusable for future destructive actions")
// only supply their own title / body / command / labels — they never
// re-implement the modal.
//
// The overlay renders inside the app window (never as a separate OS
// window, per the popover rule). Escape and a backdrop click cancel;
// the confirm button autofocuses on open for keyboard-first operation.

import { useEffect, type ReactNode } from "react";

import { Button } from "../Button/Button";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  /** When false the dialog renders nothing. */
  open: boolean;
  /** Dialog title (already translated by the caller). */
  title: string;
  /** Supporting copy above the command (already translated). */
  body: string;
  /** The exact mise command that will run, rendered as inline code. */
  command: string;
  /** Label for the confirm (destructive) button. */
  confirmLabel: string;
  /** Label for the cancel button. */
  cancelLabel: string;
  /** Use the danger variant for confirm when true (default). */
  danger?: boolean;
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
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onCancel}
      data-testid="confirm-dialog-overlay"
    >
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.commandWrap}>
          <code className={styles.command}>{command}</code>
        </div>
        {children}
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            autoFocus
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
