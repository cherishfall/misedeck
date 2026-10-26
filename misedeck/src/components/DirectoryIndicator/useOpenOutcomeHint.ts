// useOpenOutcomeHint — the DirectoryIndicator strip's transient hint line,
// driven by an open-in-terminal outcome (issue #228) and shared with the
// strip's failed-pick message.
//
// Extracted from the component so the lifecycle is testable (issue #290):
// the hint sits on a 4 s dismiss timer, and the outcome effect re-runs
// whenever its formatter changes — which `t` does on a locale switch.
// Its cleanup used to clear only the timer, so a locale switch inside
// that window stranded the (now stale-language) hint on screen forever:
// the timer was gone and the effect's `lastOutcome` guard meant nothing
// re-showed it. The cleanup now dismisses both timer and hint.

import { useCallback, useEffect, useRef, useState } from "react";

import type { OpenTerminalOutcome } from "../../state/activationContext";

/** How long the strip's hint line stays on screen. */
export const HINT_DISMISS_MS = 4000;

export interface TransientHint {
  kind: "ok" | "error";
  text: string;
}

/** Turn an outcome into the line to show, in the current locale. */
export type OutcomeHintFormatter = (outcome: OpenTerminalOutcome) => TransientHint;

export interface OpenOutcomeHint {
  hint: TransientHint | null;
  /** Show a hint directly (the strip's failed-pick path). */
  show: (kind: TransientHint["kind"], text: string) => void;
  /** Hide it now and cancel the dismiss timer. */
  dismiss: () => void;
}

export function useOpenOutcomeHint(
  openOutcome: OpenTerminalOutcome | null,
  consumeOpenOutcome: () => unknown,
  format: OutcomeHintFormatter,
  dismissMs: number = HINT_DISMISS_MS,
): OpenOutcomeHint {
  const [hint, setHint] = useState<TransientHint | null>(null);
  const hintTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (hintTimer.current !== null) {
      window.clearTimeout(hintTimer.current);
      hintTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setHint(null);
  }, [clearTimer]);

  const show = useCallback(
    (kind: TransientHint["kind"], text: string) => {
      clearTimer();
      setHint({ kind, text });
      hintTimer.current = window.setTimeout(() => {
        setHint(null);
        hintTimer.current = null;
      }, dismissMs);
    },
    [clearTimer, dismissMs],
  );

  // An unmount clears the timer as well — a pending setState on a dead
  // component is the same contract as CopyButton / Tooltip (#209).
  useEffect(() => dismiss, [dismiss]);

  const lastOutcomeRef = useRef<OpenTerminalOutcome | null>(null);
  useEffect(() => {
    if (!openOutcome) return;
    if (lastOutcomeRef.current === openOutcome) return;
    lastOutcomeRef.current = openOutcome;
    consumeOpenOutcome();
    const next = format(openOutcome);
    show(next.kind, next.text);
    // The formatter changes with the locale. Dismissing on that re-run
    // is the point: the visible line is in the language the user just
    // left, and nothing else would ever take it down (#290).
    return dismiss;
  }, [openOutcome, consumeOpenOutcome, format, show, dismiss]);

  return { hint, show, dismiss };
}
