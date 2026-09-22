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
// window, per the popover rule). Escape and a backdrop click cancel;
// the confirm button autofocuses on open for keyboard-first operation.
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
// command-firing controls and never run-lock.

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { Button } from "../Button/Button";
import styles from "./ConfirmDialog.module.css";

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

  const commands = Array.isArray(command) ? command : [command];

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
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            autoFocus
            disabled={confirmBusy}
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
