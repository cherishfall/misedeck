// PageShell — the chrome (context bar + wordmark + language switcher
// + execution panel) shared by every app page. Lifted out of App.tsx
// when the tools page (#21) needed the same chrome as the starter;
// future pages (#24 directory resolved-state, #27 tasks, #29
// doctor, …) get it for free. The `<main>` slot is whatever the
// route renders.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";

import { ContextBar } from "../ContextBar/ContextBar";
import { ExecutionPanel } from "../ExecutionPanel";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";

import styles from "./PageShell.module.css";

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const onStyleguide = location.pathname === "/__styleguide";
  const onTools = location.pathname === "/tools";
  const onHome = location.pathname === "/";
  return (
    <div className={styles.shell}>
      <ContextBar />
      <header className={styles.wordmark}>
        <Link
          to="/"
          className={styles.wordmarkName}
          aria-current={onHome ? "page" : undefined}
        >
          {t(I18N_KEYS.app.wordmark)}
        </Link>
        <span className={styles.wordmarkTagline}>{t(I18N_KEYS.app.tagline)}</span>
        <Link
          to="/tools"
          className={styles.wordmarkNav}
          aria-current={onTools ? "page" : undefined}
          data-testid="wordmark-tools"
        >
          {t(I18N_KEYS.nav.tools)}
        </Link>
        <Link
          to="/__styleguide"
          className={styles.wordmarkNav}
          aria-current={onStyleguide ? "page" : undefined}
        >
          {t(I18N_KEYS.styleguide.styleguideLink)}
        </Link>
      </header>

      <LanguageSwitcher />

      <main className={styles.main}>{children}</main>
      <ExecutionPanel />
    </div>
  );
}
