// ExecutionPanel — the docked panel that shows the exact mise command
// being run, streams stdout/stderr lines, and reports exit status.
// Per docs/design/visual-language.md the deck is the product's signature
// behavior: every invocation echoes the command + live logs (ADR-0005 —
// reads included, not just mutations).
//
// Because the panel *is* the command history, it also owns the
// copy-command affordance (issue #72): one click puts the echoed command
// line on the clipboard.
//
// The state machine is lifted to `useExecutionContext` so any page can
// trigger an install, self-update, or arbitrary mise command. The
// panel itself is presentational.

import { useEffect, useRef, useState } from "react";
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
 *
 * Exported so confirmations (e.g. the uninstall dialog, issue #56) can
 * show the exact command that will run — identical to what the deck
 * echoes once the mutation dispatches.
 */
export function commandEcho(
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
  // Transient "Copied" acknowledgement for the copy affordance.
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  // Auto-scroll to bottom unless the user has scrolled up.
  useEffect(() => {
    if (!logRef.current || !stickToBottomRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.lines.length]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const handleScroll = () => {
    if (!logRef.current) return;
    const el = logRef.current;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 24;
  };

  const echo = state.request
    ? commandEcho(state.kind, state.request.cwd, state.request.args)
    : null;

  // Copy the current/most recent command (issue #72). The panel is the
  // command history, so this is where copy lives; what lands on the
  // clipboard is the same echo shown above — a dispatchable command
  // line, never a paraphrase.
  const onCopy = async () => {
    if (!echo) return;
    if (!(await writeClipboard(echo))) return;
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1500);
  };

  if (!state.isOpen) return null;

  return (
    <div className={styles.deck}>
      <div className={styles.deckInner}>
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
              </>
            )}
            {state.status === "cancelled" && (
              <>
                <span className={styles.statusDot} data-tone="dim" />
                <span className={styles.statusLabel}>
                  {t(I18N_KEYS.execution.statusCancelled)}
                </span>
              </>
            )}
            {echo && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => void onCopy()}
                title={t(I18N_KEYS.execution.copyHint)}
                data-testid="execution-copy-command"
              >
                {copied ? t(I18N_KEYS.execution.copied) : t(I18N_KEYS.execution.copy)}
              </button>
            )}
            {state.status === "running" && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={cancel}
                aria-label={t(I18N_KEYS.execution.cancel)}
              >
                {t(I18N_KEYS.execution.cancel)}
              </button>
            )}
            {(state.status === "ok" ||
              state.status === "failed" ||
              state.status === "cancelled") && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={dismiss}
                aria-label={t(I18N_KEYS.execution.dismiss)}
              >
                {t(I18N_KEYS.execution.dismiss)}
              </button>
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
    </div>
  );
}

/** Write text to the clipboard, falling back to a hidden textarea when
 *  the async Clipboard API is unavailable or refused. Returns whether
 *  the copy landed, so the caller only acknowledges real copies. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
