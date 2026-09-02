// Theme switcher — cycles the theme setting between system / light / dark
// (default system, persisted via the ThemeProvider). Its home is the
// sidebar footer (#38); in the collapsed rail (#49) it renders as a single
// icon button that cycles the settings, with a tooltip naming the current
// one, so the capability stays reachable.

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

/** Text glyphs for the collapsed-rail icon form (no emoji variants). */
const THEME_GLYPHS: Record<ThemeSetting, string> = {
  system: "◑",
  light: "☼",
  dark: "☾",
};

interface ThemeSwitcherProps {
  /** Icon-only form for the collapsed sidebar rail: one button that cycles
   *  the settings, tooltip naming the current one. */
  iconOnly?: boolean;
}

export function ThemeSwitcher({ iconOnly = false }: ThemeSwitcherProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  if (iconOnly) {
    const next = ORDERED[(ORDERED.indexOf(theme) + 1) % ORDERED.length];
    const label = `${t(I18N_KEYS.theme.switcherLabel)}: ${t(THEME_LABELS[theme])}`;
    return (
      <button
        type="button"
        className={styles.iconTrigger}
        onClick={() => setTheme(next)}
        aria-label={label}
        title={label}
      >
        <span className={styles.iconGlyph} aria-hidden="true">
          {THEME_GLYPHS[theme]}
        </span>
      </button>
    );
  }

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
