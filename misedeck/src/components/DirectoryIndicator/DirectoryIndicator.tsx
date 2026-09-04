// DirectoryIndicator — the slim directory strip from issue #38.
//
// Persistent across both directory states: it always renders, and only
// its contents change with `mode`. "current directory / 当前目录" is the
// binding vocabulary (see docs/design/ui-ux-rules.md:45); the retired
// "Context/上下文" / "project/项目" words are never used in UI copy.
//
// Copy-command used to live here; it moved to the execution panel, which
// is the actual command history (issue #72 / ADR-0005).
//
// The trailing "…" pick button was removed: in directory mode the
// prominent "Choose another directory" primary button replaces it, and
// in global mode the primary "Pick a directory" button is the entry
// point. The shared pick handler lives in `directory/pickDirectory.ts`.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { pickDirectory } from "../../directory/pickDirectory";
import {
  useActivation,
  type OpenTerminalOutcome,
} from "../../state/activationContext";

import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { FloatingMenu } from "../FloatingMenu";

import styles from "./DirectoryIndicator.module.css";

interface DirectoryIndicatorProps {
  /** Explicit render mode. Passed by the parent from the directory
   *  context — the component never infers it from `cwd` itself. */
  mode: "global" | "directory";
}

export function DirectoryIndicator({ mode }: DirectoryIndicatorProps) {
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

  const onPick = () => {
    void pickDirectory(t, setDirectory);
  };

  const onOpenInTerminal = () => {
    const path = context.kind === "dir" ? context.path : null;
    void openInTerminal(path);
  };

  // Global mode: only the Global label and a prominent choose-directory
  // button. Directory-only actions (open-in-terminal, recents, the picker)
  // mean nothing without a directory, so they are hidden here.
  if (mode === "global") {
    return (
      <div
        className={styles.strip}
        role="region"
        aria-label={t(I18N_KEYS.directory.globalButton)}
      >
        <div className={styles.row}>
          <span className={styles.eyebrow}>{t(I18N_KEYS.directory.globalMode)}</span>
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="sm"
              onClick={onPick}
              data-testid="directory-indicator-choose"
            >
              {t(I18N_KEYS.directory.pickerLabel)}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Directory mode: the full toolbar. A confirmed directory context is
  // expected here (the parent derives `mode` from it); guard anyway.
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

          <Button
            variant="primary"
            size="sm"
            onClick={onPick}
            data-testid="directory-indicator-pick"
          >
            {t(I18N_KEYS.directory.chooseAnother)}
          </Button>
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
