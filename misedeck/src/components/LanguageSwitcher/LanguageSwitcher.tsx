// Language switcher — in-window popover for the sidebar footer (#38, #54),
// migrated onto the shared FloatingMenu portal primitive (issue #63).
//
// Shows a globe icon + current locale + a slim chevron signaling the
// expandable list. Clicking opens a menu of supported languages rendered
// through a portal into document.body, so the collapsed rail (55px) can no
// longer clip it (the old `.sidebar` overflow:hidden cut ~81px). The menu
// follows the WAI-ARIA Menu Button Pattern: arrow/Home/End navigation,
// Escape and click-outside dismissal, focus management, and aria-controls.
// The chosen language persists via the LanguageProvider. In the collapsed
// sidebar rail (#49) it renders icon-only with a tooltip, so the capability
// stays reachable; the menu still opens upward unchanged.

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  useLanguage,
  type SupportedLanguage,
} from "../../i18n/useLanguage";
import { FloatingMenu } from "../FloatingMenu";

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

  return (
    <FloatingMenu
      open={open}
      onOpenChange={setOpen}
      placement="up"
      align="start"
      gap={6}
      aria-label={t(I18N_KEYS.languages.switcherLabel)}
      trigger={(tp) => (
        <button
          type="button"
          className={iconOnly ? styles.triggerIcon : styles.trigger}
          onClick={tp.onClick}
          aria-haspopup={tp["aria-haspopup"]}
          aria-expanded={tp["aria-expanded"]}
          aria-controls={tp["aria-controls"]}
          ref={tp.ref}
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
      )}
    >
      <div className={styles.popover}>
        {ORDERED.map((code) => (
          <button
            key={code}
            type="button"
            className={code === language ? styles.optionActive : styles.option}
            role="menuitem"
            aria-current={code === language ? "true" : undefined}
            tabIndex={-1}
            onClick={() => {
              setLanguage(code);
              setOpen(false);
            }}
          >
            {t(LANGUAGE_LABELS[code])}
          </button>
        ))}
      </div>
    </FloatingMenu>
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
