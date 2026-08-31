// i18n bootstrap. Mirrors the prescribed stack in docs/agents/architecture.md.
// We use flat string IDs and resolve both the en and zh-CN resource files
// at boot. The next ticket (#19) will round out the key set.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./en.json";
import zhCN from "./zh-CN.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN"],
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18n;
