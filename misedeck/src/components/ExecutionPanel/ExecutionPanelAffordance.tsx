// Persistent affordance that re-opens the execution panel when a run is
// active or history exists. Rendered by PageShell so it is reachable from
// any page, including read-only ones.

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useExecutionContext } from "./ExecutionContext";
import styles from "./ExecutionPanel.module.css";

export function ExecutionPanelAffordance() {
  const { t } = useTranslation();
  const { state, openPanel } = useExecutionContext();

  if (state.isOpen) return null;

  const hasActivity = state.status !== "idle";
  if (!hasActivity) return null;

  const tone =
    state.status === "running"
      ? "beam"
      : state.status === "ok"
        ? "ok"
        : state.status === "failed"
          ? "fail"
          : "dim";

  return (
    <button
      type="button"
      className={styles.affordance}
      onClick={openPanel}
      aria-label={t(I18N_KEYS.execution.reopen)}
    >
      <span className={styles.affordanceDot} data-tone={tone} />
      <span className={styles.affordanceLabel}>
        {state.status === "running"
          ? t(I18N_KEYS.execution.reopenRunning)
          : t(I18N_KEYS.execution.reopen)}
      </span>
    </button>
  );
}
