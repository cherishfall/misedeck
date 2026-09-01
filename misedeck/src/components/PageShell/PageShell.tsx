// PageShell — app chrome: collapsible sidebar, directory indicator,
// activation banner, execution panel. Replaces the top wordmark nav from
// issue #38, per docs/design/product-logic.md.

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";

import { ActivationBanner } from "../ActivationBanner/ActivationBanner";
import { DirectoryIndicator } from "../DirectoryIndicator/DirectoryIndicator";
import { ExecutionPanel, ExecutionPanelAffordance, useExecutionContext } from "../ExecutionPanel";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import { ThemeSwitcher } from "../ThemeSwitcher/ThemeSwitcher";

import styles from "./PageShell.module.css";

const SIDEBAR_COLLAPSED_KEY = "misedeck.sidebarCollapsed.v1";

/** Pages that carry no mutating actions and therefore start without the
 *  execution panel visible. Preview is read-only apart from its trust
 *  action; when trust runs the panel opens on demand like any mutation. */
const READ_ONLY_PATHS = ["/doctor", "/plugins", "/preview"];

function isReadOnlyPath(path: string): boolean {
  return READ_ONLY_PATHS.some((p) => path === p);
}

interface PageShellProps {
  children: ReactNode;
}

function loadCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

function persistCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // ignore
  }
}

export function PageShell({ children }: PageShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => loadCollapsed());
  const { state: execState, dismiss } = useExecutionContext();

  useEffect(() => {
    persistCollapsed(collapsed);
  }, [collapsed]);

  // Read-only pages render without the panel. If the user navigates to one
  // while no command is running, hide the panel while preserving history so
  // the persistent affordance can still reopen it.
  useEffect(() => {
    if (isReadOnlyPath(location.pathname) && execState.status !== "running") {
      dismiss();
    }
  }, [location.pathname, execState.status, dismiss]);

  const nav = NAV_ITEMS.map((item) => (
    <NavItem
      key={item.path}
      path={item.path}
      label={t(item.labelKey)}
      glyph={item.glyph}
      active={location.pathname === item.path}
      collapsed={collapsed}
    />
  ));

  const bottomNav = BOTTOM_ITEMS.map((item) => (
    <NavItem
      key={item.path}
      path={item.path}
      label={t(item.labelKey)}
      glyph={item.glyph}
      active={location.pathname === item.path}
      collapsed={collapsed}
    />
  ));

  return (
    <div className={styles.shell}>
      <aside
        className={collapsed ? styles.sidebarCollapsed : styles.sidebar}
        aria-label={t(I18N_KEYS.nav.regionLabel)}
      >
        <div className={styles.sidebarTop}>
          <Link to="/" className={styles.brand} aria-label={t(I18N_KEYS.app.wordmark)}>
            <span className={styles.brandName}>{t(I18N_KEYS.app.wordmark)}</span>
            {!collapsed && (
              <span className={styles.brandTagline}>{t(I18N_KEYS.app.tagline)}</span>
            )}
          </Link>

          <nav className={styles.navGroup} aria-label={t(I18N_KEYS.nav.mainGroupLabel)}>
            {nav}
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          <nav className={styles.navGroup} aria-label={t(I18N_KEYS.nav.bottomGroupLabel)}>
            {bottomNav}
          </nav>

          <button
            type="button"
            className={styles.collapseToggle}
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t(I18N_KEYS.sidebar.expandLabel) : t(I18N_KEYS.sidebar.collapseLabel)}
            title={collapsed ? t(I18N_KEYS.sidebar.expandLabel) : t(I18N_KEYS.sidebar.collapseLabel)}
          >
            <span aria-hidden="true">{collapsed ? "▸" : "◂"}</span>
          </button>

          {!collapsed && (
            <div className={styles.footer}>
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          )}
        </div>
      </aside>

      <div className={styles.content}>
        <DirectoryIndicator />
        <ActivationBanner />
        <main className={styles.main}>{children}</main>
        <ExecutionPanelAffordance />
        <ExecutionPanel />
      </div>
    </div>
  );
}

interface NavItemProps {
  path: string;
  label: string;
  glyph: string;
  active: boolean;
  collapsed: boolean;
}

function NavItem({ path, label, glyph, active, collapsed }: NavItemProps) {
  return (
    <Link
      to={path}
      className={active ? styles.navItemActive : styles.navItem}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
    >
      <span className={styles.navGlyph} aria-hidden="true">
        {glyph}
      </span>
      {!collapsed && <span className={styles.navLabel}>{label}</span>}
    </Link>
  );
}

const NAV_ITEMS = [
  { path: "/preview", labelKey: I18N_KEYS.preview.nav, glyph: "P" },
  { path: "/tools", labelKey: I18N_KEYS.nav.tools, glyph: "T" },
  { path: "/env", labelKey: I18N_KEYS.nav.env, glyph: "E" },
  { path: "/tasks", labelKey: I18N_KEYS.nav.tasks, glyph: "K" },
  { path: "/plugins", labelKey: I18N_KEYS.nav.plugins, glyph: "X" },
];

const BOTTOM_ITEMS = [
  { path: "/doctor", labelKey: I18N_KEYS.nav.doctor, glyph: "D" },
  { path: "/settings", labelKey: I18N_KEYS.nav.settings, glyph: "S" },
];
