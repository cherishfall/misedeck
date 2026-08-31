// i18n bootstrap. Mirrors the prescribed stack in docs/agents/architecture.md
// and the operational rules in docs/agents/i18n.md.
//
// Detection chain (highest priority first):
//   1. localStorage("misedeck.language") — set by <LanguageProvider>
//      when the user explicitly picks a language.
//   2. navigator language / querystring / cookie — i18next-browser-languagedetector.
//   3. `fallbackLng: "en"` — used when nothing else resolves.
//
// Supported languages are pinned to the two resources we ship with; a key
// missing from the active language is silently filled from the fallback.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./en.json";
import zhCN from "./zh-CN.json";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "./useLanguage";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // We persist the manual choice under a dedicated key; tell the detector
    // about it so it ranks above the navigator language.
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18n;
