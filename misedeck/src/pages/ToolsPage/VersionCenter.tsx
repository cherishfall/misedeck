// VersionCenter — the inline expanded view of a Tools page row
// (issue #133). Two sub-lists for one tool:
//
//   * Installed versions — every installed version from the live
//     `mise ls --json` read the page already holds; the active one
//     carries the active badge (the single active signal — the retired
//     "inactive" note and Active column are gone, #133), others offer
//     Use (`mise use`) and Uninstall (`mise uninstall <tool>@<version>`,
//     confirmed by the page's dialog; non-active only, ADR-0008).
//   * Available versions — one cached `mise ls-remote --json <tool>`
//     call per (directory, tool), dispatched through the execution
//     panel's runner in the background (ADR-0005); already-installed
//     versions are marked 已安装 / Installed and offer no action; the
//     rest offer Use (primary — installs + activates) and Install only
//     (secondary). Client-side substring filter + pagination +
//     version-aware descending sort keep thousand-row lists (java)
//     usable.
//
// Mutations are the page's job: the center reports intent through
// callbacks so the trust gate and the single-flight panel guard apply
// unchanged.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { isAppError } from "../../api/mise";
import type { MiseLsItem, MiseLsRemoteItem } from "../../types/tauri";
import { useDirectory } from "../../state/directoryContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTableFilter } from "../../hooks/useTableFilter";
import { useParsedLsRemote, useReadIntoCache } from "../../hooks/useToolsList";
import {
  Badge,
  Button,
  EmptyState,
  Pagination,
  Table,
  TableFilter,
  Tooltip,
  type TableColumn,
} from "../../components";
import { compareVersions } from "../../utils/versions";

import styles from "./VersionCenter.module.css";

/** Below this row count the whole remote result renders with no pager. */
const PAGER_THRESHOLD = 10;
/** Page-size floor; values below reset to this on commit. */
const MIN_PAGE_SIZE = 10;
/** localStorage namespace for the persisted page size (issue #108);
 *  reuses the retired remote section's key so existing settings carry
 *  over. */
const PAGE_SIZE_STORAGE_KEY = "misedeck.pageSize.tools.remote";

interface VersionCenterProps {
  tool: string;
  /** The tool's installed versions from the page's `mise ls --json`
   *  read — no extra call is needed for the installed sub-list. */
  installed: MiseLsItem[];
  /** True while a foreground command runs; the command-firing buttons
   *  (Use / Install only) are disabled. Browsing — the filter and
   *  pager — is never run-locked (issue #135), and neither is
   *  Uninstall: it only opens the page's run-aware confirm dialog. */
  disabled: boolean;
  onUse: (version: string) => void;
  onInstallOnly: (version: string) => void;
  /** Opens the page's removal confirmation (exact command shown). */
  onUninstall: (version: string) => void;
}

export function VersionCenter({
  tool,
  installed,
  disabled,
  onUse,
  onInstallOnly,
  onUninstall,
}: VersionCenterProps) {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const readIntoCache = useReadIntoCache();
  const remote = useParsedLsRemote(tool);

  // Scroll the expanded content into view on open (absorbs the retired
  // scroll-to-section leftover from the query sections).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  // One cached `ls-remote` per (directory, tool): dispatch only when the
  // cache has nothing yet. The read runs in the background so it never
  // yanks the transcript the user is reading (ADR-0005).
  useEffect(() => {
    const key = ["tools", "ls-remote", cwd, tool];
    if (queryClient.getQueryData(key) !== undefined) return;
    void readIntoCache(key, cwd, ["ls-remote", "--json", tool], { background: true });
  }, [cwd, tool, queryClient, readIntoCache]);

  // Only versions actually on disk count as installed: `mise ls --json`
  // can also report a requested-but-not-installed version.
  const installedOnDisk = useMemo(
    () => installed.filter((it) => it.installed),
    [installed],
  );
  // Version-aware descending sort for both sub-lists: newest first.
  const installedRows = useMemo(
    () => [...installedOnDisk].sort((a, b) => compareVersions(b.version, a.version)),
    [installedOnDisk],
  );
  const installedSet = useMemo(
    () => new Set(installedOnDisk.map((it) => it.version)),
    [installedOnDisk],
  );

  const installedColumns: TableColumn<MiseLsItem>[] = [
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      cell: (r) => (
        <span className={styles.versionCell}>
          <span className={styles.cellVersion}>{r.version}</span>
          {r.active && (
            <Badge variant="success">{t(I18N_KEYS.tools.versionCenter.activeBadge)}</Badge>
          )}
        </span>
      ),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      cell: (r) => <span className={styles.cellRequested}>{r.requestedVersion ?? "—"}</span>,
    },
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      cell: (r) => (
        <Tooltip text={r.source?.path ?? r.source?.type ?? "—"}>
          <span className={styles.cellSource}>{r.source?.path ?? r.source?.type ?? "—"}</span>
        </Tooltip>
      ),
    },
    {
      // Use switches to another on-disk version (`mise use`); Uninstall
      // deletes a non-active version's files only (ADR-0008). The active
      // version offers neither: re-using it is a no-op, and deleting its
      // files invites an immediate reinstall — tool-level Unuse is the
      // way out of an active version.
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      cell: (r) =>
        r.active ? (
          <span className={styles.dim}>—</span>
        ) : (
          <span className={styles.cellActions}>
            <Button
              variant="primary"
              size="sm"
              disabled={disabled}
              onClick={() => onUse(r.version)}
              data-testid={`center-installed-use-${r.version}`}
            >
              {t(I18N_KEYS.tools.actions.use)}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => onUninstall(r.version)}
              data-testid={`center-installed-uninstall-${r.version}`}
            >
              {t(I18N_KEYS.tools.actions.uninstall)}
            </Button>
          </span>
        ),
    },
  ];

  // ---------- Available (remote) sub-list ----------

  const remoteRows = useMemo(
    () =>
      [...(remote.data ?? [])].sort((a, b) => compareVersions(b.version, a.version)),
    [remote.data],
  );

  // Client-side substring filter over the full remote list (issue #133)
  // — sorting and pagination apply to the filtered set.
  const remoteFilter = useTableFilter(remoteRows, (r) =>
    [r.version, r.createdAt ?? ""].join("\n"),
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [storedPageSize, setPageSize] = usePersistentState(
    PAGE_SIZE_STORAGE_KEY,
    MIN_PAGE_SIZE,
  );
  const pageSize = Number.isFinite(storedPageSize)
    ? Math.max(MIN_PAGE_SIZE, storedPageSize)
    : MIN_PAGE_SIZE;

  const total = remoteFilter.rows.length;
  const showPager = total > PAGER_THRESHOLD;
  const totalPages = showPager ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  // Clamp at render time so a page never points past the (possibly
  // shrunken) filtered set.
  const page = showPager ? Math.min(Math.max(1, currentPage), totalPages) : 1;
  const visibleRemoteRows = showPager
    ? remoteFilter.rows.slice((page - 1) * pageSize, page * pageSize)
    : remoteFilter.rows;

  // Reset to the first page whenever the filter changes the result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [remoteFilter.query]);

  const remoteColumns: TableColumn<MiseLsRemoteItem>[] = [
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      cell: (r) => <span className={styles.cellVersion}>{r.version}</span>,
    },
    {
      key: "created",
      header: t(I18N_KEYS.tools.versionCenter.created),
      cell: (r) => (
        <Tooltip text={r.createdAt ?? "—"}>
          <span className={styles.cellSource}>{r.createdAt ?? "—"}</span>
        </Tooltip>
      ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      cell: (r) =>
        installedSet.has(r.version) ? (
          // Already on disk: marked, no action — its actions live in the
          // installed sub-list above.
          <Badge variant="info">{t(I18N_KEYS.tools.versionCenter.installedBadge)}</Badge>
        ) : (
          <span className={styles.cellActions}>
            <Button
              variant="primary"
              size="sm"
              disabled={disabled}
              onClick={() => onUse(r.version)}
              data-testid={`center-remote-use-${r.version}`}
            >
              {t(I18N_KEYS.tools.actions.use)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onInstallOnly(r.version)}
              data-testid={`center-remote-install-${r.version}`}
            >
              {t(I18N_KEYS.tools.actions.install)}
            </Button>
          </span>
        ),
    },
  ];

  const remoteError = remote.error;
  const remoteAppErr =
    remoteError && remoteError.kind === "err" && isAppError(remoteError.err)
      ? remoteError.err
      : null;

  return (
    <div className={styles.center} ref={rootRef} data-testid={`version-center-${tool}`}>
      <section className={styles.subList}>
        <h3 className={styles.subTitle}>{t(I18N_KEYS.tools.versionCenter.installedTitle)}</h3>
        <Table<MiseLsItem>
          columns={installedColumns}
          rows={installedRows}
          rowKey={(r) => `${tool}@${r.version}`}
          empty={
            <EmptyState
              title={t(I18N_KEYS.tools.versionCenter.emptyInstalledTitle)}
              body={t(I18N_KEYS.tools.versionCenter.emptyInstalledBody, { tool })}
            />
          }
        />
      </section>

      <section className={styles.subList}>
        <div className={styles.subHead}>
          <h3 className={styles.subTitle}>{t(I18N_KEYS.tools.versionCenter.availableTitle)}</h3>
          <TableFilter
            value={remoteFilter.query}
            onChange={remoteFilter.setQuery}
            placeholder={t(I18N_KEYS.tools.versionCenter.filterPlaceholder)}
            testId={`center-remote-filter-${tool}`}
          />
        </div>

        {remote.isPending && (
          <div className={styles.loading}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.loadingLabel}>{t(I18N_KEYS.common.loading)}</span>
          </div>
        )}

        {!remote.isPending && remoteError && (
          <div className={styles.errorBlock}>
            <div className={styles.errorLabel}>{t(I18N_KEYS.states.commandFailed.title)}</div>
            <p className={styles.errorBody}>{t(I18N_KEYS.states.commandFailed.body)}</p>
            {remoteAppErr?.stderr ? (
              <pre className={styles.errorStderr}>{remoteAppErr.stderr}</pre>
            ) : null}
          </div>
        )}

        {!remote.isPending && !remoteError && total === 0 && (
          <EmptyState
            title={
              remoteFilter.active
                ? t(I18N_KEYS.common.filter.noMatchTitle)
                : t(I18N_KEYS.tools.versionCenter.emptyAvailableTitle)
            }
            body={
              remoteFilter.active
                ? t(I18N_KEYS.common.filter.noMatchBody)
                : t(I18N_KEYS.tools.versionCenter.emptyAvailableBody, { tool })
            }
          />
        )}

        {!remote.isPending && !remoteError && total > 0 && (
          <>
            <Table<MiseLsRemoteItem>
              columns={remoteColumns}
              rows={visibleRemoteRows}
              rowKey={(r) => `${tool}@remote:${r.version}`}
            />
            {showPager && (
              <Pagination
                total={total}
                pageSize={pageSize}
                currentPage={page}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                minPageSize={MIN_PAGE_SIZE}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
