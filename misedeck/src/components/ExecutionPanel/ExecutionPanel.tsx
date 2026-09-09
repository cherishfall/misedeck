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

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { usePersistentState } from "../../hooks/usePersistentState";
import { writeClipboard } from "../../utils/clipboard";
import { useExecutionContext } from "./ExecutionContext";
import styles from "./ExecutionPanel.module.css";

/** localStorage key for the persisted panel height (issue #108). */
const PANEL_HEIGHT_KEY = "misedeck.panelHeight.v1";
/** Log-area height bounds in px; the default matches the CSS `max-height`. */
const DEFAULT_PANEL_HEIGHT = 240;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 600;

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
    // `--yes` is what the runner really passes (issue #125): the CLI's
    // own `[Y/n]` prompt is bypassed, the GUI confirms first instead.
    parts.push("self-update", "--yes");
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

  // Log height is user-adjustable via the top-edge drag handle and
  // persists across restarts (issue #108); a corrupt or out-of-range
  // stored value clamps into bounds.
  const [storedHeight, setStoredHeight] = usePersistentState(PANEL_HEIGHT_KEY, DEFAULT_PANEL_HEIGHT);
  const panelHeight = Number.isFinite(storedHeight)
    ? Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, storedHeight))
    : DEFAULT_PANEL_HEIGHT;

  // Drag the panel's top edge to resize: moving up grows the log. Same
  // pointer pattern as the table column resize (issue #104).
  const beginHeightResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;
    const clamp = (px: number) =>
      Math.round(Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, px)));
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = clamp(startHeight + (startY - ev.clientY));
      setStoredHeight((prev) => (prev === next ? prev : next));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = previousUserSelect;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

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
      <div
        className={styles.heightHandle}
        aria-hidden="true"
        onPointerDown={beginHeightResize}
      />
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
          style={{ maxHeight: panelHeight }}
          data-testid="execution-log"
        >
          {state.lines.length === 0 && state.status === "idle" && (
            <div className={styles.emptyHint}>{t(I18N_KEYS.execution.emptyHint)}</div>
          )}
          {state.lines.map((line, i) => (
            <div
              key={i}
              className={styles.line}
              data-stream={line.stream}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

