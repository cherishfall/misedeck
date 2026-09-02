// Language switcher — in-window popover for the sidebar footer
// (#38, #54).
//
// Shows a globe icon + current locale + a slim chevron signaling the
// expandable list. Clicking opens a popover menu of supported languages
// rendered inside the app window (never an overlay window) so the
// control scales beyond the two shipped locales and is captured by
// window-level screenshots. The chosen language persists via the
// LanguageProvider. In the collapsed sidebar rail (#49) it renders
// icon-only with a tooltip, so the capability stays reachable; the
// popover opens upward unchanged.

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

interface LanguageSwitcherProps {
  /** Icon-only form for the collapsed sidebar rail. */
  iconOnly?: boolean;
}

export function LanguageSwitcher({ iconOnly = false }: LanguageSwitcherProps) {
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
        className={iconOnly ? styles.triggerIcon : styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(I18N_KEYS.languages.switcherLabel)}
        title={iconOnly ? t(I18N_KEYS.languages.switcherLabel) : undefined}
      >
        <span className={styles.glyph} aria-hidden="true">
          <GlobeIcon />
        </span>
        {!iconOnly && (
          <>
            <span className={styles.current}>{t(LANGUAGE_LABELS[language])}</span>
            <span
              className={open ? styles.chevronOpen : styles.chevron}
              aria-hidden="true"
            >
              <ChevronIcon />
            </span>
          </>
        )}
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

/** Geometric globe — circle + meridians, drawn as SVG so both themes
 *  inherit `currentColor`. */
function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="2.8" ry="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.8 8h12.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Slim chevron pointing at the popover direction; rotates when open. */
function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 3.5 5 6.5 8 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
