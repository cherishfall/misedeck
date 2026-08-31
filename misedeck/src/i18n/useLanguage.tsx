// Language switcher plumbing.
//
// Detection chain (highest priority first):
//   1. localStorage  — the user's in-app choice, set by this provider
//   2. i18next-browser-languagedetector  — navigator language, querystring, …
//
// The provider listens to `i18next` language-change events and re-renders
// consumers so that toggling the switcher re-renders every translated
// string without a page reload. The chosen language is persisted under
// `misedeck.language` so it survives a relaunch.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "./keys";

/** The two languages MiseDeck ships with. Keep in sync with `supportedLngs`. */
export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** localStorage key for the user's manual choice. */
export const LANGUAGE_STORAGE_KEY = "misedeck.language";

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return value === "en" || value === "zh-CN";
}

interface LanguageContextValue {
  /** The current language, always one of `SUPPORTED_LANGUAGES`. */
  language: SupportedLanguage;
  /** Persist the choice and switch i18next. */
  setLanguage: (next: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app and exposes the current language plus a setter.
 * Must be rendered inside `<I18nextProvider>` (or have `react-i18next` init'd globally).
 */
export function LanguageProvider({ children }: LanguageProviderProps) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    // The detector has already run by the time we mount (i18n is init'd in
    // `main.tsx` before React boots). Trust whatever it produced if it
    // matches a supported language; otherwise fall back to the stored value
    // (which may be set by a previous session); otherwise "en".
    const detected = i18n.resolvedLanguage ?? i18n.language ?? "";
    if (isSupportedLanguage(detected)) return detected;
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
    return "en";
  });

  // Keep our state in sync with i18next if anything else changes the language
  // (e.g. another component calling `i18n.changeLanguage` directly).
  useEffect(() => {
    const handler = (lng: string) => {
      if (isSupportedLanguage(lng)) {
        setLanguageState(lng);
      }
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [i18n]);

  const setLanguage = useCallback(
    (next: SupportedLanguage) => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      void i18n.changeLanguage(next);
      // `languageChanged` will also fire, which sets state — but updating
      // here too makes the toggle feel instant even before the event lands.
      setLanguageState(next);
    },
    [i18n],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Consume the current language + setter. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}

// Re-export the language names so callers (e.g. the switcher) can `t()` them
// without re-importing the keys module.
export const LANGUAGE_LABELS = {
  en: I18N_KEYS.languages.english,
  "zh-CN": I18N_KEYS.languages.simplifiedChinese,
} as const;
