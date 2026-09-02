// Theme switcher — two-state light / dark pill styled after the
// mise.jdx.dev sun/moon sliding knob (default light, fully manual,
// persisted via the ThemeProvider; #54). Its home is the sidebar footer
// (#38); in the collapsed rail (#49) it renders as a single icon button
// that toggles the theme, with a tooltip naming the current one, so the
// capability stays reachable.

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useTheme, type ThemeSetting } from "../../state/themeContext";

import styles from "./ThemeSwitcher.module.css";

const THEME_LABELS = {
  light: I18N_KEYS.theme.light,
  dark: I18N_KEYS.theme.dark,
} as const;

interface ThemeSwitcherProps {
  /** Icon-only form for the collapsed sidebar rail: one button that
   *  toggles the theme, tooltip naming the current one. */
  iconOnly?: boolean;
}

export function ThemeSwitcher({ iconOnly = false }: ThemeSwitcherProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  const label = `${t(I18N_KEYS.theme.switcherLabel)}: ${t(THEME_LABELS[theme])}`;

  if (iconOnly) {
    return (
      <button
        type="button"
        className={styles.iconTrigger}
        onClick={toggle}
        aria-label={label}
        title={label}
      >
        <span className={styles.iconGlyph} aria-hidden="true">
          <ThemeIcon theme={theme} />
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
      <button
        type="button"
        className={styles.pill}
        role="switch"
        aria-checked={theme === "dark"}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        <span className={theme === "dark" ? styles.knobDark : styles.knob} aria-hidden="true">
          <ThemeIcon theme={theme} />
        </span>
      </button>
    </div>
  );
}

/** Sun for light, crescent moon for dark — SVG so both themes inherit
 *  `currentColor` (no emoji variants). */
function ThemeIcon({ theme }: { theme: ThemeSetting }) {
  if (theme === "dark") {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M14 9.6A6.2 6.2 0 1 1 6.4 2 4.8 4.8 0 0 0 14 9.6Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
