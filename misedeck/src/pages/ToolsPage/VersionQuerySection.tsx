// VersionQuerySection — a reusable query block for the Tools page's
// installed/remote version sections (issue #55).
//
//   * installed → mise ls --json <tool>   (every version, active or not)
//   * remote    → mise ls-remote --json <tool>  (upstream versions)
//
// Both require a non-empty tool name before running. Results fold past
// ~10 rows behind a "Show all N" affordance and are clearable (clears
// the input and the results). The exact mise command is shown as the
// section's command hint so the GUI keeps teaching the CLI. Read-only
// queries skip the execution panel (architecture.md); only the remote
// rows' install hand-off routes through it.

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { isAppError } from "../../api/mise";
import type { JsonResult } from "../../types/tauri";
import { Button, EmptyState, Table, type TableColumn } from "../../components";
import { useExecutionContext } from "../../components/ExecutionPanel";

import styles from "./VersionQuerySection.module.css";

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
  showAllLabel: (count: number) => string;
  showLessLabel: string;
  emptyTitle: string;
  emptyBody: string;
  /** Rows kept visible before folding; defaults to 10. */
  foldLimit?: number;
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
  showAllLabel,
  showLessLabel,
  emptyTitle,
  emptyBody,
  foldLimit = 10,
}: VersionQuerySectionProps<TRow>) {
  const { t } = useTranslation();
  // Only one in-flight execution panel mutation at a time; surface the
  // running state so a remote row's install hand-off disables Run.
  const { state: execState } = useExecutionContext();
  const isMutationRunning = execState.status === "running";

  const [expanded, setExpanded] = useState(false);
  const folded = rows.length > foldLimit && !expanded;
  const visibleRows = folded ? rows.slice(0, foldLimit) : rows;

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
          onClick={onRun}
          disabled={!canRun || isMutationRunning}
          data-testid="versions-run"
        >
          {runLabel}
        </Button>
        {hasQuery && (
          <button
            type="button"
            className={styles.clear}
            onClick={onClear}
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
              {folded && (
                <button
                  type="button"
                  className={styles.collapseToggle}
                  onClick={() => setExpanded(true)}
                  data-testid="versions-show-all"
                >
                  {showAllLabel(rows.length)}
                </button>
              )}
              {expanded && rows.length > foldLimit && (
                <button
                  type="button"
                  className={styles.collapseToggle}
                  onClick={() => setExpanded(false)}
                  data-testid="versions-show-less"
                >
                  {showLessLabel}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
