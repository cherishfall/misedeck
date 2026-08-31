// Language switcher — toggles between the two languages MiseDeck ships
// with. The directory context bar (#23) will own a permanent copy of
// this control; this floating version is a temporary home so the
// switcher is independently demoable per the ticket.

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  useLanguage,
  type SupportedLanguage,
} from "../../i18n/useLanguage";

import styles from "./LanguageSwitcher.module.css";

/** Stable display order; do not derive from SUPPORTED_LANGUAGES so the UI
 * doesn't flicker if a new language is appended later. */
const ORDERED: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES;

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <div className={styles.switcher} role="group" aria-label={t(I18N_KEYS.languages.switcherLabel)}>
      <span className={styles.label}>{t(I18N_KEYS.languages.switcherLabel)}</span>
      <div className={styles.options}>
        {ORDERED.map((code, index) => {
          const isActive = code === language;
          return (
            <span key={code} className={styles.options}>
              <button
                type="button"
                className={styles.option}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  if (!isActive) setLanguage(code);
                }}
              >
                {t(LANGUAGE_LABELS[code])}
              </button>
              {index < ORDERED.length - 1 && <span className={styles.divider} aria-hidden="true" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
