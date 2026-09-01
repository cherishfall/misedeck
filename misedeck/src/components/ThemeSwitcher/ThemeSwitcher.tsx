// Theme switcher — the minimal working toggle for issue #37: cycles the
// theme setting between system / light / dark (default system, persisted
// via the ThemeProvider). Its final home is the sidebar footer, which
// lands with the app-shell ticket (#38); until then it floats next to
// the language switcher, mirroring that control's shape.

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import {
  THEME_SETTINGS,
  useTheme,
  type ThemeSetting,
} from "../../state/themeContext";

import styles from "./ThemeSwitcher.module.css";

/** Stable display order: system first (the default), then the overrides. */
const ORDERED: readonly ThemeSetting[] = THEME_SETTINGS;

const THEME_LABELS = {
  system: I18N_KEYS.theme.system,
  light: I18N_KEYS.theme.light,
  dark: I18N_KEYS.theme.dark,
} as const;

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={styles.switcher}
      role="group"
      aria-label={t(I18N_KEYS.theme.switcherLabel)}
    >
      <span className={styles.label}>{t(I18N_KEYS.theme.switcherLabel)}</span>
      <div className={styles.options}>
        {ORDERED.map((setting, index) => {
          const isActive = setting === theme;
          return (
            <span key={setting} className={styles.options}>
              <button
                type="button"
                className={styles.option}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  if (!isActive) setTheme(setting);
                }}
              >
                {t(THEME_LABELS[setting])}
              </button>
              {index < ORDERED.length - 1 && (
                <span className={styles.divider} aria-hidden="true" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
