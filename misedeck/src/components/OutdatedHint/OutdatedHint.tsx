// OutdatedHint — the shared toolbar hint reporting how many tools are
// outdated (issue #114). One component owns all three states — loading,
// n>0, all-up-to-date — so every toolbar behaves identically and the
// count is interpolated, never concatenated.

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import styles from "./OutdatedHint.module.css";

export interface OutdatedHintProps {
  /** Outdated tool count, or null while the query is still loading. */
  count: number | null;
}

export function OutdatedHint({ count }: OutdatedHintProps) {
  const { t } = useTranslation();
  return (
    <span className={styles.hint}>
      {count == null
        ? t(I18N_KEYS.common.loading)
        : count > 0
          ? t(I18N_KEYS.common.outdatedCount, { count })
          : t(I18N_KEYS.common.allUpToDate)}
    </span>
  );
}
