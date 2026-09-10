// ToolsPage — the global tools list with mutations (issues #21 + #22).
//
//   * mise registry --json   → the top add-tool entry's search
//                              autocomplete (tool names + descriptions,
//                              issue #134)
//   * mise ls --json         → table rows (tool, version, requested,
//                              backend, source, latest, actions)
//   * mise outdated --json   → the Latest column's current → latest
//                              path on the rows that appear in the map
//   * mise use -g            → the add-tool entry's one-step install +
//                              activate (#134), and switching an installed
//                              version (dropdown, #132)
//   * mise install           → install only a version (version center)
//   * mise unuse             → remove a tool (config request + installs);
//                              orphans run `mise uninstall --all` (ADR-0008)
//   * mise uninstall         → delete one non-active version's files
//   * mise upgrade --bump    → upgrade all or one outdated tool
//   * mise ls-remote --json  → the expanded row's available-versions
//                              sub-list (version center, #133)
//
// The add-tool entry sits at the top of the page (#134): search the
// registry, pick a version (default `latest`), and Use runs
// `mise use <tool>@<version>` — install and activate in one step; on
// success the new tool's row expands. Clicking a tool name expands its
// row inline into the version center (installed + available versions,
// one row at a time, #133). Every invocation — mutations and reads
// alike — routes through the execution panel so the exact command and
// live logs are visible (ADR-0005). The list refreshes when a run exits
// successfully; failures surface stderr and leave state unchanged.

import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { I18N_KEYS } from "../../i18n/keys";
import type { MiseLsItem, RegistryItem } from "../../types/tauri";
import { useDirectory } from "../../state/directoryContext";
import { useTrustGuard } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  useParsedOutdatedTools,
  useParsedToolsList,
} from "../../hooks/useToolsList";
import { useParsedRegistry } from "../../hooks/useIssue29";
import { useTableFilter } from "../../hooks/useTableFilter";
import { VersionCenter } from "./VersionCenter";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  CommandHint,
  ConfirmDialog,
  EmptyState,
  KeyForm,
  MiseMissingState,
  OutdatedHint,
  PageShell,
  Table,
  type TableColumn,
  TableFilter,
  Tooltip,
  useRegisterPageRefresh,
} from "../../components";
import {
  commandEcho,
  useExecutionContext,
} from "../../components/ExecutionPanel";
import type { ExecutionStatus } from "../../components/ExecutionPanel";
import { FloatingMenu } from "../../components/FloatingMenu";

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
  /** True when no Config file requests this tool (an orphan
   *  installation, e.g. from a manual CLI `mise install`) — its Unuse
   *  action runs `mise uninstall --all` instead of `mise unuse`
   *  (ADR-0008). */
  orphan: boolean;
  /** Stable key. */
  id: string;
}

/** The pending removal behind the confirmation dialog (ADR-0008, issue
 *  #131). `unuse` is the tool-level removal: it runs `mise unuse <tool>`,
 *  or `mise uninstall --all <tool>` when the tool is an orphan (no Config
 *  file requests it — `unuse` would error). `uninstall` is the
 *  per-version file deletion offered only on non-active versions; the
 *  expanded row's version center (issue #133) supplies its tool name. */
type PendingRemoval =
  | { kind: "unuse"; tool: string; orphan: boolean }
  | { kind: "uninstall"; tool: string; version: string };

// ---------- Args builders (mirror the Rust helpers) ----------
//
// The Rust side defines `mise_install_argv`, `mise_uninstall_argv`,
// `mise_unuse_argv`, `mise_uninstall_all_argv`, `mise_upgrade_argv`,
// and the existing `mise_use_argv` in pure form.
// The JS side duplicates the shape so the page is self-contained — the
// only Rust call is `useExecutionContext().run({cwd, args})`. Keep the
// two in lockstep with the Rust `tests/tool_mutations.rs` assertions.
//
// Only `mise use` accepts a `-g` flag; `install`, `uninstall`,
// `unuse`, and `upgrade` operate on the active directory context. The runner adds
// `-C <dir>` when cwd !== null, so the global context naturally targets
// the global config without extra flags for those three commands.

function miseInstallArgs(tool: string, version: string): string[] {
  // An empty version means latest (issue #111): `mise install <tool>`.
  return version.length > 0
    ? ["install", `${tool}@${version}`]
    : ["install", tool];
}

function miseUninstallArgs(tool: string, version: string): string[] {
  // Target the exact row's version (issue #56): the confirmation teaches
  // the command `mise uninstall <tool>@<version>`, so the dispatched
  // command must match what is shown.
  return ["uninstall", `${tool}@${version}`];
}

// Tool-level removal (ADR-0008, issue #131): `mise unuse <tool>` drops
// the tool from the Config file and prunes its installations. Orphan
// installations (no Config file requests the tool) have no request for
// `unuse` to remove, so the same action runs `mise uninstall --all
// <tool>` instead — the confirmation dialog shows the exact argv either
// way.
function miseUnuseArgs(tool: string, orphan: boolean): string[] {
  return orphan ? ["uninstall", "--all", tool] : ["unuse", tool];
}

/**
 * Build the argv for `mise link <tool>@<version> <path>` (issue #71).
 * Mirrors `mise_link_argv` on the Rust side; the two must stay in
 * lockstep with the `tests/tool_mutations.rs` assertions. The argument
 * order is `<tool>@<version>` first, then the local `<path>` — not
 * path-first. `--force` is never sent; on a conflict the panel's stderr
 * drives a friendly hint instead of force-overwriting.
 */
function miseLinkArgs(tool: string, version: string, path: string): string[] {
  return ["link", `${tool}@${version}`, path];
}

function miseUseArgs(tool: string, version: string, cwd: string | null): string[] {
  return cwd === null
    ? ["use", "-g", `${tool}@${version}`]
    : ["use", `${tool}@${version}`];
}

function miseUpgradeArgs(tool: string): string[] {
  return ["upgrade", "--bump", tool];
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

  // The removal confirmation (issues #56 + #131): clicking 卸载 / Unuse
  // or 删除此版本 / Uninstall opens a dialog showing the exact command
  // that will run; the mutation only dispatches after the user confirms.
  // No removal runs without this confirmation. The expanded row's
  // version center (issue #133) feeds the same dialog with its own
  // version targets.
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  // The expanded row's tool (issue #133): one row at a time. Expanding
  // is blocked while a foreground command runs (collapsing is always
  // allowed) so a mutation can't swap the list out from under the
  // center's actions.
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // The tool the top add-tool entry just submitted (issue #134): when
  // its `mise use` run succeeds, the refreshed table expands that
  // tool's row so the user sees it active.
  const [pendingAddedTool, setPendingAddedTool] = useState<string | null>(null);

  // Friendly message from the most recent link run (issue #71). Null
  // unless the last `mise link` failed with a recognized conflict.
  const [linkConflict, setLinkConflict] = useState<string | null>(null);

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

  // The version center's reads are directory-scoped with no fetcher of
  // their own (ADR-0005), so switching the directory context cannot
  // silently refetch them. Collapse the expanded row instead of leaving
  // a center showing the previous context's cache key.
  useEffect(() => {
    setExpandedTool(null);
  }, [cwd]);

  // Clicking a tool name toggles the row's inline version center
  // (issue #133). Expanding while a foreground command runs is blocked —
  // a no-op-looking click reads as broken, so the trigger disables
  // instead (see the tool column).
  const onToggleExpand = (tool: string) => {
    setExpandedTool((current) => (current === tool ? null : tool));
  };

  // After a successful mutation, the read queries become stale.
  // Observe the running → ok transition (the same transition the
  // env page and the trust action use) and invalidate the
  // dependent queries so the table refreshes. The version center's
  // installed sub-list derives from this same read, and its remote
  // sub-list's installed markers are computed from it, so the single
  // invalidation refreshes everything except the remote list itself
  // (which a mutation does not change). A successful add-tool `mise use`
  // (issue #134) also expands the new tool's row once the table
  // refreshes; a failed or cancelled run drops the pending expansion.
  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
      if (pendingAddedTool !== null) {
        setExpandedTool(pendingAddedTool);
        setPendingAddedTool(null);
      }
    } else if (
      prev === "running" &&
      (execState.status === "failed" || execState.status === "cancelled")
    ) {
      setPendingAddedTool(null);
    }
  }, [execState.status, cwd, queryClient, pendingAddedTool]);

  // Link-conflict detection (issue #71). The frontend cannot pre-check
  // installed versions — that list is only loaded when the user runs a
  // query — so we submit and then match mise's stderr. `already exists`
  // / `already installed` → friendly duplicate message; `does not exist`
  // → directory-not-found message. Any other stderr falls through with no
  // friendly message, and the raw stderr always stays visible in the
  // execution panel (data-honesty rule — never swallow the real error).
  const prevLinkStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = prevLinkStatusRef.current;
    prevLinkStatusRef.current = execState.status;
    if (prev !== "running" || execState.status !== "failed") return;
    const req = execState.request;
    if (!req || req.args[0] !== "link") {
      // A non-link mutation failed; don't let a stale link hint linger.
      setLinkConflict(null);
      return;
    }
    const target = req.args[1] ?? "";
    const at = target.indexOf("@");
    const tool = at > 0 ? target.slice(0, at) : target;
    const version = at > 0 ? target.slice(at + 1) : "";
    const path = req.args[2] ?? "";
    const stderr = execState.error?.stderr ?? "";
    if (/already exists|already installed/i.test(stderr)) {
      setLinkConflict(
        t(I18N_KEYS.tools.linkForm.duplicateVersion, { tool, version }),
      );
    } else if (/does not exist/i.test(stderr)) {
      setLinkConflict(
        t(I18N_KEYS.tools.confirm.link.directoryNotFound, { path }),
      );
    } else {
      setLinkConflict(null);
    }
  }, [execState.status, execState.request, execState.error, t]);

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

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
  }, [queryClient, cwd]);
  // Top-toolbar refresh (issue #98); the page keeps no local button.
  useRegisterPageRefresh(onRefresh);

  // Link a local directory as a tool version (issue #71). Routes through
  // the shared mutation runner so the trust gate and single-flight guard
  // apply unchanged. The conflict message, if any, is derived from the
  // panel's stderr by the effect above — we just clear it here before the
  // next run so a stale hint can't linger.
  const onLink = useCallback(
    (tool: string, version: string, path: string) => {
      setLinkConflict(null);
      void runMutation(() => miseLinkArgs(tool, version, path));
    },
    [runMutation],
  );

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
        orphan: active.requestedVersion == null,
      });
    }
    return out;
  }, [tools.data, outdated.data]);

  // Text filter over the full row set (issue #106); sorting applies to
  // the filtered rows inside the Table.
  const filter = useTableFilter(rows, (r) =>
    [r.tool, r.version, r.requested, r.backend ?? "", r.source, r.latest].join("\n"),
  );

  // The use-version dropdown (issue #132) lists exactly the tool's
  // installed versions from the live `mise ls` read — picking one runs
  // `mise use`, and a version not on disk can never be submitted.
  const versionsByTool = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { tool, items } of tools.data ?? []) {
      map.set(tool, items.map((it) => it.version));
    }
    return map;
  }, [tools.data]);
  // The expanded row's version center (issue #133) needs the full
  // installed items (active flags, requested versions, sources), not
  // just the version strings.
  const itemsByTool = useMemo(() => {
    const map = new Map<string, MiseLsItem[]>();
    for (const { tool, items } of tools.data ?? []) {
      map.set(tool, items);
    }
    return map;
  }, [tools.data]);

  // The expanded row is tracked by tool (stable across a successful
  // `mise use`, which changes the row's id); the Table matches on the
  // row key, so resolve it here.
  const expandedKey = useMemo(
    () => rows.find((r) => r.tool === expandedTool)?.id ?? null,
    [rows, expandedTool],
  );

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
    width: "120px",
    sortValue: (r) => r.backend ?? "",
    cell: (r) =>
      r.backend !== undefined ? (
        <Badge variant="info" data>{r.backend}</Badge>
      ) : (
        <span className={styles.dim}>—</span>
      ),
  };
  const showBackend = rows.some((r) => r.backend !== undefined);

  const columns: TableColumn<ToolRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.tools.columns.tool),
      width: "160px",
      minWidth: "120px",
      sortValue: (r) => r.tool,
      cell: (r) => (
        <span className={styles.cellTool}>
          <Tooltip text={r.tool}>
            {/* Clicking the tool name toggles the row's inline version
                center (issue #133). Expanding is blocked while a
                foreground command runs, so a mutation can't swap the
                list mid-action; collapsing always works. No caret glyph
                — expandability is shown by interaction (beta8). */}
            <button
              type="button"
              className={`${styles.toolName} ${styles.toolNameButton}`}
              onClick={() => onToggleExpand(r.tool)}
              aria-expanded={expandedTool === r.tool}
              disabled={isRunning && expandedTool !== r.tool}
              data-testid={`tools-expand-${r.tool}`}
            >
              {r.tool}
            </button>
          </Tooltip>
        </span>
      ),
    },
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      width: "96px",
      sortValue: (r) => r.version,
      sortVersion: true,
      // The current version's color is stable — it describes current
      // state; attention belongs to the Latest column (issue #110).
      cell: (r) => (
        <Tooltip text={r.version}>
          <span className={styles.cellVersion}>
            {r.version}
          </span>
        </Tooltip>
      ),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      width: "120px",
      sortValue: (r) => r.requested,
      cell: (r) => <Tooltip text={r.requested}><span className={styles.cellRequested}>{r.requested}</span></Tooltip>,
    },
    ...(showBackend ? [backendColumn] : []),
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      width: "100px",
      sortValue: (r) => r.source,
      cell: (r) => <Tooltip text={r.source}><span className={styles.cellSource}>{r.source}</span></Tooltip>,
    },
    {
      key: "latest",
      header: t(I18N_KEYS.tools.columns.latest),
      width: "150px",
      sortValue: (r) => (r.outdated ? r.latest : ""),
      sortVersion: true,
      cell: (r) =>
        // The full current → latest upgrade path; the shared
        // `upgrade-arrow` span carries the --flare arrow (issue #110).
        r.outdated ? (
          <Tooltip text={`${r.version} → ${r.latest}`}>
            <span className={styles.cellLatest}>
              {r.version}{" "}
              <span className="upgrade-arrow" aria-hidden="true">→</span>{" "}
              <span className={styles.latestValue}>{r.latest}</span>
            </span>
          </Tooltip>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "use",
      header: t(I18N_KEYS.tools.columns.use),
      width: "140px",
      cell: (r) => (
        <UseVersionCell
          row={r}
          disabled={isRunning}
          versions={versionsByTool.get(r.tool) ?? []}
          onUse={(version) =>
            void runMutation((cwd) => miseUseArgs(r.tool, version, cwd))
          }
        />
      ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      width: "220px",
      cell: (r) => (
        <RowActions
          row={r}
          disabled={isRunning}
          onUnuse={() =>
            setPendingRemoval({ kind: "unuse", tool: r.tool, orphan: r.orphan })
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
          <h1 className={styles.title}>{t(I18N_KEYS.tools.title)}</h1>
          <CommandHint>{t(I18N_KEYS.tools.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(I18N_KEYS.tools.hint)}</p>
        </header>

        {/* The single add-tool entry (issue #134): registry search +
            version (default `latest`) + one Use action running
            `mise use <tool>@<version>` — install and activate in one
            step. On success the new tool's row expands (see the
            pendingAddedTool effect). */}
        <AddToolEntry
          disabled={isRunning}
          onUse={(tool, version) => {
            // Mirror runMutation's gates so a blocked run never leaves
            // a stale pending expansion behind.
            if (!guard.allowed || isRunning) return;
            setPendingAddedTool(tool);
            void runMutation((cwd) => miseUseArgs(tool, version, cwd));
          }}
        />

        <div className={styles.toolbar}>
          {/* F13 (issue #98): the hint renders in every state — loading
              included — so it never pops in/out. */}
          <OutdatedHint count={outdated.data == null ? null : outdated.data.length} />
          <TableFilter
            value={filter.query}
            onChange={filter.setQuery}
            placeholder={t(I18N_KEYS.tools.filterPlaceholder)}
            testId="tools-filter"
          />
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
            rows={filter.rows}
            rowKey={(r) => r.id}
            fixed
            resizeKey="tools"
            className={styles.toolsTable}
            expandedKey={expandedKey}
            renderExpanded={(r) => (
              <VersionCenter
                tool={r.tool}
                installed={itemsByTool.get(r.tool) ?? []}
                disabled={isRunning}
                onUse={(version) =>
                  void runMutation((cwd) => miseUseArgs(r.tool, version, cwd))
                }
                onInstallOnly={(version) =>
                  void runMutation(() => miseInstallArgs(r.tool, version))
                }
                onUninstall={(version) =>
                  setPendingRemoval({ kind: "uninstall", tool: r.tool, version })
                }
              />
            )}
            empty={
              filter.active ? (
                <EmptyState
                  title={t(I18N_KEYS.common.filter.noMatchTitle)}
                  body={t(I18N_KEYS.common.filter.noMatchBody)}
                />
              ) : (
                <EmptyState
                  title={t(I18N_KEYS.tools.empty.title)}
                  body={t(I18N_KEYS.tools.empty.body)}
                />
              )
            }
          />
        )}

        <LinkToolForm
          onLink={onLink}
          disabled={isRunning}
          conflict={linkConflict}
        />

        <ConfirmDialog
          open={pendingRemoval !== null}
          title={
            pendingRemoval?.kind === "unuse"
              ? t(I18N_KEYS.tools.confirm.unuse.title, { tool: pendingRemoval.tool })
              : pendingRemoval?.kind === "uninstall"
                ? t(I18N_KEYS.tools.confirm.uninstall.title, {
                    tool: pendingRemoval.tool,
                    version: pendingRemoval.version,
                  })
                : ""
          }
          body={
            pendingRemoval?.kind === "unuse"
              ? t(I18N_KEYS.tools.confirm.unuse.body)
              : t(I18N_KEYS.tools.confirm.uninstall.body)
          }
          command={
            pendingRemoval
              ? commandEcho(
                  "mise",
                  cwd,
                  pendingRemoval.kind === "unuse"
                    ? miseUnuseArgs(pendingRemoval.tool, pendingRemoval.orphan)
                    : miseUninstallArgs(pendingRemoval.tool, pendingRemoval.version),
                )
              : ""
          }
          confirmLabel={
            pendingRemoval?.kind === "unuse"
              ? t(I18N_KEYS.tools.actions.unuse)
              : t(I18N_KEYS.tools.actions.uninstall)
          }
          cancelLabel={t(I18N_KEYS.common.cancel)}
          onConfirm={() => {
            const target = pendingRemoval;
            setPendingRemoval(null);
            if (target?.kind === "unuse") {
              void runMutation(() => miseUnuseArgs(target.tool, target.orphan));
            } else if (target?.kind === "uninstall") {
              void runMutation(() => miseUninstallArgs(target.tool, target.version));
            }
          }}
          onCancel={() => setPendingRemoval(null)}
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

interface UseVersionCellProps {
  row: ToolRow;
  disabled: boolean;
  /** The tool's installed versions, in the order `mise ls` reports them. */
  versions: string[];
  onUse: (version: string) => void;
}

/**
 * The per-row Use control (issue #132): a FloatingMenu dropdown listing
 * the tool's installed versions, dispatching `mise use [-g]
 * <tool>@<version>` on selection. No typing, no datalist — a version
 * that does not exist on disk can never be submitted; installing a new
 * version is the expanded row's version center's job (#133). The current
 * version is marked (`aria-current`) and disabled, since re-selecting
 * it would be a no-op. Rendered through the shared FloatingMenu
 * primitive, so the menu portals out of the table's scroller and
 * follows the WAI-ARIA Menu Button Pattern. Menu triggers carry no
 * caret glyph (beta8).
 */
function UseVersionCell({ row, disabled, versions, onUse }: UseVersionCellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <FloatingMenu
      open={open}
      onOpenChange={setOpen}
      placement="down"
      align="start"
      aria-label={t(I18N_KEYS.tools.columns.use)}
      trigger={(tp) => (
        <Tooltip text={row.version}>
          <button
            type="button"
            className={styles.useTrigger}
            onClick={tp.onClick}
            aria-haspopup={tp["aria-haspopup"]}
            aria-expanded={tp["aria-expanded"]}
            aria-controls={tp["aria-controls"]}
            ref={tp.ref}
            disabled={disabled}
            data-testid={`tools-use-${row.tool}`}
          >
            {row.version}
          </button>
        </Tooltip>
      )}
    >
      <div className={styles.useMenu}>
        {versions.map((version) => {
          const current = version === row.version;
          return (
            <button
              key={version}
              type="button"
              className={current ? styles.useOptionCurrent : styles.useOption}
              role="menuitem"
              aria-current={current ? "true" : undefined}
              disabled={current}
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                onUse(version);
              }}
              data-testid={`tools-use-${row.tool}-${version}`}
            >
              {version}
            </button>
          );
        })}
      </div>
    </FloatingMenu>
  );
}

interface RowActionsProps {
  row: ToolRow;
  disabled: boolean;
  onUnuse: () => void;
  onUpgrade: () => void;
}

/**
 * The mutation buttons for one tool row. An outdated row gets an
 * Upgrade button (`mise upgrade --bump <tool>`); Unuse (ADR-0008,
 * issue #131) dispatches `mise unuse <tool>` — or `mise uninstall
 * --all <tool>` for an orphan installation — via the confirmation
 * dialog. Version selection lives in its own column
 * (UseVersionCell, issue #132).
 */
function RowActions({
  row,
  disabled,
  onUnuse,
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
        onClick={onUnuse}
        disabled={disabled}
        data-testid={`tools-unuse-${row.tool}`}
      >
        {t(I18N_KEYS.tools.actions.unuse)}
      </Button>
    </span>
  );
}

// ---------- Add-tool entry (issue #134) ----------

/** Suggestions shown at once under the registry search box. */
const ADD_TOOL_SUGGESTION_CAP = 10;

interface AddToolEntryProps {
  /** True while a foreground command runs; submit is disabled. */
  disabled: boolean;
  /** Dispatch `mise use [-g] <tool>@<version>` through the panel. */
  onUse: (tool: string, version: string) => void;
}

/**
 * The single add-tool entry at the top of the Tools page (issue #134):
 * a search box autocompleting from `mise registry --json` (tool names +
 * descriptions), a version field defaulting to `latest`, and one
 * primary Use action that runs `mise use <tool>@<version>` — install
 * and activate in one step. Free text stays submittable: a
 * `backend:name` the registry does not list (e.g. `npm:prettier`) is a
 * valid mise tool spec.
 *
 * The suggestion list is a combobox listbox, not a menu: focus stays in
 * the input while Arrow keys move the active option, so neither shared
 * floating primitive fits (FloatingMenu implements the Menu Button
 * pattern and moves focus into the menu; Tooltip is non-interactive).
 * It renders inline-absolute inside the entry (no portal needed — the
 * list never leaves its own container), carries the shared popover
 * surface + `--z-popover`, and closes on outside pointer-down judged
 * against the whole entry root.
 */
function AddToolEntry({ disabled, onUse }: AddToolEntryProps) {
  const { t } = useTranslation();
  const registry = useParsedRegistry();
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState("latest");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const suggestions = useMemo<RegistryItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    return (registry.data ?? [])
      .filter((r) =>
        [r.short, r.description ?? "", ...(r.aliases ?? [])]
          .join("\n")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, ADD_TOOL_SUGGESTION_CAP);
  }, [registry.data, query]);

  // Close on outside pointer-down. The list renders inside the entry
  // root (no portal), so a single contains() check covers input + list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const tool = query.trim();
  const canSubmit = tool.length > 0 && !disabled;

  const onSubmit = () => {
    if (!canSubmit) return;
    setOpen(false);
    // An empty version means latest — `mise use <tool>@latest`.
    onUse(tool, version.trim() || "latest");
  };

  const pickSuggestion = (item: RegistryItem) => {
    setQuery(item.short);
    setOpen(false);
  };

  return (
    <div className={styles.installForm} ref={rootRef} data-testid="tools-add-tool">
      <h2 className={styles.installFormTitle}>
        {t(I18N_KEYS.tools.addTool.title)}
      </h2>
      <KeyForm
        className={styles.installFormRow}
        onSubmit={onSubmit}
        onRevert={() => {
          setQuery("");
          setVersion("latest");
          setOpen(false);
        }}
        submitDisabled={!canSubmit}
      >
        <div className={styles.addToolSearch}>
          <input
            type="text"
            className={`${styles.input} ${styles.addToolSearchInput}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Enter") {
                // Enter with an open list picks the active suggestion
                // instead of submitting; the form's own Enter handles
                // the closed-list submit.
                e.preventDefault();
                e.stopPropagation();
                pickSuggestion(suggestions[activeIndex]);
              } else if (e.key === "Escape") {
                // Escape closes the list first; KeyForm's revert clears
                // the draft on the next press.
                e.stopPropagation();
                setOpen(false);
              }
            }}
            placeholder={t(I18N_KEYS.tools.addTool.searchPlaceholder)}
            aria-label={t(I18N_KEYS.tools.addTool.searchPlaceholder)}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              open && suggestions.length > 0 ? `${listId}-${activeIndex}` : undefined
            }
            aria-autocomplete="list"
            disabled={disabled}
            data-testid="tools-add-tool-search"
            spellCheck={false}
            autoComplete="off"
          />
          {open && query.trim().length > 0 && (
            <div className={styles.addToolList} role="listbox" id={listId}>
              {suggestions.map((item, i) => (
                <button
                  key={item.short}
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={
                    i === activeIndex ? styles.addToolOptionActive : styles.addToolOption
                  }
                  // pointerdown picks before the outside-close listener
                  // or the input's blur can unmount the list.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(item);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  data-testid={`tools-add-tool-option-${item.short}`}
                >
                  <span className={styles.addToolOptionName}>{item.short}</span>
                  {item.description && (
                    <span className={styles.addToolOptionDescription}>
                      {item.description}
                    </span>
                  )}
                </button>
              ))}
              {suggestions.length === 0 && (
                <p className={styles.addToolEmpty}>
                  {t(I18N_KEYS.tools.addTool.noMatches)}
                </p>
              )}
            </div>
          )}
        </div>
        <input
          type="text"
          className={styles.input}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={t(I18N_KEYS.tools.addTool.versionPlaceholder)}
          aria-label={t(I18N_KEYS.tools.columns.version)}
          disabled={disabled}
          data-testid="tools-add-tool-version"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={!canSubmit}
          data-testid="tools-add-tool-use"
        >
          {t(I18N_KEYS.tools.actions.use)}
        </Button>
      </KeyForm>
    </div>
  );
}

// ---------- Link form (issue #71) ----------

interface LinkToolFormProps {
  /** Dispatch `mise link <tool>@<version> <path>` through the panel. */
  onLink: (tool: string, version: string, path: string) => void;
  disabled: boolean;
  /** Friendly conflict message from the last link run, or null. The raw
   *  stderr always remains in the execution panel; this is only the hint. */
  conflict: string | null;
}

/**
 * The "Link a tool" form at the bottom of the page. Linking and using
 * are parallel ways to acquire a tool — one adopts a local directory,
 * the other downloads from remote. Three inputs:
 * tool, version, and a directory path. The path comes from the native
 * directory picker and lives in LOCAL state only — it must NOT write the
 * global directory context that drives the rest of the app.
 */
function LinkToolForm({ onLink, disabled, conflict }: LinkToolFormProps) {
  const { t } = useTranslation();
  const [tool, setTool] = useState("");
  const [version, setVersion] = useState("");
  const [path, setPath] = useState("");

  // Pick the local directory with the native dialog. The result stays in
  // local form state — we deliberately do NOT call `setDirectory`, which
  // would move the whole app's directory context (DirectoryIndicator's
  // `onPick` does that; this is a command argument, not the cwd).
  const pickDirectory = async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: t(I18N_KEYS.directory.pickerTitle),
      });
      if (typeof picked === "string" && picked.length > 0) {
        setPath(picked);
      }
    } catch {
      // User cancelled or the dialog failed; leave the field as-is.
    }
  };

  const canSubmit =
    tool.length > 0 && version.length > 0 && path.length > 0 && !disabled;

  const onSubmit = () => {
    if (!canSubmit) return;
    onLink(tool, version, path);
  };
  // Escape clears the draft, including the picker-owned path (issue #109).
  const onRevert = () => {
    setTool("");
    setVersion("");
    setPath("");
  };

  return (
    <div className={styles.installForm} data-testid="tools-link-form">
      <h2 className={styles.installFormTitle}>
        {t(I18N_KEYS.tools.linkForm.title)}
      </h2>
      <p className={styles.formNote}>
        {t(I18N_KEYS.tools.linkForm.explanation)}
      </p>
      <KeyForm
        className={styles.installFormRow}
        onSubmit={onSubmit}
        onRevert={onRevert}
        submitDisabled={!canSubmit}
      >
        <input
          type="text"
          className={styles.input}
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          placeholder={t(I18N_KEYS.tools.linkForm.toolPlaceholder)}
          disabled={disabled}
          data-testid="tools-link-tool"
          spellCheck={false}
          autoComplete="off"
        />
        <input
          type="text"
          className={styles.input}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={t(I18N_KEYS.tools.linkForm.versionPlaceholder)}
          disabled={disabled}
          data-testid="tools-link-version"
          spellCheck={false}
          autoComplete="off"
        />
        <Tooltip text={path}>
          <span
            className={path ? styles.linkFormPath : styles.linkFormPathEmpty}
            data-testid="tools-link-path"
          >
          {path || t(I18N_KEYS.tools.linkForm.noPath)}
          </span>
        </Tooltip>
        <Button
          variant="primary"
          size="sm"
          onClick={pickDirectory}
          disabled={disabled}
          data-testid="tools-link-pick"
        >
          {t(I18N_KEYS.directory.pickerLabel)}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={!canSubmit}
          data-testid="tools-link-button"
        >
          {t(I18N_KEYS.tools.actions.link)}
        </Button>
      </KeyForm>
      {conflict && (
        <p className={styles.linkConflict} role="alert" data-testid="tools-link-conflict">
          {conflict}
        </p>
      )}
    </div>
  );
}
