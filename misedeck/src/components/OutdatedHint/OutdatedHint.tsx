// OutdatedHint — the shared toolbar hint reporting how many tools are
// outdated (issue #114). One component owns all four states — loading,
// n>0, all-up-to-date, failed — so every toolbar behaves identically and
// the count is interpolated, never concatenated. A failed query renders
// as failure (muted copy + retry), never as loading (issue #199): the
// query has no self-healing (retry: false), so a faked loading state
// would sit there forever.

import { useTranslation } from "react-i18next";

import { Button } from "../Button/Button";
import { I18N_KEYS } from "../../i18n/keys";
import { outdatedHintKey, type OutdatedHintStatus } from "./outdatedHintText";
import styles from "./OutdatedHint.module.css";

export type { OutdatedHintStatus };

export interface OutdatedHintProps {
  /** Which upstream state to render: query pending, succeeded, or failed. */
  status: OutdatedHintStatus;
  /** Outdated tool count; read only when `status` is "ok". */
  count: number;
  /** Recovery path for the failed state: re-runs the outdated query. */
  onRetry: () => void;
}

export function OutdatedHint({ status, count, onRetry }: OutdatedHintProps) {
  const { t } = useTranslation();
  return (
    <span className={styles.hint}>
      {t(outdatedHintKey(status, count), { count })}
      {status === "error" && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.retry}
          onClick={onRetry}
          data-testid="outdated-hint-retry"
        >
          {t(I18N_KEYS.common.retry)}
        </Button>
      )}
    </span>
  );
}
