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
// panel itself is presentational. The command echo itself lives in
// `commandEcho.ts` (pure, unit-tested; issue #191).

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { usePersistentState } from "../../hooks/usePersistentState";
import { Tooltip } from "../Tooltip";
import { IconButton } from "../IconButton/IconButton";
import { Button } from "../Button/Button";
import { writeClipboard } from "../../utils/clipboard";
import { resolveAppErrorMessage } from "../../utils/appError";
import { useExecutionContext } from "./ExecutionContext";
import { commandEcho } from "./commandEcho";
import type { ExecutionStatus } from "./useExecution";
import styles from "./ExecutionPanel.module.css";

export { commandEcho } from "./commandEcho";

/** localStorage key for the persisted panel height (issue #108). */
const PANEL_HEIGHT_KEY = "misedeck.panelHeight.v1";
/** Log-area height bounds in px; the default matches the CSS `max-height`. */
const DEFAULT_PANEL_HEIGHT = 240;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 600;
/** Keyboard resize step — one text line at the panel's data size. */
const RESIZE_STEP = 16;

function clampPanelHeight(px: number): number {
  return Math.round(Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, px)));
}

/** Map a run's status to the status-dot tone used by the run switcher. */
function runTone(status: ExecutionStatus): "beam" | "ok" | "fail" | "dim" {
  switch (status) {
    case "running":
      return "beam";
    case "ok":
      return "ok";
    case "failed":
      return "fail";
    case "cancelled":
      return "dim";
    default:
      return "dim";
  }
}

export function ExecutionPanel() {
  const { t } = useTranslation();
  const { state, runs, activeRunId, selectRun, removeRun, clearRuns, cancel, dismiss } =
    useExecutionContext();
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // Transient "Copied" / "Copy failed" acknowledgement for the copy
  // affordance. A failed copy must not be silent (issue #183).
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  // Log height is user-adjustable via the top-edge drag handle and
  // persists across restarts (issue #108); a corrupt or out-of-range
  // stored value clamps into bounds.
  const [storedHeight, setStoredHeight] = usePersistentState(PANEL_HEIGHT_KEY, DEFAULT_PANEL_HEIGHT);
  const panelHeight = Number.isFinite(storedHeight)
    ? clampPanelHeight(storedHeight)
    : DEFAULT_PANEL_HEIGHT;

  // Drag the panel's top edge to resize: moving up grows the log. Same
  // pointer pattern as the table column resize (issue #104).
  //
  // The window listeners come off on pointerup / pointercancel, and the
  // unmount effect below covers the case where the panel goes away
  // mid-drag (issue #290).
  const endGestureRef = useRef<(() => void) | null>(null);
  const beginHeightResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = clampPanelHeight(startHeight + (startY - ev.clientY));
      setStoredHeight((prev) => (prev === next ? prev : next));
    };
    // `pointercancel` ends the gesture without a `pointerup` (the OS or
    // browser took the pointer, e.g. touch scroll): without it the window
    // listeners and the `userSelect: none` lock outlive the drag (#209).
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.body.style.userSelect = previousUserSelect;
      endGestureRef.current = null;
    };
    endGestureRef.current = onEnd;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  // Keyboard path for the same handle (issue #257): the separator takes
  // focus and ArrowUp / ArrowDown resize by the same clamped step the
  // pointer uses. Without this the control was pointer-only.
  const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const delta = e.key === "ArrowUp" ? RESIZE_STEP : -RESIZE_STEP;
    setStoredHeight(clampPanelHeight(panelHeight + delta));
  };

  // A run switch is a fresh transcript (issue #209): re-arm the
  // auto-scroll so the newly selected run lands at its bottom even if
  // the user had scrolled up in the previous one.
  useEffect(() => {
    stickToBottomRef.current = true;
  }, [activeRunId]);

  // Auto-scroll to bottom unless the user has scrolled up. Keyed on the
  // active run too, so two runs with the same line count still scroll.
  useEffect(() => {
    if (!logRef.current || !stickToBottomRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.lines.length, activeRunId]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  // A drag still in flight when the panel unmounts would otherwise leak
  // its window listeners and the body's `user-select: none` lock (#290).
  useEffect(
    () => () => {
      endGestureRef.current?.();
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
    const ok = await writeClipboard(echo);
    setCopied(ok);
    setCopyFailed(!ok);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
      copiedTimerRef.current = null;
    }, 1500);
  };

  if (!state.isOpen) return null;

  const showSwitcher = runs.length > 1;
  const runningCount = runs.filter((r) => r.status === "running").length;
  const finishedCount = runs.length - runningCount;

  return (
    <div className={styles.deck}>
      {/* A focusable window splitter (issue #257): pointer drag plus
          ArrowUp / ArrowDown, with the current log height exposed through
          aria-valuenow. It is no longer aria-hidden — a control with no
          keyboard path is not an acceptable "decorative" element. */}
      <div
        className={styles.heightHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t(I18N_KEYS.execution.resizeHandle)}
        aria-valuenow={panelHeight}
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={MAX_PANEL_HEIGHT}
        tabIndex={0}
        onPointerDown={beginHeightResize}
        onKeyDown={onHandleKeyDown}
      />
      <div className={styles.deckInner}>
        {showSwitcher && (
          // Run selection is a button group, not a tablist (issue #257):
          // the row also holds per-run close buttons and Clear, so the
          // tabs pattern (roving tabindex, arrow keys, aria-controls →
          // tabpanel) cannot describe it honestly. aria-pressed matches
          // the actual click-to-switch behaviour.
          <div
            className={styles.switcher}
            role="group"
            aria-label={t(I18N_KEYS.execution.title)}
          >
            <span className={styles.switcherCount}>
              {runningCount > 0
                ? t(I18N_KEYS.execution.runsRunning, { count: runningCount })
                : t(I18N_KEYS.execution.runsRecent, { count: runs.length })}
            </span>
            {runs.map((r) => {
              const echo = commandEcho(r.kind, r.request.cwd, r.request.args);
              const finished = r.status !== "running";
              return (
                <span key={r.id} className={styles.runChipWrap}>
                  <button
                    type="button"
                    className={styles.runChip}
                    data-active={r.id === activeRunId}
                    aria-pressed={r.id === activeRunId}
                    onClick={() => selectRun(r.id)}
                    title={echo}
                    data-testid="execution-run-chip"
                  >
                    <span className={styles.statusDot} data-tone={runTone(r.status)} />
                    <span className={styles.runChipLabel}>{echo}</span>
                  </button>
                  {finished && (
                    <IconButton
                      aria-label={t(I18N_KEYS.execution.closeRun)}
                      size="sm"
                      onClick={() => removeRun(r.id)}
                      data-testid="execution-run-close"
                    >
                      ×
                    </IconButton>
                  )}
                </span>
              );
            })}
            {finishedCount > 0 && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={clearRuns}
                data-testid="execution-clear-finished"
              >
                {t(I18N_KEYS.common.clear)}
              </button>
            )}
          </div>
        )}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.label}>{t(I18N_KEYS.execution.title)}</span>
            {echo && (
              <Tooltip text={echo}>
                <span className={styles.command}>{echo}</span>
              </Tooltip>
            )}
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
                  {state.exitCode === null
                    ? t(I18N_KEYS.execution.statusFailedNoCode, {
                        duration: (state.durationMs / 1000).toFixed(1),
                      })
                    : t(I18N_KEYS.execution.statusFailed, {
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
                {copyFailed
                  ? t(I18N_KEYS.common.copyFailed)
                  : copied
                    ? t(I18N_KEYS.common.copied)
                    : t(I18N_KEYS.execution.copy)}
              </button>
            )}
            {state.status === "running" && (
              <Button variant="secondary" size="sm" onClick={cancel}>
                {t(I18N_KEYS.execution.cancel)}
              </Button>
            )}
            {/* Dismiss is a panel fixture (issue #197): rendered
             * unconditionally while the panel is open, always rightmost.
             * It only minimizes the panel (closes `isOpen`; runs and
             * in-flight commands are untouched) — it is not a cancel. */}
            <button
              type="button"
              className={styles.actionBtn}
              onClick={dismiss}
              aria-label={t(I18N_KEYS.execution.dismiss)}
            >
              {t(I18N_KEYS.execution.dismiss)}
            </button>
          </div>
        </div>
        {/* A failed cancel keeps the run going, so the panel must not
            look like it stopped (issue #262). The same Cancel button is
            the retry; the row disappears when the run actually ends. */}
        {state.status === "running" && state.cancelError && (
          <div
            className={styles.cancelFailure}
            role="alert"
            data-testid="execution-cancel-failed"
          >
            <span>{t(I18N_KEYS.execution.cancelFailed)}</span>
            {state.cancelError.message && (
              <span className={styles.cancelFailureDetail}>
                {resolveAppErrorMessage(state.cancelError.message, t)}
              </span>
            )}
          </div>
        )}
        {/* Global-mode disclosure (#191): the echo omits the runner's
            `-C $HOME` anchor, so the directory it actually runs in is
            stated separately. `selfUpdate` counts — it runs anchored
            at home too; `install` does not (its echo is the script,
            which has no directory context). */}
        {echo &&
          (state.kind === "mise" || state.kind === "selfUpdate") &&
          state.request?.cwd === null && (
            <div className={styles.workingDir}>
              {t(I18N_KEYS.execution.workingDirHome)}
            </div>
          )}
        <div
          ref={logRef}
          onScroll={handleScroll}
          className={styles.log}
          style={{ maxHeight: panelHeight }}
          role="region"
          aria-label={t(I18N_KEYS.execution.logLabel)}
          tabIndex={0}
          data-testid="execution-log"
        >
          {state.lines.length === 0 && state.status === "idle" && (
            <div className={styles.emptyHint}>{t(I18N_KEYS.execution.emptyHint)}</div>
          )}
          {state.lines.map((line, i) =>
            line.stream === "notice" ? (
              <div
                key={i}
                className={styles.notice}
                data-stream="notice"
                data-testid="execution-output-truncated"
              >
                {t(I18N_KEYS.execution.outputTruncated, {
                  stream: line.source,
                })}
              </div>
            ) : (
              <div key={i} className={styles.line} data-stream={line.stream}>
                {line.text}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

