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
import { loadPersistent, savePersistent } from "../hooks/usePersistentState";

/** The two choices the pill offers. Default is `light`. */
const THEME_SETTINGS = ["light", "dark"] as const;
export type ThemeSetting = (typeof THEME_SETTINGS)[number];

/** localStorage key for the user's choice. */
const THEME_STORAGE_KEY = "misedeck.theme";

function isThemeSetting(value: string | null | undefined): value is ThemeSetting {
  return value === "light" || value === "dark";
}

interface ThemeContextValue {
  /** The user's theme — `light` or `dark`. */
  theme: ThemeSetting;
  /** Persist the choice and apply it. */
  setTheme: (next: ThemeSetting) => void;
  /** True when the page theme applied but the native window chrome did
   *  not follow (issue #262). The page change is never blocked; this
   *  only makes the divergence visible. */
  chromeFailed: boolean;
  /** Acknowledge the current chrome failure; the next failure re-arms
   *  the notice. */
  dismissChromeFailure: () => void;
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
    // Same guarded read as every other persisted value (issue #257): a
    // denied storage falls back to light instead of throwing above the
    // error boundary. The key stays a raw string because the pre-paint
    // script in `index.html` reads it directly.
    return loadPersistent<ThemeSetting>(THEME_STORAGE_KEY, "light", (raw) =>
      // Legacy `system` values and anything unknown migrate to light.
      isThemeSetting(raw) ? raw : "light",
    );
  });

  // Apply the theme to the document whenever it changes, and follow
  // through to the native window chrome (issue #47) so the title bar
  // tracks the theme without restart. The DOM theme is applied first
  // and unconditionally; a failed native call only raises a notice —
  // it never blocks or rolls back the page theme (issue #262).
  const [chromeFailed, setChromeFailed] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void setWindowTheme(theme).catch(() => setChromeFailed(true));
  }, [theme]);

  const dismissChromeFailure = useCallback(() => setChromeFailed(false), []);

  const setTheme = useCallback((next: ThemeSetting) => {
    savePersistent(THEME_STORAGE_KEY, next, (value) => value);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, chromeFailed, dismissChromeFailure }),
    [theme, setTheme, chromeFailed, dismissChromeFailure],
  );

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
