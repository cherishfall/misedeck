// Language switcher — compact dropdown for the sidebar footer (#38).
//
// Shows a globe icon + current locale. Clicking opens a popover menu of
// supported languages so the control scales beyond the two shipped locales.
// The chosen language persists via the LanguageProvider.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  useLanguage,
  type SupportedLanguage,
} from "../../i18n/useLanguage";

import styles from "./LanguageSwitcher.module.css";

const ORDERED: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES;

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(I18N_KEYS.languages.switcherLabel)}
      >
        <span aria-hidden="true">◐</span>
        <span className={styles.current}>{t(LANGUAGE_LABELS[language])}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.popover} role="menu">
          {ORDERED.map((code) => (
            <button
              key={code}
              type="button"
              className={code === language ? styles.optionActive : styles.option}
              role="menuitem"
              aria-current={code === language ? "true" : undefined}
              onClick={() => {
                setLanguage(code);
                setOpen(false);
              }}
            >
              {t(LANGUAGE_LABELS[code])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
