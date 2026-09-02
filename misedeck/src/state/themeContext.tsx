// Theme context — the two-state light / dark switch (issues #37, #54).
//
// The theme is fully manual: `light` | `dark`, default `light`, no
// system mode (visual-language decision). It persists in localStorage
// under `misedeck.theme` so the choice survives a relaunch, and drives
// `html[data-theme]`, which is the only thing `tokens.css` keys on.
// Values persisted by older builds (`system`, or anything unknown)
// migrate to the default `light` on read.
//
// Anti-flash: `index.html` runs a tiny inline script before first paint
// that reads the same storage key and pre-sets `data-theme`; this
// provider then takes over and keeps it in sync.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { setWindowTheme } from "../api/window";

/** The two choices the pill offers. Default is `light`. */
export const THEME_SETTINGS = ["light", "dark"] as const;
export type ThemeSetting = (typeof THEME_SETTINGS)[number];

/** localStorage key for the user's choice. */
export const THEME_STORAGE_KEY = "misedeck.theme";

export function isThemeSetting(value: string | null | undefined): value is ThemeSetting {
  return value === "light" || value === "dark";
}

interface ThemeContextValue {
  /** The user's theme — `light` or `dark`. */
  theme: ThemeSetting;
  /** Persist the choice and apply it. */
  setTheme: (next: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app and exposes the theme plus a setter.
 * Reads the stored theme once at mount (the inline script in
 * `index.html` has already applied it to `data-theme`), then keeps
 * `html[data-theme]` in sync with the setting.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeSetting>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    // Legacy `system` values and anything unknown migrate to light.
    return isThemeSetting(stored) ? stored : "light";
  });

  // Apply the theme to the document whenever it changes, and follow
  // through to the native window chrome (issue #47) so the title bar
  // tracks the theme without restart. Best-effort: a webview without
  // the Tauri bridge (plain-browser dev) rejects the invoke; the DOM
  // theme stays the source of truth either way.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void setWindowTheme(theme).catch(() => {});
  }, [theme]);

  const setTheme = useCallback((next: ThemeSetting) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Consume the current theme + setter. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
