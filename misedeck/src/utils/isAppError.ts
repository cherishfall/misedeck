// Type guard for the structured `AppError` payload a rejected Tauri
// command carries (issue #249).
//
// Kept in its own module, next to the other error helpers, because two
// import graphs need it: the API wrappers (and the execution panel) on
// one side, and the non-React failure-notice store on the other.
// `appError.ts` cannot host it — that module pulls in the i18n catalog
// and its language detector, which the pure store tests must not load.

import type { AppError } from "../types/tauri";

/** True when `value` is the `{ code, message, stderr }` shape the Rust
 *  boundary serializes into a rejected `invoke`. An IPC-level failure
 *  (bridge closed, webview torn down) rejects with an `Error` instead,
 *  so this guard is also the error→notice mapping's discriminator. */
export function isAppError(value: unknown): value is AppError {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.message === "string" &&
    typeof v.stderr === "string"
  );
}
