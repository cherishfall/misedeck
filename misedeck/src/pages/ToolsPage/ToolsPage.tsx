// ToolsPage — the global tools list with mutations (issues #21 + #22).
//
//   * mise ls --json         → table rows (tool, version+switch,
//                              requested, backend, source, latest,
//                              actions)
//   * mise outdated --json   → the Latest column's current → latest
//                              path on the rows that appear in the map
//   * mise use -g            → switching an installed version (the
//                              Version cell is the trigger, #132 + #151)
//                              and the add-tool section's Use buttons
//                              (#178)
//   * mise install           → install only a version (add-tool section)
//   * mise unuse             → remove a tool (config request + installs);
//                              orphans run `mise uninstall --all` (ADR-0008)
//   * mise uninstall         → delete one non-active version's files
//   * mise upgrade --bump    → upgrade all or one outdated tool
//   * mise registry --json   → the Add a tool section's search
//                              autocomplete (tool names + descriptions)
//   * mise ls-remote --json  → the Add a tool section's not-installed
//                              version list (#178)
//
// The "Add a tool" section sits below the tools table (issue #178,
// beta12 2-c): search the registry, pick a tool, and its versions
// render in three sections — in use, installed, not installed — newest
// first with client-side filter and pagination. Searching and picking
// never install anything; Use / Install only / Uninstall are explicit
// per-version actions. The Link form lives in the collapsed Advanced
// section. Every invocation — mutations and reads alike — routes
// through the execution panel so the exact command and live logs are
// visible (ADR-0005). The list refreshes when a run exits successfully;
// the success closes the loop in-page with a short-lived confirmation
// bar (issue #144); failures surface stderr and leave state unchanged.

import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useMemo,
  useState,
} from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { useTrustGuard } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  useParsedOutdatedTools,
  useParsedToolsList,
} from "../../hooks/useToolsList";
import { useTableFilter } from "../../hooks/useTableFilter";
import { AddToolSection } from "./AddToolSection";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  CommandHint,
  ConfirmDialog,
  EmptyState,
  KeyForm,
  ListLoading,
  MiseMissingState,
  OutdatedHint,
  PageShell,
  SuccessBar,
  Table,
  type TableColumn,
  TableFilter,
  Tooltip,
  TrustBanner,
  useRegisterPageRefresh,
  useTrustBannerFocus,
} from "../../components";
import {
  commandEcho,
  useOwnRun,
} from "../../components/ExecutionPanel";
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
 *  add-tool section (issue #178) supplies its tool name. */
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
// `-C <dir>` in Directory mode and `-C $HOME` in Global mode (issue
// #179), so the global context naturally targets the global config
// without extra flags for those three commands.

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
  const guard = useTrustGuard();
  // The trust banner is the shared component (issues #25 / #141);
  // `focusTrustBanner` is what the mutation paths call when the
  // guard blocks, so a blocked button scrolls the user to the
  // banner instead of silently doing nothing.
  const { ref: bannerRef, focus: focusTrustBanner } = useTrustBannerFocus();

  // The removal confirmation (issues #56 + #131): clicking 卸载 / Unuse
  // or 删除此版本 / Uninstall opens a dialog showing the exact command
  // that will run; the mutation only dispatches after the user confirms.
  // No removal runs without this confirmation. The add-tool section
  // (issue #178) feeds the same dialog with its own version targets.
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  // Friendly message from the most recent link run (issue #71). Null
  // unless the last `mise link` failed with a recognized conflict.
  const [linkConflict, setLinkConflict] = useState<string | null>(null);

  // In-page success confirmation (issue #144): a successful mutation
  // closes the loop here with a short-lived bar instead of leaving the
  // only signal to the panel's tone dot. The message is passed per
  // action; failures are unchanged — the panel still auto-opens.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTick, setSuccessTick] = useState(0);

  // The Link form (`mise link`) is an advanced low-frequency flow, so it
  // lives in a collapsed "Advanced" section off the first screen
  // (issue #135); the form inside is unchanged.
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // Per-action run-lock (issues #138 + #152): every command family on
  // this page gets its own `useOwnRun()` hook, so a control freezes only
  // while the command *its own family* dispatched is in flight — a
  // multi-minute install of one tool never disables another row's
  // Use/Upgrade, the add-tool section's buttons, or the link form. The
  // families are the mise commands: use, install, upgrade, link, and
  // removal (unuse/uninstall, dispatched only by the confirm dialog). A
  // successful mutation refreshes the tools + outdated reads (the
  // add-tool section's in-use and installed sections derive from the
  // same read).
  const useRun = useOwnRun();
  const installRun = useOwnRun();
  const upgradeRun = useOwnRun();
  const linkRun = useOwnRun();
  const removalRun = useOwnRun();
  const fireMutation = useCallback(
    async (
      runner: ReturnType<typeof useOwnRun>,
      builder: (cwd: string | null) => string[],
      successMessage?: string,
    ) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (runner.isRunning) return;
      const res = await runner.run({ cwd, args: builder(cwd) });
      if (res.kind === "ok") {
        void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
        void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
        // Success closes the loop in-page (issue #144); the exact
        // command stays in the execution panel's transcript. The tick
        // re-arms the bar's timer even when the message text repeats
        // (issue #172).
        if (successMessage !== undefined) {
          setSuccessMessage(successMessage);
          setSuccessTick((n) => n + 1);
        }
      }
      return res;
    },
    [guard.allowed, focusTrustBanner, cwd, queryClient],
  );

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
  }, [queryClient, cwd]);
  // Top-toolbar refresh (issue #98); the page keeps no local button.
  useRegisterPageRefresh(onRefresh);

  // Link a local directory as a tool version (issue #71). Dispatches
  // through the link family's runner so the trust gate applies
  // unchanged. The conflict message is derived from the run's own
  // stderr (issue #138):
  // `already exists` / `already installed` → friendly duplicate message;
  // `does not exist` → directory-not-found message. Any other stderr
  // falls through with no friendly message, and the raw stderr always
  // stays visible in the execution panel (data-honesty rule — never
  // swallow the real error).
  const onLink = useCallback(
    async (tool: string, version: string, path: string) => {
      setLinkConflict(null);
      const res = await fireMutation(
        linkRun,
        () => miseLinkArgs(tool, version, path),
        t(I18N_KEYS.tools.success.linked, { tool, version }),
      );
      if (res && res.kind === "err") {
        const stderr = res.err.stderr;
        if (/already exists|already installed/i.test(stderr)) {
          setLinkConflict(t(I18N_KEYS.tools.linkForm.duplicateVersion, { tool, version }));
        } else if (/does not exist/i.test(stderr)) {
          setLinkConflict(t(I18N_KEYS.tools.confirm.link.directoryNotFound, { path }));
        } else {
          setLinkConflict(null);
        }
      } else {
        setLinkConflict(null);
      }
    },
    [fireMutation, linkRun, t],
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
  // `mise ls` can also report a requested-but-not-installed version, so
  // only `installed` items count.
  const versionsByTool = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { tool, items } of tools.data ?? []) {
      map.set(
        tool,
        items.filter((it) => it.installed).map((it) => it.version),
      );
    }
    return map;
  }, [tools.data]);

  // Mise-missing or list-loading state. The list-level gate (issue
  // #146) covers the `mise ls` read too: while it is pending — first
  // load or a directory switch — the shared ListLoading renders
  // instead of the table's "no data" empty state.
  if (detect.isPending || tools.isPending) {
    return <ListLoading />;
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

  // The Latest column exists only when at least one row is outdated
  // (beta11 2-c): with every tool up to date the column would render
  // nothing but "—" — noise, not data. Same conditional-column logic as
  // the Backend column; the OutdatedHint counter still communicates
  // "all up to date" when the column is absent.
  const latestColumn: TableColumn<ToolRow> = {
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
  };
  const showLatest = rows.some((r) => r.outdated);

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
            <span className={styles.toolName}>{r.tool}</span>
          </Tooltip>
        </span>
      ),
    },
    {
      // The Version cell is itself the version-switch trigger (issue
      // #151, merging the retired Use column): the data renders once,
      // and the cell doubles as the control — hover shows the option
      // hover wash and the Tooltip teaches "click to switch version"
      // instead of repeating the value (beta11 2-d/3-f).
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      width: "140px",
      minWidth: "96px",
      sortValue: (r) => r.version,
      sortVersion: true,
      cell: (r) => (
        <UseVersionCell
          row={r}
          disabled={useRun.isRunning}
          versions={versionsByTool.get(r.tool) ?? []}
          onUse={(version) =>
            void fireMutation(
              useRun,
              (cwd) => miseUseArgs(r.tool, version, cwd),
              t(I18N_KEYS.tools.success.used, { tool: r.tool, version }),
            )
          }
        />
      ),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      width: "160px",
      sortValue: (r) => r.requested,
      cell: (r) =>
        // An orphan row (no Config file requests this tool) shows its
        // missing request as a dim "—" plus an orphan badge; the Tooltip
        // teaches why instead of repeating the dash (beta11 3-g/5-b).
        r.orphan ? (
          <Tooltip text={t(I18N_KEYS.tools.orphan.tooltip)}>
            <span className={styles.cellOrphan}>
              <span className={styles.dim}>—</span>
              <Badge variant="info">{t(I18N_KEYS.tools.orphan.badge)}</Badge>
            </span>
          </Tooltip>
        ) : (
          <Tooltip text={r.requested}>
            <span className={styles.cellRequested}>{r.requested}</span>
          </Tooltip>
        ),
    },
    ...(showBackend ? [backendColumn] : []),
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      width: "100px",
      sortValue: (r) => r.source,
      cell: (r) => <Tooltip text={r.source}><span className={styles.cellSource}>{r.source}</span></Tooltip>,
    },
    // The Latest column renders only when at least one row is outdated
    // (see `latestColumn` / `showLatest` above).
    ...(showLatest ? [latestColumn] : []),
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      width: "220px",
      cell: (r) => (
        <RowActions
          row={r}
          disabled={upgradeRun.isRunning}
          onUnuse={() =>
            setPendingRemoval({ kind: "unuse", tool: r.tool, orphan: r.orphan })
          }
          onUpgrade={() =>
            void fireMutation(
              upgradeRun,
              () => miseUpgradeArgs(r.tool),
              t(I18N_KEYS.tools.success.upgraded, { tool: r.tool }),
            )
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
          <p className={styles.hint}>{t(cwd === null ? I18N_KEYS.tools.hintGlobal : I18N_KEYS.tools.hint)}</p>
        </header>

        {/* In-page success confirmation (issue #144): set by every
            successful mutation below, auto-dismisses after a few
            seconds. Null renders nothing. */}
        <SuccessBar
          message={successMessage}
          tick={successTick}
          onDismiss={() => setSuccessMessage(null)}
        />

        {/* Trust banner (issues #25 / #141): every mutation below is
            trust-gated; when the guard blocks, the page scrolls to
            this banner instead of running. */}
        <TrustBanner
          ref={bannerRef}
          body={I18N_KEYS.tools.guard.untrustedBody}
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

        {/* The "Add a tool" section below the table (issue #178, beta12
            2-c): registry search → three version sections (in use →
            installed → not installed). Searching never installs — the
            browse step is mandatory between search and any Use /
            Install. The toggle and the Clear button are browsing and
            never run-locked; only the section's command-firing buttons
            carry the locks (issues #135 + #138). */}
        <AddToolSection
          useDisabled={useRun.isRunning}
          installDisabled={installRun.isRunning}
          onUse={(tool, version) =>
            void fireMutation(
              useRun,
              (cwd) => miseUseArgs(tool, version, cwd),
              t(I18N_KEYS.tools.success.used, { tool, version }),
            )
          }
          onInstallOnly={(tool, version) =>
            void fireMutation(
              installRun,
              () => miseInstallArgs(tool, version),
              t(I18N_KEYS.tools.success.installed, { tool, version }),
            )
          }
          onUninstall={(tool, version) =>
            setPendingRemoval({ kind: "uninstall", tool, version })
          }
        />

        {/* The Link form (`mise link`, issue #71) is an advanced
            low-frequency flow: it lives in a collapsed "Advanced"
            section (issue #135). The toggle is a shared ghost Button
            (issue #184, the disclosure-trigger convention) — browsing
            and never run-locked; no caret glyph — expandability is
            shown by interaction. */}
        <section className={styles.advanced} data-testid="tools-advanced">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            data-testid="tools-advanced-toggle"
          >
            {t(I18N_KEYS.tools.advanced.title)}
          </Button>
          {advancedOpen && (
            <LinkToolForm
              onLink={onLink}
              disabled={linkRun.isRunning}
              conflict={linkConflict}
            />
          )}
        </section>

        <ConfirmDialog
          open={pendingRemoval !== null}
          confirmBusy={removalRun.isRunning}
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
              void fireMutation(
                removalRun,
                () => miseUnuseArgs(target.tool, target.orphan),
                t(I18N_KEYS.tools.success.unused, { tool: target.tool }),
              );
            } else if (target?.kind === "uninstall") {
              void fireMutation(
                removalRun,
                () => miseUninstallArgs(target.tool, target.version),
                t(I18N_KEYS.tools.success.uninstalled, {
                  tool: target.tool,
                  version: target.version,
                }),
              );
            }
          }}
          onCancel={() => setPendingRemoval(null)}
        />
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
 * The per-row version-switch control (issue #132, merged into the
 * Version column in #151): the Version cell itself is the FloatingMenu
 * trigger — the version number renders once, as data and control at
 * once. No typing, no datalist — a version that does not exist on disk
 * can never be submitted; installing a new version is the Add a tool
 * section's job (#178). The current version is marked
 * (`aria-current`) and disabled in the menu, since re-selecting it
 * would be a no-op. Rendered through the shared FloatingMenu primitive,
 * so the menu portals out of the table's scroller and follows the
 * WAI-ARIA Menu Button Pattern. Discoverability is the hover wash (the
 * option-hover language) plus a teaching Tooltip — never a caret glyph
 * (beta8, beta11 2-d). With only the current version installed the cell
 * renders a disabled trigger + teaching Tooltip instead of the menu,
 * which would open all-disabled (beta11 3-h m1).
 */
function UseVersionCell({ row, disabled, versions, onUse }: UseVersionCellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Guard (beta11 3-h m1): with only the current version installed the
  // menu would open as an all-disabled list — a reachable control that
  // can do nothing (ui-ux-rules no-op rule). Render the version as a
  // disabled trigger whose Tooltip teaches why; installing another
  // version is the Add a tool section's job (#178).
  if (versions.length <= 1) {
    return (
      <Tooltip text={t(I18N_KEYS.tools.tooltip.singleVersion)}>
        <button
          type="button"
          className={`${styles.cellVersion} ${styles.versionTrigger}`}
          disabled
          data-testid={`tools-use-${row.tool}`}
        >
          {row.version}
        </button>
      </Tooltip>
    );
  }
  return (
    <FloatingMenu
      open={open}
      onOpenChange={setOpen}
      placement="down"
      align="start"
      aria-label={t(I18N_KEYS.tools.columns.version)}
      trigger={(tp) => (
        // Teaching Tooltip (beta11 2-d): the value is already fully
        // visible in the cell, so the hover layer teaches the action
        // instead of repeating it.
        <Tooltip text={t(I18N_KEYS.tools.tooltip.switchVersion)}>
          <button
            type="button"
            className={`${styles.cellVersion} ${styles.versionTrigger}`}
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
 * dialog. Version selection lives in the Version cell itself
 * (UseVersionCell, issues #132 + #151).
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
        data-testid={`tools-unuse-${row.tool}`}
      >
        {t(I18N_KEYS.tools.actions.unuse)}
      </Button>
    </span>
  );
}

// ---------- Link form (issue #71) ----------

interface LinkToolFormProps {
  /** Dispatch `mise link <tool>@<version> <path>` through the panel. */
  onLink: (tool: string, version: string, path: string) => void;
  /** True while a foreground command runs; locks only the Link submit
   *  (run-locking, issue #135) — drafting the inputs and picking the
   *  directory never lock. */
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
