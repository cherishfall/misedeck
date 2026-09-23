// QueryHint — the shared toolbar hint for a count backed by a
// react-query read (issue #204). One component owns all four states —
// loading, success copy, failed — so every toolbar behaves identically
// and the count is interpolated, never concatenated. A failed query
// renders as failure (muted copy + retry), never as loading (issue
// #199): the queries have no self-healing (retry: false), so a faked
// loading state would sit there forever.

import { useTranslation } from "react-i18next";

import { Button } from "../Button/Button";
import { I18N_KEYS } from "../../i18n/keys";
import styles from "./QueryHint.module.css";

/** The upstream query state, dispatched explicitly by the consumer —
 *  a `null` count must never double as "loading" (issue #199). */
export type QueryHintStatus = "loading" | "ok" | "error";

export interface QueryHintProps {
  /** Which upstream state to render: query pending, succeeded, or failed. */
  status: QueryHintStatus;
  /** Success copy; read only when `status` is "ok". */
  text: string;
  /** Recovery path for the failed state: re-runs the upstream query. */
  onRetry: () => void;
}

export function QueryHint({ status, text, onRetry }: QueryHintProps) {
  const { t } = useTranslation();
  return (
    <span className={styles.hint}>
      {status === "loading"
        ? t(I18N_KEYS.common.loading)
        : status === "error"
          ? t(I18N_KEYS.common.loadFailed)
          : text}
      {status === "error" && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.retry}
          onClick={onRetry}
          data-testid="query-hint-retry"
        >
          {t(I18N_KEYS.common.retry)}
        </Button>
      )}
    </span>
  );
}
