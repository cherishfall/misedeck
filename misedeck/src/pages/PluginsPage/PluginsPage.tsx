// PluginsPage — the plugins surface matching its sidebar name
// (issues #29 + #51):
//
//   * mise plugins ls --urls  → installed plugins (name, source), top
//   * mise registry --json    → browsable registry of tool shorthands
//                               → backends, with a search filter
//
// The page itself is read-only; the registry row's "Install…" action
// hands the tool name to the Tools page install section, where the
// mutation runs through the execution panel.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import { Badge, Button, EmptyState, PageShell, Table, type TableColumn } from "../../components";
import { useParsedPluginsList, useParsedRegistry } from "../../hooks/useIssue29";
import type { InstalledPlugin, RegistryItem } from "../../types/tauri";

import styles from "./PluginsPage.module.css";

export function PluginsPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const plugins = useParsedPluginsList();
  const registry = useParsedRegistry();

  const pluginsError = plugins.error?.kind === "err" ? plugins.error.err : null;
  const registryError = registry.error?.kind === "err" ? registry.error.err : null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!registry.data) return [];
    if (q.length === 0) return registry.data;
    return registry.data.filter((r) => {
      if (r.short.toLowerCase().includes(q)) return true;
      if (r.description?.toLowerCase().includes(q)) return true;
      if (r.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
      return r.backends.some((b) => b.toLowerCase().includes(q));
    });
  }, [registry.data, query]);

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["plugins", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["registry", cwd] });
  };

  // Hand the registry shorthand to the Tools page install section;
  // the actual `mise install` runs there through the execution panel.
  const onInstall = (short: string) => {
    navigate(`/tools?install=${encodeURIComponent(short)}`);
  };

  const installedColumns: TableColumn<InstalledPlugin>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.plugins.columns.name),
      cell: (p) => <span className={styles.cellTool}>{p.name}</span>,
    },
    {
      key: "source",
      header: t(I18N_KEYS.plugins.columns.source),
      cell: (p) =>
        p.source !== undefined ? (
          <span className={styles.cellSource} title={p.source}>{p.source}</span>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
  ];

  const registryColumns: TableColumn<RegistryItem>[] = [
    {
      key: "short",
      header: t(I18N_KEYS.plugins.columns.tool),
      cell: (r) => <span className={styles.cellTool}>{r.short}</span>,
    },
    {
      key: "backends",
      header: t(I18N_KEYS.plugins.columns.backends),
      cell: (r) => (
        <span className={styles.cellBackends}>
          {r.backends.map((b, i) => (
            <Badge key={`${b}-${i}`} variant="info">
              {b}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "description",
      header: t(I18N_KEYS.plugins.columns.description),
      cell: (r) => <span className={styles.cellDescription}>{r.description ?? "—"}</span>,
    },
    {
      key: "aliases",
      header: t(I18N_KEYS.plugins.columns.aliases),
      cell: (r) =>
        r.aliases && r.aliases.length > 0 ? (
          <span className={styles.cellAliases}>
            {r.aliases.map((a, i) => (
              <span key={`${a}-${i}`} className={styles.aliasTag}>{a}</span>
            ))}
          </span>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.plugins.columns.actions),
      cell: (r) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onInstall(r.short)}
          data-testid={`plugins-install-${r.short}`}
        >
          {t(I18N_KEYS.plugins.actions.install)}
        </Button>
      ),
    },
  ];

  if (detect.isPending) {
    return <PluginsLoading />;
  }
  const detectValue = detect.data;
  if (detectValue && detectValue.kind === "err" && isAppError(detectValue.err)) {
    if (detectValue.err.code === "MISE_NOT_FOUND" || detectValue.err.code === "MISE_TOO_OLD") {
      return (
        <PageShell>
          <div className={styles.page}>
            <EmptyState
              eyebrow={t(I18N_KEYS.states.notInstalled.title)}
              title={t(I18N_KEYS.tools.missing.title)}
              body={t(I18N_KEYS.tools.missing.body)}
            />
          </div>
        </PageShell>
      );
    }
  }

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.plugins.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.plugins.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.plugins.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.plugins.hint)}</p>
        </header>

        <section className={styles.section} data-testid="plugins-installed-section">
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.plugins.sections.installed)}</h2>
          </header>
          {plugins.isPending && (
            <div className={styles.muted}>{t(I18N_KEYS.common.loading)}</div>
          )}
          {!plugins.isPending && pluginsError && (
            <div className={styles.errorState} data-testid="plugins-installed-error">
              <div className={styles.errorLabel}>{t(I18N_KEYS.plugins.installedError.title)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.plugins.installedError.body)}</p>
              {pluginsError.stderr && (
                <pre className={styles.errorStderr}>{pluginsError.stderr}</pre>
              )}
            </div>
          )}
          {!plugins.isPending && !pluginsError && (
            <Table<InstalledPlugin>
              columns={installedColumns}
              rows={plugins.data ?? []}
              rowKey={(p) => p.name}
              empty={
                <EmptyState
                  eyebrow={t(I18N_KEYS.plugins.eyebrow)}
                  title={t(I18N_KEYS.plugins.installedEmpty.title)}
                  body={t(I18N_KEYS.plugins.installedEmpty.body)}
                />
              }
            />
          )}
        </section>

        <section className={styles.section} data-testid="plugins-registry-section">
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.plugins.sections.registry)}</h2>
          </header>

          <div className={styles.toolbar}>
            <input
              type="text"
              className={styles.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(I18N_KEYS.plugins.searchPlaceholder)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className={styles.refresh}
              onClick={onRefresh}
              disabled={registry.isPending || plugins.isPending}
              data-testid="plugins-refresh"
            >
              {t(I18N_KEYS.common.refresh)}
            </button>
          </div>

          {registryError && (
            <div className={styles.errorState} data-testid="plugins-read-error">
              <div className={styles.errorLabel}>{t(I18N_KEYS.plugins.error.title)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.plugins.error.body)}</p>
              {registryError.stderr && (
                <pre className={styles.errorStderr}>{registryError.stderr}</pre>
              )}
            </div>
          )}

          {!registryError && (
            <Table<RegistryItem>
              columns={registryColumns}
              rows={rows}
              rowKey={(r) => r.short}
              empty={
                <EmptyState
                  eyebrow={t(I18N_KEYS.plugins.eyebrow)}
                  title={query.trim().length > 0 ? t(I18N_KEYS.plugins.empty.searchTitle) : t(I18N_KEYS.plugins.empty.title)}
                  body={query.trim().length > 0 ? t(I18N_KEYS.plugins.empty.searchBody) : t(I18N_KEYS.plugins.empty.body)}
                />
              }
            />
          )}
        </section>
      </div>
    </PageShell>
  );
}

function PluginsLoading() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.dot} aria-hidden="true" />
          <span>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}
