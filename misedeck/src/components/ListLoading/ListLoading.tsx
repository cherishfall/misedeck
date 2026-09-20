// ListLoading — the shared list-level loading state (issue #146).
//
// Every page whose content is a data list gates on its list query, not
// just on mise detection: while the list read is pending (first load or
// a directory switch) the page renders this state instead of its empty
// state, so "no data" never flashes before the rows arrive. An empty
// state means the query finished with nothing — it is a terminal state,
// not a loading one.
//
// One implementation for the whole app: the Tools / Env / Tasks /
// Settings / Preview gates all render this component. Per-page loading
// copies are a bug (the beta11 H1 sweep removed them).

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { PageShell } from "../PageShell/PageShell";
import { ProgressDot } from "../ProgressDot/ProgressDot";

import styles from "./ListLoading.module.css";

export function ListLoading() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <div className={styles.loading}>
          <ProgressDot tone="dim" />
          <span>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}
