// PluginsPage — installed-plugin management (issues #29 + #51 + #112)
// plus the custom-plugin install entry (issue #164, beta11 Q6①); the
// registry table left with #136 — its browse-and-install role is
// superseded by the Tools page's top search (#134).
//
//   * mise plugins install <name> <git-url>  → the install form below;
//                                              custom plugins (the
//                                              asdf-ecosystem standard)
//                                              had zero GUI coverage
//   * mise plugins ls --urls  → installed plugins (name, source)
//   * mise plugins uninstall  → installed row action; confirms first,
//                               then runs through the execution panel
//                               (issue #112)

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import { useOwnRun } from "../../components/ExecutionPanel";
import {
  Button,
  commandEcho,
  CommandHint,
  ConfirmDialog,
  EmptyState,
  KeyForm,
  ListLoading,
  PageShell,
  SuccessBar,
  Table,
  type TableColumn,
  Tooltip,
  useRegisterPageRefresh,
} from "../../components";
import { useParsedPluginsList } from "../../hooks/useIssue29";
import type { InstalledPlugin } from "../../types/tauri";
import { readErrorBody } from "../../utils/readErrorBody";

import tableStyles from "../../components/Table/Table.module.css";
import styles from "./PluginsPage.module.css";

// ---------- Args builders ----------

function misePluginsInstallArgs(name: string, gitUrl: string): string[] {
  return ["plugins", "install", name, gitUrl];
}

function misePluginsUninstallArgs(name: string): string[] {
  return ["plugins", "uninstall", name];
}

export function PluginsPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: () => detectMise(),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const plugins = useParsedPluginsList();

  // Plugin install (issue #164, beta11 Q6①): a custom plugin is a name
  // plus a git URL; the run goes through the execution panel like every
  // other mise invocation (ADR-0005). Plugins are global mise state —
  // the directory trust guard does not apply, unlike the tasks /
  // settings pages that write the cwd's config file (same reasoning as
  // the uninstall below).
  //
  // Both hooks are destructured into their stable pieces (#258): the
  // `isRunning` boolean and the stable `run` callback can be named in a
  // dependency list (exhaustive-deps), unlike the fresh object the hook
  // returns each render.
  const { run: runInstall, isRunning: installBusy } = useOwnRun();

  // Plugin uninstall (issue #112): a destructive mutation, so it
  // confirms first (the dialog teaches the exact command) and then
  // runs through the execution panel.
  const { run: runUninstall, isRunning: uninstallBusy } = useOwnRun();
  const [pendingUninstall, setPendingUninstall] = useState<string | null>(null);

  // In-page success confirmation (issue #145): a successful install /
  // uninstall closes the loop here with a short-lived bar; failures are
  // unchanged — the panel still auto-opens.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTick, setSuccessTick] = useState(0);

  const installPlugin = useCallback(
    async (name: string, gitUrl: string): Promise<"ok" | "err"> => {
      if (installBusy) return "err";
      const res = await runInstall({ cwd, args: misePluginsInstallArgs(name, gitUrl) });
      if (res.kind === "ok") {
        void queryClient.invalidateQueries({ queryKey: ["plugins", "ls", cwd] });
        setSuccessMessage(t(I18N_KEYS.plugins.success.installed, { name }));
        setSuccessTick((n) => n + 1);
        return "ok";
      }
      return "err";
    },
    [installBusy, runInstall, cwd, queryClient, t],
  );

  // Per-action run-lock (issue #138): each hook's in-flight flag is true
  // only while the command *it* dispatched is running, so an install
  // never locks the uninstall buttons and vice versa. The read query
  // refreshes on each run's own success.
  const uninstallPlugin = useCallback(
    async (name: string) => {
      if (uninstallBusy) return;
      const res = await runUninstall({ cwd, args: misePluginsUninstallArgs(name) });
      if (res.kind === "ok") {
        void queryClient.invalidateQueries({ queryKey: ["plugins", "ls", cwd] });
        setSuccessMessage(t(I18N_KEYS.plugins.success.uninstalled, { name }));
        setSuccessTick((n) => n + 1);
      }
    },
    [uninstallBusy, runUninstall, cwd, queryClient, t],
  );

  // Top-toolbar refresh (issue #98): one callback refreshes the
  // installed list.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["plugins", "ls", cwd] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  // Mise-missing or list-loading state. The list-level gate (issue
  // #146) renders the shared ListLoading for both the detect probe and
  // the `plugins ls` read — the hand-rolled page copy with its own dot
  // was beta11 4.5-m2 residue (issue #164).
  if (detect.isPending || plugins.isPending) {
    return (
      <ListLoading
        title={t(I18N_KEYS.plugins.title)}
        commandHint={t(I18N_KEYS.plugins.commandHint)}
      />
    );
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

  const pluginsError = plugins.error?.kind === "err" ? plugins.error.err : null;

  const installedColumns: TableColumn<InstalledPlugin>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.plugins.columns.name),
      // Widths (issue #275): the table is now fixed-layout, so every
      // declared column holds its width and the Source column takes the
      // remainder. The floor below 900×600 keeps the page free of a
      // horizontal scroller.
      width: "150px",
      minWidth: "110px",
      sortValue: (p) => p.name,
      cell: (p) => (
        <Tooltip text={p.name}>
          <span className={styles.cellTool}>{p.name}</span>
        </Tooltip>
      ),
    },
    {
      key: "source",
      header: t(I18N_KEYS.plugins.columns.source),
      sortValue: (p) => p.source ?? "",
      // The flex column: no declared width, so it absorbs the leftover
      // space and ellipsizes the URL head (tooltip carries the full URL).
      cell: (p) =>
        p.source !== undefined ? (
          <Tooltip text={p.source}><span className={styles.cellSource}>{p.source}</span></Tooltip>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "refCommit",
      header: t(I18N_KEYS.plugins.columns.refCommit),
      // 180px (issue #275): the short sha is fixed-width, so the ref
      // needs the rest to stay readable — a branch/tag longer than
      // "HEAD" ellipsizes its tail behind the tooltip.
      width: "180px",
      minWidth: "140px",
      sortValue: (p) => [p.ref, p.sha].filter(Boolean).join(" "),
      // A plugin's checkout identity (issue #275): the ref mise tracked
      // and the short commit it resolved to. Both come verbatim from
      // `plugins ls --urls`; a plugin with no git data renders the
      // standard dim dash instead of inventing HEAD or a hash.
      cell: (p) => {
        if (p.ref === undefined && p.sha === undefined) {
          return <span className={styles.dim}>—</span>;
        }
        return (
          <Tooltip text={[p.ref, p.sha].filter(Boolean).join(" ")}>
            <span className={styles.refCommitCell}>
              {p.ref !== undefined && (
                <span className={styles.refCommitRef}>{p.ref}</span>
              )}
              {p.sha !== undefined && (
                <span className={styles.refCommitSha}>{p.sha}</span>
              )}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "actions",
      header: t(I18N_KEYS.plugins.columns.actions),
      width: "120px",
      minWidth: "110px",
      cell: (p) => (
        <Button
          variant="danger"
          size="sm"
          className={tableStyles.cellButton}
          onClick={() => setPendingUninstall(p.name)}
          data-testid={`plugins-uninstall-${p.name}`}
        >
          {t(I18N_KEYS.plugins.actions.uninstall)}
        </Button>
      ),
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.plugins.title)}</h1>
          <CommandHint>{t(I18N_KEYS.plugins.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(I18N_KEYS.plugins.hint)}</p>
        </header>

        {/* In-page success confirmation (issue #145): set by a
            successful install / uninstall below, auto-dismisses after
            a few seconds. Null renders nothing. */}
        <SuccessBar
          message={successMessage}
          tick={successTick}
          onDismiss={() => setSuccessMessage(null)}
        />

        {/* Custom-plugin install entry (issue #164): name + git URL.
            Sits above the installed list — for the majority of users
            the empty state below is the norm, and the form is the
            page's way forward alongside the Tools search. */}
        <InstallPluginForm
          onInstall={installPlugin}
          disabled={installBusy}
          cwd={cwd}
        />

        <section className={styles.section} data-testid="plugins-installed-section">
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.plugins.sections.installed)}</h2>
          </header>
          {pluginsError && (
            <div className={styles.errorState} data-testid="plugins-installed-error">
              <div className={styles.errorLabel}>{t(I18N_KEYS.plugins.installedError.title)}</div>
              <p className={styles.errorBody}>
                {readErrorBody(
                  pluginsError,
                  t,
                  I18N_KEYS.plugins.installedError.body,
                  I18N_KEYS.plugins.installedError.bodyNoStderr,
                )}
              </p>
              {pluginsError.stderr && (
                <pre className={styles.errorStderr}>{pluginsError.stderr}</pre>
              )}
            </div>
          )}
          {!pluginsError && (
            <Table<InstalledPlugin>
              columns={installedColumns}
              rows={plugins.data ?? []}
              rowKey={(p) => p.name}
              fixed
              className={styles.pluginsTable}
              empty={
                <EmptyState
                  title={t(I18N_KEYS.plugins.installedEmpty.title)}
                  body={t(I18N_KEYS.plugins.installedEmpty.body)}
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate("/tools")}
                      data-testid="plugins-empty-search-tools"
                    >
                      {t(I18N_KEYS.plugins.installedEmpty.action)}
                    </Button>
                  }
                />
              }
            />
          )}
        </section>

        <ConfirmDialog
          open={pendingUninstall !== null}
          confirmBusy={uninstallBusy}
          cwd={cwd}
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

// ---------- Install form ----------

/** The "Install plugin" form (issue #164, beta11 Q6①). A custom plugin
 *  is a name plus a git URL — the asdf-ecosystem standard, previously
 *  reachable only from the CLI. The submit runs `mise plugins install`
 *  through the execution panel, which echoes the exact argv. */
function InstallPluginForm({
  onInstall,
  disabled,
  cwd,
}: {
  onInstall: (name: string, gitUrl: string) => Promise<"ok" | "err">;
  /** True while this form's own install is in flight; locks only the
   *  submit (run-locking, issue #135/#138) — drafting the inputs never
   *  locks. */
  disabled: boolean;
  /** Active directory context, echoed in the live command preview. */
  cwd: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");

  const trimmedName = name.trim();
  const trimmedUrl = gitUrl.trim();
  const canSubmit = trimmedName.length > 0 && trimmedUrl.length > 0 && !disabled;

  const onSubmit = () => {
    if (!canSubmit) return;
    void (async () => {
      // The draft clears only when the run resolves ok (issue #163) —
      // a failed install keeps what the user typed.
      const outcome = await onInstall(trimmedName, trimmedUrl);
      if (outcome === "ok") {
        setName("");
        setGitUrl("");
      }
    })();
  };
  // Escape clears the draft (issue #109).
  const onRevert = () => {
    setName("");
    setGitUrl("");
  };

  return (
    <section className={styles.installForm} data-testid="plugins-install-form">
      <h2 className={styles.installFormTitle}>{t(I18N_KEYS.plugins.installForm.title)}</h2>
      <p className={styles.formNote}>{t(I18N_KEYS.plugins.installForm.explanation)}</p>
      <KeyForm
        className={styles.installFormRow}
        onSubmit={onSubmit}
        onRevert={onRevert}
        submitDisabled={!canSubmit}
      >
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(I18N_KEYS.plugins.installForm.namePlaceholder)}
          data-testid="plugins-install-name"
          spellCheck={false}
          autoComplete="off"
        />
        <input
          type="text"
          className={styles.input}
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          placeholder={t(I18N_KEYS.plugins.installForm.urlPlaceholder)}
          data-testid="plugins-install-url"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={!canSubmit}
          data-testid="plugins-install-button"
        >
          {t(I18N_KEYS.plugins.actions.install)}
        </Button>
      </KeyForm>
      {/* Live command preview: the exact argv the panel will run and
          echo, so the form teaches the CLI before the submit (the
          teaching rule; the uninstall echo lives in its confirm
          dialog). Renders only once both fields carry values. */}
      {trimmedName.length > 0 && trimmedUrl.length > 0 && (
        <p className={styles.commandPreview} data-testid="plugins-install-preview">
          {commandEcho("mise", cwd, misePluginsInstallArgs(trimmedName, trimmedUrl))}
        </p>
      )}
    </section>
  );
}
