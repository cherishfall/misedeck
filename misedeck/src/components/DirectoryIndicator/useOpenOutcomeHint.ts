// useOpenOutcomeHint — the DirectoryIndicator strip's transient hint line,
// driven by an open-in-terminal outcome (issue #228) and shared with the
// strip's failed-pick message.
//
// Lifecycle (restructured for issue #298): the hint sits on a 4 s dismiss
// timer armed by whoever set it, and that timer is the ONLY thing that
// takes an outcome hint down. Two earlier designs failed:
//   - clearing only the timer on cleanup stranded a stale-language line
//     forever after a locale switch inside the window (#290);
//   - dismissing from the outcome effect's cleanup cleared the hint one
//     frame after it appeared, because production's `consumeOpenOutcome`
//     nulls the outcome and the effect re-runs through its cleanup
//     (#298 — the old test's fake `consume` never changed the outcome, so
//     the production wiring was untested).
// Now the outcome effect shows + consumes with no dismissal cleanup, and
// the visible line is re-resolved through the CURRENT formatter on every
// render — a locale switch rewrites it in place (it never goes stale, and
// it never strands: the timer still fires).

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

/** Internal store: an outcome hint keeps the outcome so the text can be
 *  re-resolved in the current locale at render time; a direct `show`
 *  hint (the failed-pick path) keeps its finished text. */
interface StoredHint {
  kind: TransientHint["kind"];
  outcome: OpenTerminalOutcome | null;
  text: string;
}

export function useOpenOutcomeHint(
  openOutcome: OpenTerminalOutcome | null,
  consumeOpenOutcome: () => unknown,
  format: OutcomeHintFormatter,
  dismissMs: number = HINT_DISMISS_MS,
): OpenOutcomeHint {
  const [stored, setStored] = useState<StoredHint | null>(null);
  const hintTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (hintTimer.current !== null) {
      window.clearTimeout(hintTimer.current);
      hintTimer.current = null;
    }
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    hintTimer.current = window.setTimeout(() => {
      setStored(null);
      hintTimer.current = null;
    }, dismissMs);
  }, [clearTimer, dismissMs]);

  const dismiss = useCallback(() => {
    clearTimer();
    setStored(null);
  }, [clearTimer]);

  const show = useCallback(
    (kind: TransientHint["kind"], text: string) => {
      setStored({ kind, outcome: null, text });
      armTimer();
    },
    [armTimer],
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
    setStored({ kind: next.kind, outcome: openOutcome, text: next.text });
    armTimer();
  }, [openOutcome, consumeOpenOutcome, format, armTimer]);

  // The visible line resolves through the CURRENT formatter at render
  // time: a locale switch re-renders the strip with a new `format`, and
  // the outcome hint rewrites itself in place — no stale-language line,
  // no stranded line, no extra effect.
  const hint: TransientHint | null = stored
    ? {
        kind: stored.kind,
        text: stored.outcome ? format(stored.outcome).text : stored.text,
      }
    : null;

  return { hint, show, dismiss };
}
