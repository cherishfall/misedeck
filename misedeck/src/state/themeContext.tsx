// Theme context — the system / light / dark switch (issue #37).
//
// The user picks a *setting* (`system` | `light` | `dark`); the app
// renders a *resolved* theme (`light` | `dark`). The setting defaults
// to `system`, follows `prefers-color-scheme` live, and persists in
// localStorage under `misedeck.theme` so a manual override survives a
// relaunch. The resolved theme drives `html[data-theme]`, which is the
// only thing `tokens.css` keys on.
//
// Anti-flash: `index.html` runs a tiny inline script before first paint
// that resolves the same storage key + media query and pre-sets
// `data-theme`; this provider then takes over and keeps it in sync.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** The three choices the toggle offers. Default is `system`. */
export const THEME_SETTINGS = ["system", "light", "dark"] as const;
export type ThemeSetting = (typeof THEME_SETTINGS)[number];

/** What actually renders — the setting resolved against the OS. */
export type ResolvedTheme = "light" | "dark";

/** localStorage key for the user's manual choice. */
export const THEME_STORAGE_KEY = "misedeck.theme";

export function isThemeSetting(value: string | null | undefined): value is ThemeSetting {
  return value === "system" || value === "light" || value === "dark";
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  return setting === "system" ? systemTheme() : setting;
}

interface ThemeContextValue {
  /** The user's setting — `system`, `light`, or `dark`. */
  theme: ThemeSetting;
  /** The theme actually rendered after resolving `system`. */
  resolvedTheme: ResolvedTheme;
  /** Persist the choice and re-resolve. */
  setTheme: (next: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app and exposes the theme setting plus a setter.
 * Reads the stored setting once at mount (the inline script in
 * `index.html` has already applied it to `data-theme`), then keeps
 * `html[data-theme]` in sync with the setting and the OS preference.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeSetting>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeSetting(stored) ? stored : "system";
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme),
  );

  // Apply the resolved theme to the document and re-resolve when the
  // OS preference changes while the setting is `system`.
  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(theme);
      document.documentElement.dataset.theme = resolved;
      setResolvedTheme(resolved);
    };
    apply();
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, [theme]);

  const setTheme = useCallback((next: ThemeSetting) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Consume the current theme setting + resolved theme + setter. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
