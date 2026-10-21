// Global failure-notice queue (issue #249).
//
// A rejected Tauri command lands here through `api/invoke.ts` unless the
// call site opted out because it renders the failure itself. The queue
// is a plain external store — not React state — because the reporter is
// a non-React wrapper; `FailureNotices` subscribes with
// `useSyncExternalStore`.
//
// The pure parts stay pure and node-testable: normalizing a rejection
// into a notice, deduping identical failures, and the three-notice cap.
// Timers live in the component, so this module never schedules
// anything.

import type { AppError } from "../types/tauri";
import { isAppError } from "../utils/isAppError";

/** At most this many notices are live at once. A fourth failure pushes
 *  the oldest out; the newest is the one the user just caused. */
export const MAX_FAILURE_NOTICES = 3;

export interface FailureNotice {
  /** Monotonic identity for React keys and the dismiss timer. A
   *  duplicate refreshes the notice with a new id. */
  id: number;
  /** Equality key used for dedupe: identical failures collapse. */
  identity: string;
  /** The structured error when the rejection carried one. */
  error: AppError | null;
  /** Raw text for an IPC-level rejection (an `Error` message), empty
   *  when `error` carries the detail. */
  detail: string;
}

interface NormalizedFailure {
  identity: string;
  error: AppError | null;
  detail: string;
}

/** Best-effort text for a non-`AppError` rejection. The webview usually
 *  rejects with an `Error`; a thrown string is next. Anything else has
 *  no safe display text, so the notice falls back to its generic body
 *  while the identity keeps distinct payloads distinct. */
function describeRejection(value: unknown): string {
  if (value instanceof Error) return value.message.trim();
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  try {
    return (JSON.stringify(value) ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Map an `invoke` rejection to the queue's shape. An `AppError` is
 * identified by code + message — the message is the negotiated detail
 * (i18n key or raw mise text), so two failures with the same code and
 * message are the same failure. Bridge rejections dedupe on their text.
 */
export function normalizeFailure(value: unknown): NormalizedFailure {
  if (isAppError(value)) {
    return {
      identity: `${value.code}|${value.message}`,
      error: value,
      detail: "",
    };
  }
  const detail = describeRejection(value);
  return {
    identity: `bridge|${detail || "unknown"}`,
    error: null,
    detail,
  };
}

/**
 * Append a notice. An identical live notice is removed first, so the
 * duplicate takes the newest position and gets a fresh dismissal
 * window instead of stacking. The result is capped at
 * `MAX_FAILURE_NOTICES`, oldest first.
 */
export function enqueueFailure(
  notices: readonly FailureNotice[],
  notice: FailureNotice,
): FailureNotice[] {
  const withoutDuplicate = notices.filter(
    (existing) => existing.identity !== notice.identity,
  );
  return [...withoutDuplicate, notice].slice(-MAX_FAILURE_NOTICES);
}

/** Remove one notice by id. */
export function dismissFailure(
  notices: readonly FailureNotice[],
  id: number,
): FailureNotice[] {
  return notices.filter((notice) => notice.id !== id);
}

export interface FailureNoticeStore {
  report(error: unknown): void;
  dismiss(id: number): void;
  subscribe(listener: () => void): () => void;
  /** Stable while the queue is unchanged — the contract
   *  `useSyncExternalStore` requires. */
  getSnapshot(): readonly FailureNotice[];
}

export function createFailureNoticeStore(): FailureNoticeStore {
  let notices: readonly FailureNotice[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    report(error) {
      const normalized = normalizeFailure(error);
      notices = enqueueFailure(notices, {
        id: nextId++,
        ...normalized,
      });
      emit();
    },
    dismiss(id) {
      const next = dismissFailure(notices, id);
      if (next.length === notices.length) return;
      notices = next;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return notices;
    },
  };
}

/** The one store the app uses. */
export const failureNoticeStore = createFailureNoticeStore();

export function reportFailure(error: unknown): void {
  failureNoticeStore.report(error);
}

export function dismissFailureNotice(id: number): void {
  failureNoticeStore.dismiss(id);
}

export function subscribeFailureNotices(listener: () => void): () => void {
  return failureNoticeStore.subscribe(listener);
}

export function getFailureNotices(): readonly FailureNotice[] {
  return failureNoticeStore.getSnapshot();
}
