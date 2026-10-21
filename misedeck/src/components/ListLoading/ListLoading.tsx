// ListLoading — the shared list-level loading state (issue #146).
//
// Every page whose content is a data list gates on its list query, not
// just on mise detection: while the list read is pending (first load or
// a directory switch) the page renders this state instead of its empty
// state, so "no data" never flashes before the rows arrive. An empty
// state means the query finished with nothing — it is a terminal state,
// not a loading one.
//
// The state keeps the page's own header (title + command hint) so a slow
// read still looks like the page it belongs to, not a bare spinner
// (V-8, issue #262). The header is layout only; pages own the copy and
// pass it in.
//
// One implementation for the whole app: the Tools / Env / Tasks /
// Settings / Preview gates all render this component. Per-page loading
// copies are a bug (the beta11 H1 sweep removed them; the Doctor copy was
// folded back in for issue #262).

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { CommandHint } from "../CommandHint/CommandHint";
import { PageShell } from "../PageShell/PageShell";
import { ProgressDot } from "../ProgressDot/ProgressDot";

import styles from "./ListLoading.module.css";

interface ListLoadingProps {
  /** The page title, rendered exactly as the loaded page renders it. */
  title: string;
  /** The page's command-hint line, rendered exactly as when loaded. */
  commandHint: string;
}

export function ListLoading({ title, commandHint }: ListLoadingProps) {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{title}</h1>
          <CommandHint>{commandHint}</CommandHint>
        </header>
        <div className={styles.loading} role="status">
          <ProgressDot tone="dim" />
          <span>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}
