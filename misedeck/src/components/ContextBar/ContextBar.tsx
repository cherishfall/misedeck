// ContextBar — the top directory bar from issue #23 / ADR-0004.
//
// One-line strip that surfaces the active directory context ("Global"
// or a directory path) and the controls to change it: jump back to
// Global, open the directory picker, or pick from the recents list.
// The picked directory is set in the DirectoryProvider (React
// context, see state/directoryContext.tsx).
//
// Issue #28 adds the "Open in Terminal" and "Copy command"
// affordances to a secondary row. Both sit underneath the
// directory pickers and read the same `useDirectory()` so the
// terminal always lands in the active directory.
//
// Persistence: the active context and the recents list live in
// localStorage under versioned keys (see DirectoryProvider). The bar
// is a pure consumer — it never reads or writes storage directly.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory, dirContextLabel } from "../../state/directoryContext";
import {
  useActivation,
  type OpenTerminalOutcome,
} from "../../state/activationContext";
import { useExecutionContext } from "../ExecutionPanel";

import { IconButton } from "../IconButton/IconButton";

import styles from "./ContextBar.module.css";

export function ContextBar() {
  const { t } = useTranslation();
  const { context, recents, setDirectory, setGlobal, removeRecent } = useDirectory();
  const { openInTerminal, openOutcome, consumeOpenOutcome } = useActivation();
  const { state: execState } = useExecutionContext();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const recentsRef = useRef<HTMLDivElement | null>(null);
  // Transient hint for the "Copy command" / "Open in Terminal"
  // buttons. Cleared after 1.5s / 4s respectively.
  const [copyHint, setCopyHint] = useState(false);
  const [openHint, setOpenHint] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const openHintTimer = useRef<number | null>(null);

  // Click-away + Escape close the recents popover. Plain DOM events
  // here because the popover is presentation-only and doesn't need
  // its own reducer.
  useEffect(() => {
    if (!recentsOpen) return;
    const onPointer = (e: PointerEvent) => {
      const root = recentsRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setRecentsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecentsOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [recentsOpen]);

  // Subscribe to the latest open-in-terminal outcome. When a
  // new outcome arrives, render a transient toast in the bar
  // and clear it after 4s. We track the most-recent outcome in
  // a ref so re-renders (e.g. when the page navigates) don't
  // re-fire the toast for the same outcome.
  const lastOutcomeRef = useRef<OpenTerminalOutcome | null>(null);
  useEffect(() => {
    if (!openOutcome) return;
    if (lastOutcomeRef.current === openOutcome) return;
    lastOutcomeRef.current = openOutcome;
    // Clear the consumed value so the next click can re-fire
    // even if the outcome is identical to the previous one
    // (e.g. user opens the same path twice in a row).
    consumeOpenOutcome();
    if (openHintTimer.current !== null) {
      window.clearTimeout(openHintTimer.current);
    }
    if (openOutcome.kind === "ok") {
      const o = openOutcome.outcome;
      setOpenHint({
        kind: "ok",
        text: t(I18N_KEYS.activation.openInTerminalSuccess, {
          terminal: o.terminalApp,
          path: o.path,
        }),
      });
    } else {
      const path = openOutcome.path ?? "";
      setOpenHint({
        kind: "error",
        text: t(I18N_KEYS.activation.openInTerminalError, { path }),
      });
    }
    openHintTimer.current = window.setTimeout(() => {
      setOpenHint(null);
      openHintTimer.current = null;
    }, 4000);
  }, [openOutcome, consumeOpenOutcome, t]);

  const onPick = async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: t(I18N_KEYS.contextBar.pickerTitle),
      });
      if (typeof picked === "string" && picked.length > 0) {
        setDirectory(picked);
      }
    } catch {
      // User cancelled or dialog failed; nothing to do. The Tauri dialog
      // plugin resolves to null on cancel and only rejects on hard IPC
      // failure, which we treat the same as a cancel.
    }
  };

  // Build the equivalent mise command for the current view.
  //   * Global    → `mise ls` (the global tools list)
  //   * Directory → `mise -C <dir> ls` (the directory preview)
  //   * When the execution panel has just run a command, that
  //     command is the most relevant copy — the user is
  //     looking at logs for a specific invocation. Falls back
  //     to the page default otherwise.
  const buildCommand = (): string => {
    const fromPanel = execState.request;
    if (fromPanel) {
      const parts = ["mise"];
      if (fromPanel.cwd) parts.push("-C", fromPanel.cwd);
      for (const a of fromPanel.args) {
        if (a.includes(" ") || a.includes("\t")) {
          parts.push(JSON.stringify(a));
        } else {
          parts.push(a);
        }
      }
      return parts.join(" ");
    }
    const parts = ["mise"];
    if (context.kind === "dir") parts.push("-C", context.path);
    parts.push("ls");
    return parts.join(" ");
  };

  const onCopyCommand = async () => {
    const text = buildCommand();
    const ok = await writeClipboard(text);
    if (ok) {
      setCopyHint(true);
      window.setTimeout(() => setCopyHint(false), 1500);
    }
  };

  const onOpenInTerminal = () => {
    const path = context.kind === "dir" ? context.path : null;
    void openInTerminal(path);
  };

  const isGlobal = context.kind === "global";
  const label = dirContextLabel(context);

  return (
    <div className={styles.bar} role="region" aria-label={t(I18N_KEYS.contextBar.regionLabel)}>
      <div className={styles.row}>
        <span className={styles.eyebrow}>{t(I18N_KEYS.contextBar.eyebrow)}</span>

        <div className={styles.contextBlock}>
          <span
            className={isGlobal ? styles.contextValueGlobal : styles.contextValueDir}
            data-testid="context-bar-label"
          >
            {label}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={isGlobal ? styles.toggleActive : styles.toggle}
            onClick={setGlobal}
            aria-pressed={isGlobal}
            data-testid="context-bar-global"
          >
            {t(I18N_KEYS.contextBar.globalButton)}
          </button>

          <div className={styles.recentsRoot} ref={recentsRef}>
            <button
              type="button"
              className={recentsOpen || recents.length > 0 ? styles.toggle : styles.toggleDisabled}
              onClick={() => setRecentsOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={recentsOpen}
              disabled={recents.length === 0 && !recentsOpen}
              data-testid="context-bar-recents"
            >
              {t(I18N_KEYS.contextBar.recentsButton)} ▾
            </button>
            {recentsOpen && recents.length > 0 && (
              <div className={styles.popover} role="menu">
                <div className={styles.popoverHeader}>
                  {t(I18N_KEYS.contextBar.recentsHeader)}
                </div>
                <ul className={styles.recentsList}>
                  {recents.map((path) => (
                    <li key={path} className={styles.recentItem}>
                      <button
                        type="button"
                        className={styles.recentPick}
                        onClick={() => {
                          setDirectory(path);
                          setRecentsOpen(false);
                        }}
                        role="menuitem"
                        title={path}
                      >
                        <span className={styles.recentPath}>{path}</span>
                      </button>
                      <IconButton
                        aria-label={t(I18N_KEYS.contextBar.removeRecentLabel)}
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRecent(path)}
                      >
                        ×
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <IconButton
            aria-label={t(I18N_KEYS.contextBar.pickerLabel)}
            variant="secondary"
            size="sm"
            onClick={onPick}
            data-testid="context-bar-pick"
          >
            {t(I18N_KEYS.contextBar.pickerGlyph)}
          </IconButton>
        </div>
      </div>

      {/* Issue #28: secondary row with the activation entry
          points. Sits on the same surface as the directory
          pickers but stays below them so the primary
          context-pick controls are still the most prominent. */}
      <div className={styles.activationRow}>
        <button
          type="button"
          className={styles.activationToggle}
          onClick={onOpenInTerminal}
          data-testid="context-bar-open-in-terminal"
        >
          {t(I18N_KEYS.activation.openInTerminalLabel)}
        </button>
        <button
          type="button"
          className={styles.activationToggle}
          onClick={onCopyCommand}
          data-testid="context-bar-copy-command"
          title={t(I18N_KEYS.activation.copyCommandHint)}
        >
          {copyHint
            ? t(I18N_KEYS.activation.copiedHint)
            : t(I18N_KEYS.activation.copyCommandLabel)}
        </button>
        {openHint && (
          <span
            className={openHint.kind === "ok" ? styles.openHintOk : styles.openHintError}
            data-testid="context-bar-open-hint"
          >
            {openHint.text}
          </span>
        )}
      </div>

    </div>
  );
}

/** Cross-platform clipboard write. Returns `true` on success,
 *  `false` on any failure (the caller renders no error — the
 *  clipboard API failure is rare and the button stays usable). */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
