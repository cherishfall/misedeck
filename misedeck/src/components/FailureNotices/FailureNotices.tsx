// FailureNotices — the app's global failure surface (issue #249).
//
// `api/invoke.ts` enqueues every Tauri command rejection unless the
// call site opted out because it renders the failure itself. This
// component subscribes to that module store and renders the live queue
// above the page, in the same Banner vocabulary as the directory,
// activation and chrome notices.
//
// Behavior:
//   * at most three notices, newest last; identical failures dedupe in
//     the store (see `state/failureNotices.ts`);
//   * each notice is an `alert` live region and auto-dismisses after a
//     few seconds, with a keyboard-reachable Dismiss button;
//   * hovering or focusing a notice pauses its timer so a user reading
//     the detail is never raced by the timeout;
//   * focus is never moved or trapped — the notice is plain flow
//     content, not a modal.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FocusEvent } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import {
  dismissFailureNotice,
  getFailureNotices,
  subscribeFailureNotices,
  type FailureNotice,
} from "../../state/failureNotices";
import { resolveAppErrorMessage } from "../../utils/appError";
import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";

import styles from "./FailureNotices.module.css";

/** How long one notice stays on screen. Long enough to read a short
 *  error and reach Dismiss, short enough not to become chrome. */
const DISMISS_AFTER_MS = 6000;

export function FailureNotices() {
  const notices = useSyncExternalStore(
    subscribeFailureNotices,
    getFailureNotices,
    getFailureNotices,
  );
  // Pause state lives on the stack, not per notice: hovering the stack
  // to read one message must not let the neighbour underneath expire,
  // and a deduped notice that remounts keeps the current pause state.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  // Focus stays where the user put it: these handlers only pause the
  // timers. Moving focus inside the stack does not count as leaving it.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setFocused(true);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setFocused(false);
  };

  if (notices.length === 0) return null;
  return (
    <div
      className={styles.stack}
      data-testid="failure-notices"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {notices.map((notice) => (
        <FailureNoticeItem
          key={notice.id}
          notice={notice}
          paused={paused}
        />
      ))}
    </div>
  );
}

interface FailureNoticeItemProps {
  notice: FailureNotice;
  paused: boolean;
}

function FailureNoticeItem({ notice, paused }: FailureNoticeItemProps) {
  const { t } = useTranslation();
  // Milliseconds left when the timer was last paused, so resuming does
  // not restart the countdown from the top.
  const remainingRef = useRef(DISMISS_AFTER_MS);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      dismissFailureNotice(notice.id);
    }, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAt),
      );
    };
  }, [paused, notice.id]);

  const resolved =
    notice.error !== null
      ? resolveAppErrorMessage(notice.error.message, t)
      : "";
  const message =
    resolved.trim() !== "" ? resolved : t(I18N_KEYS.failureNotice.body);

  return (
    <Banner
      tone="danger"
      role="alert"
      label={t(I18N_KEYS.failureNotice.label)}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismissFailureNotice(notice.id)}
          data-testid="failure-notice-dismiss"
        >
          {t(I18N_KEYS.failureNotice.dismiss)}
        </Button>
      }
    >
      <span className={styles.message}>{message}</span>
      {notice.error === null && notice.detail !== "" && (
        <span className={styles.detail}>{notice.detail}</span>
      )}
    </Banner>
  );
}
