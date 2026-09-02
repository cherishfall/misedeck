// ToolsPage — the global tools list with mutations (issues #21 + #22).
//
//   * mise ls --json         → table rows (tool, version, requested,
//                              backend, source, latest, actions)
//   * mise outdated --json   → outdated badges on the rows that
//                              appear in the map
//   * mise use -g            → switch a tool's requested version
//   * mise install -g        → install a new tool/version
//   * mise uninstall -g      → remove an installed tool
//   * mise upgrade --bump    → upgrade all or one outdated tool
//
// Every mutation routes through the execution panel so the exact
// command and live logs are visible. The list refreshes when a run
// exits successfully; failures surface stderr and leave state
// unchanged.

import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { useTrustGuard } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import {
  useParsedOutdatedTools,
  useParsedToolsList,
} from "../../hooks/useToolsList";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  EmptyState,
  MiseMissingState,
  PageShell,
  Table,
  type TableColumn,
} from "../../components";
import { useExecutionContext } from "../../components/ExecutionPanel";
import type { ExecutionStatus } from "../../components/ExecutionPanel";

import styles from "./ToolsPage.module.css";

interface ToolRow {
  tool: string;
  version: string;
  requested: string;
  /**
   * Backend prefix derived from the tool's full `backend:name` form
   * (`npm:prettier` → `npm`), in original case. `undefined` when the
   * name carries no prefix — a bare name may be a core tool or an
   * installed plugin's shorthand, and mise does not say which, so no
   * honest value exists (issue #50).
   */
  backend?: string;
  source: string;
  /** True when this row appears in the outdated map. */
  outdated: boolean;
  /** The latest version from the outdated map (empty when up to date). */
  latest: string;
  /** Stable key. */
  id: string;
}

// ---------- Args builders (mirror the Rust helpers) ----------
//
// The Rust side defines `mise_install_argv`, `mise_uninstall_argv`,
// `mise_upgrade_argv`, and the existing `mise_use_argv` in pure form.
// The JS side duplicates the shape so the page is self-contained — the
// only Rust call is `useExecutionContext().run({cwd, args})`. Keep the
// two in lockstep with the Rust `tests/tool_mutations.rs` assertions.
//
// Only `mise use` accepts a `-g` flag; `install`, `uninstall`, and
// `upgrade` operate on the active directory context. The runner adds
// `-C <dir>` when cwd !== null, so the global context naturally targets
// the global config without extra flags for those three commands.

function miseInstallArgs(tool: string, version: string): string[] {
  return ["install", `${tool}@${version}`];
}

function miseUninstallArgs(tool: string): string[] {
  return ["uninstall", tool];
}

function miseUseArgs(tool: string, version: string, cwd: string | null): string[] {
  return cwd === null
    ? ["use", "-g", `${tool}@${version}`]
    : ["use", `${tool}@${version}`];
}

function miseUpgradeArgs(tool: string | undefined): string[] {
  return tool ? ["upgrade", "--bump", tool] : ["upgrade", "--bump"];
}

/**
 * Derive the backend badge from the tool's full `backend:name` form
 * (`npm:prettier` → `npm`, `vfox:mise-plugins/vfox-1password` →
 * `vfox`). Returns `undefined` for bare names: those may be core
 * tools or an installed plugin's shorthand, and `mise ls --json`
 * does not say which — a fabricated `core` would be worse than no
 * value (issue #50).
 */
function toolBackend(tool: string): string | undefined {
  const sep = tool.indexOf(":");
  return sep > 0 ? tool.slice(0, sep) : undefined;
}

// ---------- Page ----------

export function ToolsPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const { state: execState, run } = useExecutionContext();
  const guard = useTrustGuard();
  // The Plugins page registry rows hand a tool name over via
  // `?install=<tool>` (issue #51); the install form pre-fills it.
  const [searchParams] = useSearchParams();
  const prefillTool = searchParams.get("install") ?? "";

  // First check: is mise even available? If not, render the missing
  // state and don't even try the tools queries.
  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const tools = useParsedToolsList();
  const outdated = useParsedOutdatedTools();

  // After a successful mutation, the read queries become stale.
  // Observe the running → ok transition (the same transition the
  // env page and the trust action use) and invalidate the
  // dependent queries so the table refreshes.
  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
    }
  }, [execState.status, cwd, queryClient]);

  // The execution panel reducer is the single source of truth for
  // "is a mutation in flight". A single `running` flag feeds every
  // action button so the user can't fire two mutations at once.
  const isRunning = execState.status === "running";

  // Run a mutation. Every entry point checks the trust guard first;
  // on block, return without running. (Global context has no config
  // to trust, so the guard always allows, but the pattern is the
  // same one the config / tasks pages use.)
  const runMutation = useCallback(
    async (builder: (cwd: string | null) => string[]) => {
      if (!guard.allowed) return;
      if (isRunning) return;
      await run({ cwd, args: builder(cwd) });
    },
    [guard.allowed, isRunning, run, cwd],
  );

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
  };

  const onUpgradeAll = () => {
    void runMutation(() => miseUpgradeArgs(undefined));
  };

  const rows = useMemo<ToolRow[]>(() => {
    if (!tools.data) return [];
    const outdatedByTool = new Map<string, { latest: string }>();
    for (const item of outdated.data ?? []) {
      if (item.latest) outdatedByTool.set(item.name, { latest: item.latest });
    }
    const out: ToolRow[] = [];
    for (const { tool, items } of tools.data) {
      // Pick the active version when there is one; otherwise the
      // most recent installed version. mise orders its items with
      // the active row first when there is one.
      const active = items.find((it) => it.active) ?? items[0];
      if (!active) continue;
      const outdatedEntry = outdatedByTool.get(tool);
      out.push({
        id: `${tool}@${active.version}`,
        tool,
        version: active.version,
        requested: active.requestedVersion ?? "—",
        backend: toolBackend(tool),
        source: active.source?.path ?? (active.source?.type ?? "—"),
        outdated: outdatedEntry !== undefined,
        latest: outdatedEntry?.latest ?? "",
      });
    }
    return out;
  }, [tools.data, outdated.data]);

  // Mise-missing state.
  if (detect.isPending) {
    return <ToolsLoading />;
  }
  const detectValue = detect.data;
  if (detectValue && detectValue.kind === "err" && isAppError(detectValue.err)) {
    if (detectValue.err.code === "MISE_NOT_FOUND" || detectValue.err.code === "MISE_TOO_OLD") {
      return (
        <PageShell>
          <div className={styles.page}>
            <MiseMissingState />
          </div>
        </PageShell>
      );
    }
  }

  // Tools-error state (mise is up but the read failed).
  const toolsError = tools.error?.kind === "err" ? tools.error.err : null;

  // The backend column exists only when at least one row carries a
  // derivable backend (`backend:name` form). Rows without a derivable
  // backend render `—` (missing data), and when no row has one the
  // column is dropped entirely (issue #50).
  const backendColumn: TableColumn<ToolRow> = {
    key: "backend",
    header: t(I18N_KEYS.tools.columns.backend),
    cell: (r) =>
      r.backend !== undefined ? (
        <Badge variant="info">{r.backend}</Badge>
      ) : (
        <span className={styles.dim}>—</span>
      ),
  };
  const showBackend = rows.some((r) => r.backend !== undefined);

  const columns: TableColumn<ToolRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.tools.columns.tool),
      cell: (r) => (
        <span className={styles.cellTool}>
          <span className={styles.toolName} title={r.tool}>{r.tool}</span>
        </span>
      ),
    },
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      cell: (r) => (
        <span
          className={r.outdated ? styles.cellVersionOutdated : styles.cellVersion}
        >
          {r.version}
        </span>
      ),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      cell: (r) => <span className={styles.cellRequested}>{r.requested}</span>,
    },
    ...(showBackend ? [backendColumn] : []),
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      cell: (r) => <span className={styles.cellSource} title={r.source}>{r.source}</span>,
    },
    {
      key: "latest",
      header: t(I18N_KEYS.tools.columns.latest),
      cell: (r) =>
        r.outdated ? (
          <span className={styles.cellLatest}>
            <span className={styles.arrow} aria-hidden="true">▹</span>
            <span className={styles.latestValue}>{r.latest}</span>
            <Badge variant="warning">{t(I18N_KEYS.tools.outdatedBadge)}</Badge>
          </span>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "switchToVersion",
      header: t(I18N_KEYS.tools.columns.switchToVersion),
      cell: (r) => (
        <SwitchVersionCell
          row={r}
          disabled={isRunning}
          onSwitch={(version) =>
            void runMutation((cwd) => miseUseArgs(r.tool, version, cwd))
          }
        />
      ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      cell: (r) => (
        <RowActions
          row={r}
          disabled={isRunning}
          onUninstall={() =>
            void runMutation(() => miseUninstallArgs(r.tool))
          }
          onUpgrade={() =>
            void runMutation(() => miseUpgradeArgs(r.tool))
          }
        />
      ),
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.tools.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.tools.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.tools.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.tools.hint)}</p>
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {outdated.data != null &&
              (outdated.data.length > 0
                ? t(I18N_KEYS.tools.outdatedBadge) + ` (${outdated.data.length})`
                : t(I18N_KEYS.tools.noOutdated))}
          </span>
          <span className={styles.toolbarActions}>
            {/* Disabled when nothing is outdated; the reason sits next
                to the button (`tools.noOutdated`) and on its title. */}
            <Button
              variant="primary"
              size="sm"
              onClick={onUpgradeAll}
              disabled={isRunning || (outdated.data?.length ?? 0) === 0}
              title={
                outdated.data != null && outdated.data.length === 0
                  ? t(I18N_KEYS.tools.noOutdated)
                  : undefined
              }
              data-testid="tools-upgrade-all"
            >
              {t(I18N_KEYS.tools.actions.upgradeAll)}
            </Button>
            <button
              type="button"
              className={styles.refresh}
              onClick={onRefresh}
              disabled={tools.isPending || outdated.isPending}
              data-testid="tools-refresh"
            >
              {t(I18N_KEYS.tools.refresh)}
            </button>
          </span>
        </div>


        {toolsError && (
          <div className={styles.errorState}>
            <div className={styles.errorLabel}>{t(I18N_KEYS.tools.error.title)}</div>
            <p className={styles.errorBody}>{t(I18N_KEYS.tools.error.body)}</p>
            {toolsError.stderr && (
              <pre className={styles.errorStderr}>{toolsError.stderr}</pre>
            )}
          </div>
        )}

        {!toolsError && (
          <Table<ToolRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                eyebrow={t(I18N_KEYS.tools.eyebrow)}
                title={t(I18N_KEYS.tools.empty.title)}
                body={t(I18N_KEYS.tools.empty.body)}
              />
            }
          />
        )}

        <InstallToolForm
          prefillTool={prefillTool}
          onInstall={(tool, version) =>
            void runMutation(() => miseInstallArgs(tool, version))
          }
          disabled={isRunning}
        />
      </div>
    </PageShell>
  );
}

function ToolsLoading() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.loadingLabel}>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}

// ---------- Row actions ----------

interface SwitchVersionCellProps {
  row: ToolRow;
  disabled: boolean;
  onSwitch: (version: string) => void;
}

/**
 * The per-row "switch to version" editor: a narrow version input +
 * Save-style Switch button dispatching `mise use [-g] <tool>@<version>`.
 * Lives in its own labeled column so the header sits exactly over the
 * input (issue #57).
 */
function SwitchVersionCell({ row, disabled, onSwitch }: SwitchVersionCellProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(row.version);
  // Reset local state when the row's underlying version changes
  // (e.g. after a successful switch or a refetch).
  useEffect(() => {
    setVersion(row.version);
  }, [row.version]);
  const dirty = version !== row.version;

  return (
    <span className={styles.cellSwitch}>
      <input
        type="text"
        className={styles.input}
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder={t(I18N_KEYS.tools.installForm.versionPlaceholder)}
        disabled={disabled}
        data-testid={`tools-switch-version-${row.tool}`}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={() => onSwitch(version)}
        disabled={disabled || !dirty || version.length === 0}
        data-testid={`tools-switch-${row.tool}`}
      >
        {t(I18N_KEYS.tools.actions.switch)}
      </Button>
    </span>
  );
}

interface RowActionsProps {
  row: ToolRow;
  disabled: boolean;
  onUninstall: () => void;
  onUpgrade: () => void;
}

/**
 * The mutation buttons for one tool row. An outdated row gets an
 * Upgrade button (`mise upgrade --bump <tool>`); Uninstall dispatches
 * `mise uninstall <tool>`. Version switching lives in its own column
 * (SwitchVersionCell, issue #57).
 */
function RowActions({
  row,
  disabled,
  onUninstall,
  onUpgrade,
}: RowActionsProps) {
  const { t } = useTranslation();
  return (
    <span className={styles.cellActions}>
      {row.outdated && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onUpgrade}
          disabled={disabled}
          data-testid={`tools-upgrade-${row.tool}`}
        >
          {t(I18N_KEYS.tools.actions.upgrade)}
        </Button>
      )}
      <Button
        variant="danger"
        size="sm"
        onClick={onUninstall}
        disabled={disabled}
        data-testid={`tools-uninstall-${row.tool}`}
      >
        {t(I18N_KEYS.tools.actions.uninstall)}
      </Button>
    </span>
  );
}

// ---------- Install form ----------

interface InstallToolFormProps {
  /** Tool name handed over by another page (the Plugins page registry
   *  "Install…" action, issue #51). Pre-fills the tool input. */
  prefillTool: string;
  onInstall: (tool: string, version: string) => void;
  disabled: boolean;
}

/**
 * The "install a new tool" form at the bottom of the page. The user
 * types a tool name and version; Install dispatches
 * `mise install -g <tool>@<version>` through the execution panel.
 */
function InstallToolForm({ prefillTool, onInstall, disabled }: InstallToolFormProps) {
  const { t } = useTranslation();
  const [tool, setTool] = useState(prefillTool);
  const [version, setVersion] = useState("");
  // Sync the pre-fill when a new `?install=` handover arrives (the
  // Tools page stays mounted, so initial state alone is not enough).
  useEffect(() => {
    if (prefillTool.length > 0) setTool(prefillTool);
  }, [prefillTool]);
  const onSubmit = () => {
    onInstall(tool, version);
  };
  return (
    <div className={styles.installForm} data-testid="tools-install-form">
      <h2 className={styles.installFormTitle}>
        {t(I18N_KEYS.tools.installForm.title)}
      </h2>
      <span className={styles.installFormRow}>
        <input
          type="text"
          className={styles.input}
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          placeholder={t(I18N_KEYS.tools.installForm.toolPlaceholder)}
          disabled={disabled}
          data-testid="tools-install-tool"
          spellCheck={false}
          autoComplete="off"
        />
        <input
          type="text"
          className={styles.input}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={t(I18N_KEYS.tools.installForm.versionPlaceholder)}
          disabled={disabled}
          data-testid="tools-install-version"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={disabled || tool.length === 0 || version.length === 0}
          data-testid="tools-install-button"
        >
          {t(I18N_KEYS.tools.actions.install)}
        </Button>
      </span>
    </div>
  );
}
