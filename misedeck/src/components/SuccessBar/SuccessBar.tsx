// SuccessBar — the short-lived in-page success confirmation (issue #144,
// beta11 feedback 3-c). A mutation that succeeds closes the loop where
// the user acted: the bar names what happened (e.g. "node@22.11.0
// installed and activated") and auto-dismisses after a few seconds.
// Failures are not its job — they still auto-open the execution panel.
// The message is passed by the caller, already translated; the bar
// renders no copy of its own and never echoes the command — the exact
// command is the execution panel's teaching role (ADR-0005), not the
// bar's.

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./SuccessBar.module.css";

/** Time on screen before the bar dismisses itself ("a few seconds",
 *  beta11 3-c). */
const DISMISS_AFTER_MS = 4000;

interface SuccessBarProps {
  /** What happened, already translated by the caller; null hides the
   *  bar. Every new success re-arms the auto-dismiss timer — see
   *  `tick`. */
  message: ReactNode;
  /** Bumped by the caller on every new success, even one whose message
   *  is identical to the current one. Setting the same message twice is
   *  a React state no-op, so without a bump the bar never hears about
   *  the second success and its timer expires early (issue #172: two
   *  rapid Adds of the same key must each get a full on-screen
   *  window). */
  tick?: number;
  /** Called when the auto-dismiss timer fires, so the parent can clear
   *  its state. Read through a ref at fire time, so callers may pass a
   *  fresh inline closure without restarting the timer on re-render. */
  onDismiss: () => void;
}

export function SuccessBar({ message, tick, onDismiss }: SuccessBarProps) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (message === null || message === undefined) return;
    const timer = setTimeout(() => onDismissRef.current(), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [message, tick]);

  if (message === null || message === undefined) return null;

  return (
    <div className={styles.bar} role="status" data-testid="success-bar">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.message}>{message}</span>
    </div>
  );
}
