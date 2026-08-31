// ExecutionPanel — the docked panel that shows the exact mise command
// being run, streams stdout/stderr lines, and reports exit status.
// Per docs/design/visual-language.md the deck is the product's signature
// behavior: every mutation echoes the command + live logs.
//
// The state machine is lifted to `useExecutionContext` so any page can
// trigger an install, self-update, or arbitrary mise command. The
// panel itself is presentational.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useExecutionContext } from "./ExecutionContext";
import styles from "./ExecutionPanel.module.css";

/**
 * Build the human-readable command echo (what the user would type in
 * a terminal) for the active execution. `mise` runs an arbitrary
 * command; `install` runs the official install script (the actual
 * platform-specific command is built in Rust); `selfUpdate` runs
 * `mise self-update`.
 */
function commandEcho(
  kind: "mise" | "install" | "selfUpdate",
  cwd: string | null,
  args: string[],
): string {
  if (kind === "install") {
    return "curl -fsSL https://mise.jdx.dev/install.sh | sh";
  }
  if (kind === "selfUpdate") {
    const parts: string[] = ["mise"];
    if (cwd) parts.push("-C", cwd);
    parts.push("self-update");
    return parts.join(" ");
  }
  const parts: string[] = ["mise"];
  if (cwd) parts.push("-C", cwd);
  for (const a of args) {
    if (a.includes(" ") || a.includes("\t")) {
      parts.push(JSON.stringify(a));
    } else {
      parts.push(a);
    }
  }
  return parts.join(" ");
}

export function ExecutionPanel() {
  const { t } = useTranslation();
  const { state, cancel, dismiss } = useExecutionContext();
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // Auto-scroll to bottom unless the user has scrolled up.
  useEffect(() => {
    if (!logRef.current || !stickToBottomRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.lines.length]);

  const handleScroll = () => {
    if (!logRef.current) return;
    const el = logRef.current;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 24;
  };

  const echo = state.request
    ? commandEcho(state.kind, state.request.cwd, state.request.args)
    : null;

  return (
    <div className={styles.deck}>
      <div className={styles.signalLine} aria-hidden="true" />
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.label}>{t(I18N_KEYS.execution.title)}</span>
          {echo && <span className={styles.command}>{echo}</span>}
        </div>
        <div className={styles.headerRight}>
          {state.status === "running" && (
            <>
              <span className={styles.statusDot} data-tone="beam" />
              <span className={styles.statusLabel}>{t(I18N_KEYS.execution.statusRunning)}</span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={cancel}
                aria-label={t(I18N_KEYS.execution.cancel)}
              >
                {t(I18N_KEYS.execution.cancel)}
              </button>
            </>
          )}
          {state.status === "ok" && (
            <>
              <span className={styles.statusDot} data-tone="ok" />
              <span className={styles.statusLabel}>
                {t(I18N_KEYS.execution.statusOk, {
                  duration: (state.durationMs / 1000).toFixed(1),
                })}
              </span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={dismiss}
                aria-label={t(I18N_KEYS.execution.dismiss)}
              >
                ×
              </button>
            </>
          )}
          {state.status === "failed" && (
            <>
              <span className={styles.statusDot} data-tone="fail" />
              <span className={styles.statusLabel}>
                {t(I18N_KEYS.execution.statusFailed, {
                  duration: (state.durationMs / 1000).toFixed(1),
                  code: state.exitCode,
                })}
              </span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={dismiss}
                aria-label={t(I18N_KEYS.execution.dismiss)}
              >
                ×
              </button>
            </>
          )}
          {state.status === "cancelled" && (
            <>
              <span className={styles.statusDot} data-tone="dim" />
              <span className={styles.statusLabel}>
                {t(I18N_KEYS.execution.statusCancelled)}
              </span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={dismiss}
                aria-label={t(I18N_KEYS.execution.dismiss)}
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>
      <div
        ref={logRef}
        onScroll={handleScroll}
        className={styles.log}
        data-testid="execution-log"
      >
        {state.lines.length === 0 && state.status === "idle" && (
          <div className={styles.emptyHint}>{t(I18N_KEYS.execution.emptyHint)}</div>
        )}
        {state.lines.map((line, i) => (
          <div
            key={i}
            className={line.stream === "stderr" ? styles.stderrLine : styles.stdoutLine}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
