// ContextBar — the top directory bar from issue #23 / ADR-0004.
//
// One-line strip that surfaces the active directory context ("Global"
// or a directory path) and the controls to change it: jump back to
// Global, open the directory picker, or pick from the recents list.
// Per the visual language the bar carries the signature signal line
// along its bottom edge; the picked directory is set in the
// DirectoryProvider (React context, see state/directoryContext.tsx).
//
// Persistence: the active context and the recents list live in
// localStorage under versioned keys (see DirectoryProvider). The bar
// is a pure consumer — it never reads or writes storage directly.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory, dirContextLabel } from "../../state/directoryContext";

import { IconButton } from "../IconButton/IconButton";

import styles from "./ContextBar.module.css";

export function ContextBar() {
  const { t } = useTranslation();
  const { context, recents, setDirectory, setGlobal, removeRecent } = useDirectory();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const recentsRef = useRef<HTMLDivElement | null>(null);

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
      <div className={`signal-line ${styles.signal}`} aria-hidden="true" />
    </div>
  );
}
