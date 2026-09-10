// PluginsPage — installed-plugin management (issues #29 + #51 + #112);
// the registry table left with #136 — its browse-and-install role is
// superseded by the Tools page's top search (#134).
//
//   * mise plugins ls --urls  → installed plugins (name, source)
//   * mise plugins uninstall  → installed row action; confirms first,
//                               then runs through the execution panel
//                               (issue #112)

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import { useExecutionContext } from "../../components/ExecutionPanel";
import type { ExecutionStatus } from "../../components/ExecutionPanel";
import {
  Button,
  commandEcho,
  CommandHint,
  ConfirmDialog,
  EmptyState,
  PageShell,
  Table,
  type TableColumn,
  Tooltip,
  useRegisterPageRefresh,
} from "../../components";
import { useParsedPluginsList } from "../../hooks/useIssue29";
import type { InstalledPlugin } from "../../types/tauri";

import styles from "./PluginsPage.module.css";

// ---------- Args builders ----------

function misePluginsUninstallArgs(name: string): string[] {
  return ["plugins", "uninstall", name];
}

export function PluginsPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const plugins = useParsedPluginsList();

  // Plugin uninstall (issue #112): a destructive mutation, so it
  // confirms first (the dialog teaches the exact command) and then
  // runs through the execution panel. Plugins are global mise state
  // — the directory trust guard does not apply, unlike the tasks /
  // settings pages that write the cwd's config file.
  const { state: execState, run } = useExecutionContext();
  const isRunning = execState.status === "running";
  const [pendingUninstall, setPendingUninstall] = useState<string | null>(null);

  // After a successful uninstall the read query is stale; observe the
  // running → ok transition (same pattern as tools/tasks) and
  // invalidate the installed list.
  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["plugins", "ls", cwd] });
    }
  }, [execState.status, cwd, queryClient]);

  const uninstallPlugin = useCallback(
    async (name: string) => {
      if (isRunning) return;
      await run({ cwd, args: misePluginsUninstallArgs(name) });
    },
    [isRunning, run, cwd],
  );

  const pluginsError = plugins.error?.kind === "err" ? plugins.error.err : null;

  // Top-toolbar refresh (issue #98): one callback refreshes the
  // installed list.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["plugins", "ls", cwd] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  const installedColumns: TableColumn<InstalledPlugin>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.plugins.columns.name),
      sortValue: (p) => p.name,
      cell: (p) => <span className={styles.cellTool}>{p.name}</span>,
    },
    {
      key: "source",
      header: t(I18N_KEYS.plugins.columns.source),
      sortValue: (p) => p.source ?? "",
      cell: (p) =>
        p.source !== undefined ? (
          <Tooltip text={p.source}><span className={styles.cellSource}>{p.source}</span></Tooltip>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.plugins.columns.actions),
      cell: (p) => (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setPendingUninstall(p.name)}
          disabled={isRunning}
          data-testid={`plugins-uninstall-${p.name}`}
        >
          {t(I18N_KEYS.plugins.actions.uninstall)}
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
          <h1 className={styles.title}>{t(I18N_KEYS.plugins.title)}</h1>
          <CommandHint>{t(I18N_KEYS.plugins.commandHint)}</CommandHint>
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
                <EmptyState                  title={t(I18N_KEYS.plugins.installedEmpty.title)}
                  body={t(I18N_KEYS.plugins.installedEmpty.body)}
                />
              }
            />
          )}
        </section>

        <ConfirmDialog
          open={pendingUninstall !== null}
          title={
            pendingUninstall
              ? t(I18N_KEYS.plugins.confirm.uninstall.title, { name: pendingUninstall })
              : ""
          }
          body={t(I18N_KEYS.plugins.confirm.uninstall.body)}
          command={
            pendingUninstall
              ? commandEcho("mise", cwd, misePluginsUninstallArgs(pendingUninstall))
              : ""
          }
          confirmLabel={t(I18N_KEYS.plugins.actions.uninstall)}
          cancelLabel={t(I18N_KEYS.common.cancel)}
          onConfirm={() => {
            const name = pendingUninstall;
            setPendingUninstall(null);
            if (name) void uninstallPlugin(name);
          }}
          onCancel={() => setPendingUninstall(null)}
        />
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
