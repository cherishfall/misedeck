// AddToolSection — the "Add a tool" region below the Tools page table
// (issue #178, replacing the top add-tool entry #134 and the expanded
// row's version center #133).
//
//   * Registry search — `mise registry --json` filtered client-side
//     (tiered ranking, issue #149). Picking a tool is the ONLY way
//     forward: searching never installs anything (beta12 2-a) — the
//     pick loads the tool's versions so the user browses before any
//     Use / Install action.
//   * One cached `mise ls-remote --json <tool>` per (directory, tool),
//     dispatched through the execution panel's runner in the background
//     (ADR-0005); cold calls take seconds, so a loading row renders
//     while pending. A failed read caches its error; the retry button
//     drops it and re-dispatches (issue #172).
//   * Three version sections in a fixed order: ① in use — the active
//     rows from the page's `mise ls --json` read, topmost and never
//     re-sorted. In directory mode a globally-requested tool's active
//     row is excluded (source.path filter) so "in use here" is not
//     polluted by the global config mixing into `mise ls` (beta12 2-c).
//     ② installed — the other on-disk versions: Use (switch) and
//     Uninstall (via the page's ConfirmDialog, ADR-0008). ③ not
//     installed — remote minus the on-disk set: Use (primary — installs
//     and activates) and Install only (secondary). A `latest` row is
//     pinned to ③'s top, annotated with the concrete version the
//     comparator resolves it to (`latest → 27.0.0`); it renders only
//     when that version is not already on disk, so the sections never
//     overlap. Section order is constant: in use → installed → not
//     installed.
//
// Mutations are the page's job: the section reports intent through
// callbacks so the trust gate and the per-action run-locks apply
// unchanged (issues #138 + #152). Browsing — the disclosure, the
// search, the filter, the pagers — is never run-locked (issue #135).
//
// The version sort uses `compareToolVersions`, which handles vendor
// prefixes and metadata suffixes (`graalvm-community-17.0.7`,
// `temurin-jre-21.0.0+35.0.LTS`) where the old segment comparator
// returned 0 for everything (beta12 2-c Q3).

import { useEffect, useMemo, useRef, useState, useId, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { isAppError } from "../../api/mise";
import { isGlobalConfigPath } from "../../api/miseTools";
import type { MiseLsItem, RegistryItem } from "../../types/tauri";
import { useDirectory } from "../../state/directoryContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useParsedLsRemote, useParsedToolsList, useReadIntoCache } from "../../hooks/useToolsList";
import { useParsedRegistry } from "../../hooks/useIssue29";
import {
  Badge,
  Button,
  EmptyState,
  Pagination,
  ProgressDot,
  Table,
  TableFilter,
  Tooltip,
  type TableColumn,
} from "../../components";
import { compareToolVersions } from "../../utils/versions";

import styles from "./AddToolSection.module.css";

/** Suggestions shown at once under the registry search box. */
const SEARCH_SUGGESTION_CAP = 10;
/** Below this row count a section renders whole, with no pager. */
const PAGER_THRESHOLD = 10;
/** Page-size floor; values below reset to this on commit. */
const MIN_PAGE_SIZE = 10;
/** localStorage namespace for the persisted page size (issue #108).
 *  Reuses the retired version center's key so existing settings carry
 *  over. */
const PAGE_SIZE_STORAGE_KEY = "misedeck.pageSize.tools.remote";

/** A row of the not-installed section: the pinned `latest` alias or a
 *  concrete remote version. */
type AvailableRow =
  | { kind: "latest"; version: string }
  | { kind: "version"; version: string; createdAt?: string };

interface AddToolSectionProps {
  /** True while the page's own `mise use` runs; disables only the Use
   *  buttons (run-locking, issues #138 + #152). */
  useDisabled: boolean;
  /** True while the page's own `mise install` runs; disables only the
   *  Install buttons. */
  installDisabled: boolean;
  /** Dispatch `mise use [-g] <tool>@<version>` through the panel. */
  onUse: (tool: string, version: string) => void;
  /** Dispatch `mise install <tool>@<version>` through the panel. */
  onInstallOnly: (tool: string, version: string) => void;
  /** Opens the page's removal confirmation (exact command shown). */
  onUninstall: (tool: string, version: string) => void;
}

export function AddToolSection({
  useDisabled,
  installDisabled,
  onUse,
  onInstallOnly,
  onUninstall,
}: AddToolSectionProps) {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();

  // The disclosure state is session-only (beta12 2-c Q5): collapsing is
  // a within-session convenience, not a persisted preference.
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  // The picked tool whose versions render below. Typing a new search
  // deselects it — the draft no longer names the rendered tool.
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  // The version filter and both section pagers. Everything resets when
  // the tool or the filter changes.
  const [versionQuery, setVersionQuery] = useState("");
  const [installedPage, setInstalledPage] = useState(1);
  const [availablePage, setAvailablePage] = useState(1);

  const canClear =
    query.trim().length > 0 || selectedTool !== null || versionQuery.trim().length > 0;
  const onClear = () => {
    setQuery("");
    setSelectedTool(null);
    setVersionQuery("");
    setInstalledPage(1);
    setAvailablePage(1);
  };

  const tools = useParsedToolsList();
  const registry = useParsedRegistry();
  const readIntoCache = useReadIntoCache();
  const remote = useParsedLsRemote(selectedTool ?? "");

  const selectTool = (tool: string) => {
    setQuery(tool);
    setSelectedTool(tool);
    setVersionQuery("");
    setInstalledPage(1);
    setAvailablePage(1);
  };

  // One cached `ls-remote` per (directory, tool): dispatch only when a
  // tool is picked and the cache has nothing yet. The read runs in the
  // background so it never yanks the transcript the user is reading
  // (ADR-0005). A failed read caches its `{kind:"err"}` result and
  // nothing retries it on its own (issue #172) — the retry button drops
  // the cached error and bumps `remoteRetryTick`, re-running this
  // effect and dispatching the read again.
  const [remoteRetryTick, setRemoteRetryTick] = useState(0);
  const remoteKey = useMemo(
    () => ["tools", "ls-remote", cwd, selectedTool ?? ""],
    [cwd, selectedTool],
  );
  useEffect(() => {
    if (selectedTool === null) return;
    if (queryClient.getQueryData(remoteKey) !== undefined) return;
    void readIntoCache(remoteKey, cwd, ["ls-remote", "--json", selectedTool], {
      background: true,
    });
  }, [remoteKey, cwd, selectedTool, queryClient, readIntoCache, remoteRetryTick]);

  const onRetryRemote = () => {
    // `type:"all"` — the query is still active (this component
    // subscribes to it), and an inactive-only removal would no-op.
    queryClient.removeQueries({ queryKey: remoteKey, type: "all" });
    setRemoteRetryTick((n) => n + 1);
  };

  // ---------- The three sections for the picked tool ----------

  const toolItems = useMemo(
    () =>
      selectedTool === null
        ? []
        : (tools.data ?? []).find((g) => g.tool === selectedTool)?.items ?? [],
    [tools.data, selectedTool],
  );

  // ① In use: the active rows. In directory mode `mise ls --json`
  // mixes globally-requested tools into the result, so a row sourced
  // from the global config is not "in use here" (beta12 2-c); the
  // version number on the active row is the match key — never the
  // requested string, which may be an alias like `latest`.
  const activeRows = useMemo(
    () =>
      toolItems.filter(
        (it) =>
          it.active &&
          (cwd === null || it.source?.path == null || !isGlobalConfigPath(it.source?.path)),
      ),
    [toolItems, cwd],
  );

  // ② Installed: every other version actually on disk (`mise ls` can
  // also report a requested-but-not-installed version — those are not
  // installed).
  const installedRows = useMemo(
    () =>
      toolItems
        .filter((it) => it.installed && !it.active)
        .sort((a, b) => compareToolVersions(b.version, a.version)),
    [toolItems],
  );

  // The on-disk set excludes a remote version from ③.
  const installedSet = useMemo(
    () => new Set(toolItems.filter((it) => it.installed).map((it) => it.version)),
    [toolItems],
  );

  // An orphan installation is a tool-level fact (ADR-0008): no item in
  // the `mise ls` read — installed or merely requested — carries a
  // request.
  const orphanTool = toolItems.length > 0 && toolItems.every((it) => it.requestedVersion == null);

  // ③ Not installed: remote minus the on-disk set, newest first, with
  // the `latest` alias pinned on top annotated by its resolved version.
  const newestRemote = useMemo(() => {
    const sorted = [...(remote.data ?? [])].sort((a, b) =>
      compareToolVersions(b.version, a.version),
    );
    return sorted[0]?.version;
  }, [remote.data]);

  const availableRows = useMemo<AvailableRow[]>(() => {
    const rows: AvailableRow[] = [];
    if (newestRemote !== undefined && !installedSet.has(newestRemote)) {
      rows.push({ kind: "latest", version: newestRemote });
    }
    const sorted = [...(remote.data ?? [])].sort((a, b) =>
      compareToolVersions(b.version, a.version),
    );
    for (const item of sorted) {
      if (installedSet.has(item.version)) continue;
      rows.push({ kind: "version", version: item.version, createdAt: item.createdAt });
    }
    return rows;
  }, [remote.data, installedSet, newestRemote]);

  // One version filter over ② and ③ (① is the anchor — it stays whole).
  const filteredInstalledRows = useMemo(() => {
    const q = versionQuery.trim().toLowerCase();
    if (q === "") return installedRows;
    return installedRows.filter((r) =>
      [r.version, r.requestedVersion ?? "", r.source?.path ?? r.source?.type ?? ""]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }, [installedRows, versionQuery]);

  const filteredAvailableRows = useMemo(() => {
    const q = versionQuery.trim().toLowerCase();
    if (q === "") return availableRows;
    return availableRows.filter((r) =>
      [r.version, r.kind === "version" ? (r.createdAt ?? "") : ""]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }, [availableRows, versionQuery]);

  useEffect(() => {
    setInstalledPage(1);
    setAvailablePage(1);
  }, [versionQuery, selectedTool]);

  const [storedPageSize, setPageSize] = usePersistentState(
    PAGE_SIZE_STORAGE_KEY,
    MIN_PAGE_SIZE,
  );
  const pageSize = Number.isFinite(storedPageSize)
    ? Math.max(MIN_PAGE_SIZE, storedPageSize)
    : MIN_PAGE_SIZE;

  const installedWindow = paginate(filteredInstalledRows, installedPage, pageSize);
  const availableWindow = paginate(filteredAvailableRows, availablePage, pageSize);

  const remoteError = remote.error;
  const remoteAppErr =
    remoteError && remoteError.kind === "err" && isAppError(remoteError.err)
      ? remoteError.err
      : null;

  // ---------- Section ① + ② columns ----------

  const requestedCell = (r: MiseLsItem) =>
    // Same orphan treatment as the parent table (beta11 3-g/5-b): when
    // the tool itself is unrequested, its rows show a dim "—" plus the
    // orphan badge, and the Tooltip teaches why.
    orphanTool ? (
      <Tooltip text={t(I18N_KEYS.tools.orphan.tooltip)}>
        <span className={styles.cellOrphan}>
          <span className={styles.dim}>—</span>
          <Badge variant="info">{t(I18N_KEYS.tools.orphan.badge)}</Badge>
        </span>
      </Tooltip>
    ) : (
      <Tooltip text={r.requestedVersion ?? "—"}>
        <span className={styles.cellRequested}>{r.requestedVersion ?? "—"}</span>
      </Tooltip>
    );

  const sourceCell = (r: MiseLsItem) => {
    const source = r.source?.path ?? r.source?.type ?? "—";
    return (
      <Tooltip text={source}>
        <span className={styles.cellSource}>{source}</span>
      </Tooltip>
    );
  };

  const versionCell = (r: MiseLsItem, active: boolean) => (
    <span className={styles.versionCell}>
      <span className={styles.cellVersion}>{r.version}</span>
      {active && <Badge variant="success">{t(I18N_KEYS.tools.addTool.activeBadge)}</Badge>}
    </span>
  );

  // The active version offers neither action: re-using it is a no-op,
  // and deleting its files invites an immediate reinstall — tool-level
  // Unuse is the way out of an active version. Its single blocked
  // action renders as a disabled Uninstall whose Tooltip says why
  // (beta11 2-f C).
  const inUseColumns: TableColumn<MiseLsItem>[] = [
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      width: "140px",
      minWidth: "120px",
      cell: (r) => versionCell(r, true),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      width: "160px",
      cell: requestedCell,
    },
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      cell: sourceCell,
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      width: "220px",
      cell: (r) => (
        <Tooltip text={t(I18N_KEYS.tools.addTool.activeUninstallTooltip)}>
          <span className={styles.cellActions}>
            <Button
              variant="danger"
              size="sm"
              disabled
              data-testid={`add-tool-active-uninstall-${r.version}`}
            >
              {t(I18N_KEYS.tools.actions.uninstall)}
            </Button>
          </span>
        </Tooltip>
      ),
    },
  ];

  // Use switches to another on-disk version (`mise use`); Uninstall
  // deletes a version's files — confirmed by the page's dialog
  // (non-active only, ADR-0008).
  const installedColumns: TableColumn<MiseLsItem>[] = [
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      width: "140px",
      minWidth: "120px",
      cell: (r) => versionCell(r, false),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      width: "160px",
      cell: requestedCell,
    },
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      cell: sourceCell,
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      width: "220px",
      cell: (r) => (
        <span className={styles.cellActions}>
          <Button
            variant="primary"
            size="sm"
            disabled={useDisabled}
            onClick={() => onUse(selectedTool ?? "", r.version)}
            data-testid={`add-tool-installed-use-${r.version}`}
          >
            {t(I18N_KEYS.tools.actions.use)}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onUninstall(selectedTool ?? "", r.version)}
            data-testid={`add-tool-installed-uninstall-${r.version}`}
          >
            {t(I18N_KEYS.tools.actions.uninstall)}
          </Button>
        </span>
      ),
    },
  ];

  // ---------- Section ③ columns ----------

  const availableColumns: TableColumn<AvailableRow>[] = [
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      width: "140px",
      minWidth: "120px",
      cell: (r) =>
        r.kind === "latest" ? (
          // The `latest` alias (mise's own vocabulary — it never
          // appears in ls-remote output) annotated with the concrete
          // version the comparator resolves it to.
          <Tooltip text={`latest → ${r.version}`}>
            <span className={styles.versionCell}>
              <span className={styles.latestAlias}>latest</span>
              <span className="upgrade-arrow" aria-hidden="true">→</span>
              <span className={styles.latestValue}>{r.version}</span>
            </span>
          </Tooltip>
        ) : (
          <span className={styles.cellVersion}>{r.version}</span>
        ),
    },
    {
      key: "created",
      header: t(I18N_KEYS.tools.addTool.created),
      width: "150px",
      cell: (r) =>
        r.kind === "version" ? (
          <Tooltip text={r.createdAt ?? "—"}>
            <span className={styles.cellSource}>{r.createdAt ?? "—"}</span>
          </Tooltip>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      width: "220px",
      cell: (r) => (
        // The `latest` row dispatches the RESOLVED concrete version
        // (`mise use java@27.0.0`), never the alias: the read may be
        // minutes old by the time it runs, and the annotation is the
        // honest contract of what will happen.
        <span className={styles.cellActions}>
          <Button
            variant="primary"
            size="sm"
            disabled={useDisabled}
            onClick={() => onUse(selectedTool ?? "", r.version)}
            data-testid={`add-tool-remote-use-${r.kind === "latest" ? "latest" : r.version}`}
          >
            {t(I18N_KEYS.tools.actions.use)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={installDisabled}
            onClick={() => onInstallOnly(selectedTool ?? "", r.version)}
            data-testid={`add-tool-remote-install-${r.kind === "latest" ? "latest" : r.version}`}
          >
            {t(I18N_KEYS.tools.actions.install)}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <section className={styles.section} data-testid="tools-add-tool">
      <div className={styles.head}>
        {/* The disclosure trigger is the shared ghost Button (issue
            #184, the disclosure-trigger convention) — browsing, never
            run-locked; no caret glyph. */}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          data-testid="tools-add-tool-toggle"
        >
          {t(I18N_KEYS.tools.addTool.title)}
        </Button>
        <div className={styles.headActions}>
          {selectedTool !== null && (
            <TableFilter
              value={versionQuery}
              onChange={setVersionQuery}
              placeholder={t(I18N_KEYS.tools.addTool.filterPlaceholder)}
              testId="add-tool-filter"
            />
          )}
          {/* Clear resets the search draft and the picked tool back to
              the default empty state; disabled when there is nothing to
              clear (the no-op rule). */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={!canClear}
            data-testid="tools-add-tool-clear"
          >
            {t(I18N_KEYS.common.clear)}
          </Button>
        </div>
      </div>

      {open && (
        <div className={styles.body}>
          {/* The default state is search-only: no tool picked, no
              ls-remote dispatched (the read is a cold, seconds-long
              call — beta12 2-c). */}
          <RegistrySearch
            query={query}
            onQueryChange={(value) => {
              setQuery(value);
              setSelectedTool(null);
            }}
            registry={registry.data ?? []}
            onPick={selectTool}
          />

          {selectedTool !== null && (
            <div className={styles.sections}>
              <section className={styles.subList}>
                <h3 className={styles.subTitle}>{t(I18N_KEYS.tools.addTool.inUseTitle)}</h3>
                <Table<MiseLsItem>
                  columns={inUseColumns}
                  rows={activeRows}
                  rowKey={(r) => `${selectedTool}@${r.version}`}
                  fixed
                  resizeKey="tools.add-tool.in-use"
                  className={styles.installedTable}
                  empty={
                    <EmptyState
                      title={t(I18N_KEYS.tools.addTool.emptyInUseTitle)}
                      body={t(I18N_KEYS.tools.addTool.emptyInUseBody, { tool: selectedTool })}
                    />
                  }
                />
              </section>

              <section className={styles.subList}>
                <h3 className={styles.subTitle}>{t(I18N_KEYS.tools.addTool.installedTitle)}</h3>
                <Table<MiseLsItem>
                  columns={installedColumns}
                  rows={installedWindow.rows}
                  rowKey={(r) => `${selectedTool}@${r.version}`}
                  fixed
                  resizeKey="tools.add-tool.installed"
                  className={styles.installedTable}
                  empty={
                    <EmptyState
                      title={t(I18N_KEYS.tools.addTool.emptyInstalledTitle)}
                      body={t(I18N_KEYS.tools.addTool.emptyInstalledBody, { tool: selectedTool })}
                    />
                  }
                />
                {installedWindow.showPager && (
                  <Pagination
                    total={filteredInstalledRows.length}
                    pageSize={pageSize}
                    currentPage={installedWindow.page}
                    onPageChange={setInstalledPage}
                    onPageSizeChange={setPageSize}
                    minPageSize={MIN_PAGE_SIZE}
                  />
                )}
              </section>

              <section className={styles.subList}>
                <h3 className={styles.subTitle}>
                  {t(I18N_KEYS.tools.addTool.notInstalledTitle)}
                </h3>

                {remote.isPending && (
                  <div className={styles.loading}>
                    <ProgressDot tone="dim" />
                    <span className={styles.loadingLabel}>{t(I18N_KEYS.common.loading)}</span>
                  </div>
                )}

                {!remote.isPending && remoteError && (
                  <div className={styles.errorBlock}>
                    <div className={styles.errorLabel}>
                      {t(I18N_KEYS.states.commandFailed.title)}
                    </div>
                    <p className={styles.errorBody}>
                      {t(I18N_KEYS.states.commandFailed.body)}
                    </p>
                    {remoteAppErr?.stderr ? (
                      <pre className={styles.errorStderr}>{remoteAppErr.stderr}</pre>
                    ) : null}
                    {/* The failed read is cached, so nothing retries it
                        on its own — this button is the recovery path
                        (issue #172). */}
                    <Button
                      variant="secondary"
                      size="sm"
                      className={styles.errorRetry}
                      onClick={onRetryRemote}
                      data-testid="add-tool-remote-retry"
                    >
                      {t(I18N_KEYS.tools.addTool.retryButton)}
                    </Button>
                  </div>
                )}

                {!remote.isPending && !remoteError && (
                  <>
                    <Table<AvailableRow>
                      columns={availableColumns}
                      rows={availableWindow.rows}
                      rowKey={(r) =>
                        r.kind === "latest"
                          ? `${selectedTool}@latest`
                          : `${selectedTool}@remote:${r.version}`
                      }
                      fixed
                      resizeKey="tools.add-tool.available"
                      className={styles.availableTable}
                      empty={
                        <EmptyState
                          title={
                            versionQuery.trim().length > 0
                              ? t(I18N_KEYS.common.filter.noMatchTitle)
                              : t(I18N_KEYS.tools.addTool.emptyAvailableTitle)
                          }
                          body={
                            versionQuery.trim().length > 0
                              ? t(I18N_KEYS.common.filter.noMatchBody)
                              : t(I18N_KEYS.tools.addTool.emptyAvailableBody, {
                                  tool: selectedTool,
                                })
                          }
                        />
                      }
                    />
                    {availableWindow.showPager && (
                      <Pagination
                        total={filteredAvailableRows.length}
                        pageSize={pageSize}
                        currentPage={availableWindow.page}
                        onPageChange={setAvailablePage}
                        onPageSizeChange={setPageSize}
                        minPageSize={MIN_PAGE_SIZE}
                      />
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Clamp-and-slice one section's rows for its pager; the pager renders
 *  only past the threshold, so this is a pass-through for short lists. */
function paginate<T>(
  rows: ReadonlyArray<T>,
  currentPage: number,
  pageSize: number,
): { rows: T[]; page: number; showPager: boolean } {
  const total = rows.length;
  const showPager = total > PAGER_THRESHOLD;
  const totalPages = showPager ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  // Clamp at render time so a page never points past the (possibly
  // shrunken) filtered set.
  const page = showPager ? Math.min(Math.max(1, currentPage), totalPages) : 1;
  return {
    rows: showPager ? rows.slice((page - 1) * pageSize, page * pageSize) : [...rows],
    page,
    showPager,
  };
}

// ---------- Registry search (combobox) ----------

interface RegistrySearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  registry: RegistryItem[];
  /** Picking a suggestion (or submitting an exact/free-text name)
   *  selects the tool — it loads the version sections, it never
   *  installs anything (beta12 2-a). */
  onPick: (tool: string) => void;
}

/**
 * The registry search box with its autocomplete suggestion list — the
 * region's only entry point (issue #178). The suggestion list is a
 * combobox listbox, not a menu: focus stays in the input while Arrow
 * keys move the active option, so neither shared floating primitive
 * fits (FloatingMenu implements the Menu Button pattern and moves
 * focus into the menu; Tooltip is non-interactive). It renders
 * inline-absolute inside the search wrapper (no portal needed — the
 * list never leaves its own container), carries the shared popover
 * surface + `--z-popover`, and closes on outside pointer-down judged
 * against the whole search root.
 */
function RegistrySearch({ query, onQueryChange, registry, onPick }: RegistrySearchProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo<RegistryItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    // Tiered ranking (issue #149): an exact or prefix short-name match
    // always outranks a description hit, so typing "java" puts `java`
    // first instead of `ant` (alphabetically first via its "Java
    // library" description). Ties keep the registry's own order.
    const tier = (r: RegistryItem): number => {
      const short = r.short.toLowerCase();
      if (short === q) return 0;
      if (short.startsWith(q)) return 1;
      if ((r.aliases ?? []).some((a) => a.toLowerCase().includes(q))) return 2;
      return 3;
    };
    return registry
      .filter((r) =>
        [r.short, r.description ?? "", ...(r.aliases ?? [])]
          .join("\n")
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => tier(a) - tier(b));
  }, [registry, query]);
  const suggestions = matches.slice(0, SEARCH_SUGGESTION_CAP);
  // The cap truncates silently without a hint (beta11 3-h m5) — the
  // tail row below says more matches exist.
  const moreMatches = matches.length > suggestions.length;

  // Close on outside pointer-down. The list renders inside the search
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

  const pick = (item: RegistryItem) => {
    onPick(item.short);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && open && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && open && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    const exact = suggestions.find(
      (s) => s.short.toLowerCase() === query.trim().toLowerCase(),
    );
    if (exact) {
      // The query is already an exact tool name — select it directly
      // instead of picking the suggestion (issue #149).
      e.preventDefault();
      pick(exact);
      return;
    }
    if (open && suggestions.length > 0) {
      // Enter with an open list picks the active suggestion.
      e.preventDefault();
      pick(suggestions[activeIndex]);
      return;
    }
    // Free text stays submittable (issue #134's registry-gap case: a
    // `backend:name` the registry does not list, e.g. `npm:prettier`,
    // is a valid mise tool spec). Selecting loads its versions — the
    // browse step before any install (beta12 2-a).
    const tool = query.trim();
    if (tool.length > 0) {
      e.preventDefault();
      pick({ short: tool, backends: [] });
    }
  };

  return (
    <div className={styles.search} ref={rootRef}>
      <input
        type="text"
        className={`${styles.input} ${styles.searchInput}`}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t(I18N_KEYS.tools.addTool.searchPlaceholder)}
        aria-label={t(I18N_KEYS.tools.addTool.searchPlaceholder)}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          open && suggestions.length > 0 ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        data-testid="tools-add-tool-search"
        spellCheck={false}
        autoComplete="off"
      />
      {open && query.trim().length > 0 && (
        <div className={styles.suggestionList} role="listbox" id={listId}>
          {suggestions.map((item, i) => (
            <button
              key={item.short}
              type="button"
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={
                i === activeIndex ? styles.suggestionActive : styles.suggestion
              }
              // pointerdown picks before the outside-close listener or
              // the input's blur can unmount the list.
              onPointerDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              data-testid={`tools-add-tool-option-${item.short}`}
            >
              <span className={styles.suggestionName}>{item.short}</span>
              {item.description && (
                <span className={styles.suggestionDescription}>{item.description}</span>
              )}
            </button>
          ))}
          {suggestions.length === 0 && (
            <p className={styles.suggestionEmpty}>{t(I18N_KEYS.tools.addTool.noMatches)}</p>
          )}
          {moreMatches && (
            <p className={styles.suggestionEmpty}>
              {t(I18N_KEYS.tools.addTool.moreMatches)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
