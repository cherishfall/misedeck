// DirectoryIndicator — the slim directory strip from issue #38.
//
// Rendered only when a directory context is active (hidden in Global).
// Shows the real-case path with Open-in-Terminal and directory pick /
// recent-directory actions. The word "Context/上下文" is retired from UI
// copy in favor of "Directory / 目录".
//
// Copy-command used to live here; it moved to the execution panel, which
// is the actual command history (issue #72 / ADR-0005).

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import {
  useActivation,
  type OpenTerminalOutcome,
} from "../../state/activationContext";

import { IconButton } from "../IconButton/IconButton";
import { FloatingMenu } from "../FloatingMenu";

import styles from "./DirectoryIndicator.module.css";

export function DirectoryIndicator() {
  const { t } = useTranslation();
  const { context, recents, setDirectory, setGlobal, removeRecent } = useDirectory();
  const { openInTerminal, openOutcome, consumeOpenOutcome } = useActivation();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [openHint, setOpenHint] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const openHintTimer = useRef<number | null>(null);

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
          <FloatingMenu
            open={recentsOpen && recents.length > 0}
            onOpenChange={setRecentsOpen}
            placement="down"
            align="end"
            gap={6}
            aria-label={t(I18N_KEYS.directory.recentsHeader)}
            trigger={(tp) => (
              <button
                type="button"
                className={recentsOpen || recents.length > 0 ? styles.action : styles.actionDisabled}
                onClick={tp.onClick}
                aria-haspopup={tp["aria-haspopup"]}
                aria-expanded={tp["aria-expanded"]}
                aria-controls={tp["aria-controls"]}
                ref={tp.ref}
                disabled={recents.length === 0 && !recentsOpen}
                data-testid="directory-indicator-recents"
              >
                {t(I18N_KEYS.directory.recentsButton)} ▾
              </button>
            )}
          >
            <div className={styles.popover}>
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
                      tabIndex={-1}
                      title={recent}
                    >
                      <span className={styles.recentPath}>{recent}</span>
                    </button>
                    <IconButton
                      aria-label={t(I18N_KEYS.directory.removeRecentLabel)}
                      variant="ghost"
                      size="sm"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => removeRecent(recent)}
                    >
                      ×
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
          </FloatingMenu>

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
