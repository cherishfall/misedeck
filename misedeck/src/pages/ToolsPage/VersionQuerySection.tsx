// VersionQuerySection — a reusable query block for the Tools page's
// installed/remote version sections (issue #55, pagination added in #70).
//
//   * installed → mise ls --json <tool>   (every version, active or not)
//   * remote    → mise ls-remote --json <tool>  (upstream versions)
//
// Both require a non-empty tool name before running. Results paginate
// client-side once they exceed 10 rows (mise offers no --limit /
// --offset, so the full set is fetched and sliced here). The exact mise
// command is shown as the section's command hint so the GUI keeps
// teaching the CLI. Read-only queries skip the execution panel
// (architecture.md); only the remote rows' install hand-off routes
// through it.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { isAppError } from "../../api/mise";
import type { JsonResult } from "../../types/tauri";
import { Button, EmptyState, Pagination, Table, type TableColumn } from "../../components";
import { useExecutionContext } from "../../components/ExecutionPanel";

import styles from "./VersionQuerySection.module.css";

/** Below this row count the whole result renders with no pager. */
const PAGER_THRESHOLD = 10;
/** Page-size floor; values below reset to this on commit. */
const MIN_PAGE_SIZE = 10;

interface VersionQuerySectionProps<TRow> {
  /** Section heading (e.g. "Installed versions"). */
  title: string;
  /** The exact mise command being run, e.g. `mise ls node` — shown as
   *  the section's command hint (CLI vocabulary). */
  command: string;
  /** True once the user has run a query for a tool. */
  hasQuery: boolean;
  /** The live input value (controlled by the parent). */
  inputValue: string;
  onInputChange: (value: string) => void;
  /** Commit the current input and run the query. */
  onRun: () => void;
  /** Clear the input and the results. */
  onClear: () => void;
  /** Whether Run is allowed (non-empty input and not mid-mutation). */
  canRun: boolean;
  isPending: boolean;
  error: JsonResult | null;
  columns: TableColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  toolPlaceholder: string;
  runLabel: string;
  clearLabel: string;
  emptyTitle: string;
  emptyBody: string;
}

export function VersionQuerySection<TRow>({
  title,
  command,
  hasQuery,
  inputValue,
  onInputChange,
  onRun,
  onClear,
  canRun,
  isPending,
  error,
  columns,
  rows,
  rowKey,
  toolPlaceholder,
  runLabel,
  clearLabel,
  emptyTitle,
  emptyBody,
}: VersionQuerySectionProps<TRow>) {
  const { t } = useTranslation();
  // Only one in-flight execution panel mutation at a time; surface the
  // running state so a remote row's install hand-off disables Run.
  const { state: execState } = useExecutionContext();
  const isMutationRunning = execState.status === "running";

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(MIN_PAGE_SIZE);

  const total = rows.length;
  const showPager = total > PAGER_THRESHOLD;
  const totalPages = showPager ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  // Clamp at render time so a page never points past the (possibly
  // shrunken) result set — e.g. right after an uninstall empties the
  // last page.
  const page = showPager ? Math.min(Math.max(1, currentPage), totalPages) : 1;
  const visibleRows = showPager
    ? rows.slice((page - 1) * pageSize, page * pageSize)
    : rows;

  // Keep the controlled currentPage in bounds when the result set
  // shrinks: if the last page just emptied, step back automatically so
  // the user never lands on a blank page.
  useEffect(() => {
    setCurrentPage((p) => {
      const tp = totalPages;
      return p > tp ? tp : p;
    });
  }, [totalPages]);

  const handleRun = () => {
    setCurrentPage(1);
    onRun();
  };

  const handleClear = () => {
    setCurrentPage(1);
    setPageSize(MIN_PAGE_SIZE);
    onClear();
  };

  return (
    <section className={styles.section} data-testid={`versions-${title}`}>
      <header className={styles.head}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {hasQuery && (
          <p className={styles.command} data-testid="versions-command">
            {command}
          </p>
        )}
      </header>

      <div className={styles.queryRow}>
        <input
          type="text"
          className={styles.input}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={toolPlaceholder}
          disabled={isMutationRunning}
          spellCheck={false}
          autoComplete="off"
          data-testid="versions-tool-input"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleRun}
          disabled={!canRun || isMutationRunning}
          data-testid="versions-run"
        >
          {runLabel}
        </Button>
        {hasQuery && (
          <button
            type="button"
            className={styles.clear}
            onClick={handleClear}
            disabled={isMutationRunning}
            data-testid="versions-clear"
          >
            {clearLabel}
          </button>
        )}
      </div>

      {hasQuery && (
        <>
          {isPending && (
            <div className={styles.loading}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.loadingLabel}>{t(I18N_KEYS.common.loading)}</span>
            </div>
          )}

          {!isPending && error && (
            <div className={styles.errorBlock}>
              <div className={styles.errorLabel}>
                {t(I18N_KEYS.states.commandFailed.title)}
              </div>
              <p className={styles.errorBody}>
                {t(I18N_KEYS.states.commandFailed.body)}
              </p>
              {(() => {
                const appErr =
                  error.kind === "err" && isAppError(error.err) ? error.err : null;
                return appErr?.stderr ? (
                  <pre className={styles.errorStderr}>{appErr.stderr}</pre>
                ) : null;
              })()}
            </div>
          )}

          {!isPending && !error && rows.length === 0 && (
            <EmptyState eyebrow={title} title={emptyTitle} body={emptyBody} />
          )}

          {!isPending && !error && rows.length > 0 && (
            <>
              <Table<TRow>
                columns={columns}
                rows={visibleRows}
                rowKey={(r) => rowKey(r)}
                empty={<EmptyState eyebrow={title} title={emptyTitle} body={emptyBody} />}
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
        </>
      )}
    </section>
  );
}
