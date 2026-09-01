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

import { ActivationBanner } from "../ActivationBanner/ActivationBanner";
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
  const onTools = location.pathname === "/tools";
  const onTasks = location.pathname === "/tasks";
  const onPreview = location.pathname === "/preview";
  const onConfig = location.pathname === "/config";
  const onSettings = location.pathname === "/settings";
  const onDoctor = location.pathname === "/doctor";
  const onPlugins = location.pathname === "/plugins";
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
          to="/tasks"
          className={styles.wordmarkNav}
          aria-current={onTasks ? "page" : undefined}
          data-testid="wordmark-tasks"
        >
          {t(I18N_KEYS.nav.tasks)}
        </Link>
        <Link
          to="/preview"
          className={styles.wordmarkNav}
          aria-current={onPreview ? "page" : undefined}
          data-testid="wordmark-preview"
        >
          {t(I18N_KEYS.preview.nav)}
        </Link>
        <Link
          to="/config"
          className={styles.wordmarkNav}
          aria-current={onConfig ? "page" : undefined}
          data-testid="wordmark-config"
        >
          {t(I18N_KEYS.config.nav)}
        </Link>
        <Link
          to="/doctor"
          className={styles.wordmarkNav}
          aria-current={onDoctor ? "page" : undefined}
          data-testid="wordmark-doctor"
        >
          {t(I18N_KEYS.nav.doctor)}
        </Link>
        <Link
          to="/settings"
          className={styles.wordmarkNav}
          aria-current={onSettings ? "page" : undefined}
          data-testid="wordmark-settings"
        >
          {t(I18N_KEYS.nav.settings)}
        </Link>
        <Link
          to="/plugins"
          className={styles.wordmarkNav}
          aria-current={onPlugins ? "page" : undefined}
          data-testid="wordmark-plugins"
        >
          {t(I18N_KEYS.nav.plugins)}
        </Link>
      </header>

      <LanguageSwitcher />

      <ActivationBanner />

      <main className={styles.main}>{children}</main>
      <ExecutionPanel />
    </div>
  );
}
