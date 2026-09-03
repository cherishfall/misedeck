// Pagination — client-side pager for sliced result sets (issue #70).
//
// `mise ls` / `mise ls-remote` expose no `--limit` / `--offset`, so the
// parent slices the full result set and hands this component the total
// count plus the current window. The component owns no data: it reports
// page and page-size changes up through callbacks and clamps both to
// sane bounds before doing so.
//
//   <Pagination total pageSize currentPage onPageChange onPageSizeChange minPageSize={10} />
//
// Behavior:
//   * prev/next step by one and disable at the ends.
//   * page size is a free numeric input; values below `minPageSize` reset
//     to `minPageSize` on commit (no upper bound).
//   * jump-to-page takes any number and clamps it into [1, totalPages].
//   * the pager is only shown by the caller when the row count exceeds the
//     threshold, so this component never renders a "dead" pager.

import { useEffect, useState, type ChangeEvent } from "react";

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { Button } from "../Button/Button";

import styles from "./Pagination.module.css";

export interface PaginationProps {
  /** Total number of rows across every page. */
  total: number;
  /** Rows shown per page (controlled by the parent). */
  pageSize: number;
  /** Current 1-based page (controlled by the parent). */
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Floor for the page-size input; values below reset to this. */
  minPageSize?: number;
}

export function Pagination({
  total,
  pageSize,
  currentPage,
  onPageChange,
  onPageSizeChange,
  minPageSize = 10,
}: PaginationProps) {
  const { t } = useTranslation();
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  const [sizeDraft, setSizeDraft] = useState(String(pageSize));
  const [jumpDraft, setJumpDraft] = useState("");
  // Keep the input in step with the controlled page size (e.g. after a
  // clamp resets it to the minimum).
  useEffect(() => setSizeDraft(String(pageSize)), [pageSize]);

  const commitSize = () => {
    const n = parseInt(sizeDraft, 10);
    if (!Number.isFinite(n) || n < minPageSize) {
      setSizeDraft(String(minPageSize));
      onPageSizeChange(minPageSize);
    } else {
      onPageSizeChange(n);
    }
  };

  const commitJump = () => {
    const n = parseInt(jumpDraft, 10);
    setJumpDraft("");
    if (Number.isFinite(n)) {
      const clamped = Math.min(Math.max(1, n), totalPages);
      onPageChange(clamped);
    }
  };

  return (
    <div className={styles.pager} data-testid="pager">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        data-testid="pager-prev"
      >
        <span aria-hidden="true">‹</span> {t(I18N_KEYS.tools.queries.pagination.prev)}
      </Button>

      <span className={styles.status}>
        {t(I18N_KEYS.tools.queries.pagination.pageOf, {
          current: currentPage,
          total: totalPages,
        })}
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        {t(I18N_KEYS.tools.queries.pagination.total, { count: total })}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        data-testid="pager-next"
      >
        {t(I18N_KEYS.tools.queries.pagination.next)} <span aria-hidden="true">›</span>
      </Button>

      <span className={styles.sizeControl}>
        {t(I18N_KEYS.tools.queries.pagination.pageSize)}
        <input
          type="number"
          className={styles.sizeInput}
          value={sizeDraft}
          min={minPageSize}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSizeDraft(e.target.value)}
          onBlur={commitSize}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          data-testid="pager-page-size"
          aria-label={t(I18N_KEYS.tools.queries.pagination.pageSize)}
        />
        <span className={styles.help}>
          {t(I18N_KEYS.tools.queries.pagination.pageSizeHelp, { min: minPageSize })}
        </span>
      </span>

      <span className={styles.jumpControl}>
        {t(I18N_KEYS.tools.queries.pagination.jumpTo)}
        <input
          type="number"
          className={styles.jumpInput}
          value={jumpDraft}
          min={1}
          max={totalPages}
          placeholder="1"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setJumpDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitJump();
          }}
          data-testid="pager-jump"
          aria-label={t(I18N_KEYS.tools.queries.pagination.jumpTo)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={commitJump}
          data-testid="pager-jump-go"
        >
          {t(I18N_KEYS.tools.queries.pagination.jump)}
        </Button>
      </span>
    </div>
  );
}
