// DirectoryIndicator — the slim directory strip from issue #38.
//
// Rendered only when a directory context is active (hidden in Global).
// Shows the real-case path with Open-in-Terminal, Copy-Command, and
// directory pick / recent-directory actions. The word "Context/上下文"
// is retired from UI copy in favor of "Directory / 目录".

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import {
  useActivation,
  type OpenTerminalOutcome,
} from "../../state/activationContext";
import { useExecutionContext } from "../ExecutionPanel";

import { IconButton } from "../IconButton/IconButton";

import styles from "./DirectoryIndicator.module.css";

export function DirectoryIndicator() {
  const { t } = useTranslation();
  const { context, recents, setDirectory, setGlobal, removeRecent } = useDirectory();
  const { openInTerminal, openOutcome, consumeOpenOutcome } = useActivation();
  const { state: execState } = useExecutionContext();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const recentsRef = useRef<HTMLDivElement | null>(null);
  const [copyHint, setCopyHint] = useState(false);
  const [openHint, setOpenHint] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const openHintTimer = useRef<number | null>(null);

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

  const lastOutcomeRef = useRef<OpenTerminalOutcome | null>(null);
  useEffect(() => {
    if (!openOutcome) return;
    if (lastOutcomeRef.current === openOutcome) return;
    lastOutcomeRef.current = openOutcome;
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
        title: t(I18N_KEYS.directory.pickerTitle),
      });
      if (typeof picked === "string" && picked.length > 0) {
        setDirectory(picked);
      }
    } catch {
      // User cancelled or dialog failed.
    }
  };

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

  if (context.kind !== "dir") return null;
  const path = context.path;

  return (
    <div className={styles.strip} role="region" aria-label={t(I18N_KEYS.directory.regionLabel)}>
      <div className={styles.row}>
        <span className={styles.eyebrow}>{t(I18N_KEYS.directory.eyebrow)}</span>
        <span className={styles.path} data-testid="directory-indicator-path" title={path}>
          {path}
        </span>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={setGlobal}
            data-testid="directory-indicator-global"
          >
            {t(I18N_KEYS.directory.globalButton)}
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={onOpenInTerminal}
            data-testid="directory-indicator-open-in-terminal"
          >
            {t(I18N_KEYS.activation.openInTerminalLabel)}
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={onCopyCommand}
            data-testid="directory-indicator-copy-command"
            title={t(I18N_KEYS.activation.copyCommandHint)}
          >
            {copyHint ? t(I18N_KEYS.activation.copiedHint) : t(I18N_KEYS.activation.copyCommandLabel)}
          </button>

          <div className={styles.recentsRoot} ref={recentsRef}>
            <button
              type="button"
              className={recentsOpen || recents.length > 0 ? styles.action : styles.actionDisabled}
              onClick={() => setRecentsOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={recentsOpen}
              disabled={recents.length === 0 && !recentsOpen}
              data-testid="directory-indicator-recents"
            >
              {t(I18N_KEYS.directory.recentsButton)} ▾
            </button>
            {recentsOpen && recents.length > 0 && (
              <div className={styles.popover} role="menu">
                <div className={styles.popoverHeader}>{t(I18N_KEYS.directory.recentsHeader)}</div>
                <ul className={styles.recentsList}>
                  {recents.map((recent) => (
                    <li key={recent} className={styles.recentItem}>
                      <button
                        type="button"
                        className={styles.recentPick}
                        onClick={() => {
                          setDirectory(recent);
                          setRecentsOpen(false);
                        }}
                        role="menuitem"
                        title={recent}
                      >
                        <span className={styles.recentPath}>{recent}</span>
                      </button>
                      <IconButton
                        aria-label={t(I18N_KEYS.directory.removeRecentLabel)}
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRecent(recent)}
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
            aria-label={t(I18N_KEYS.directory.pickerLabel)}
            variant="secondary"
            size="sm"
            onClick={onPick}
            data-testid="directory-indicator-pick"
          >
            {t(I18N_KEYS.directory.pickerGlyph)}
          </IconButton>
        </div>
      </div>

      {openHint && (
        <div className={styles.hintRow}>
          <span
            className={openHint.kind === "ok" ? styles.openHintOk : styles.openHintError}
            data-testid="directory-indicator-open-hint"
          >
            {openHint.text}
          </span>
        </div>
      )}
    </div>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
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
