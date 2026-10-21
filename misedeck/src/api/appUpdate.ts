// The app's own update check (#236, spec #234).
//
// One command, three outcomes. The Rust side collapses every failure
// (offline, proxy, timeout, no curl, unparseable feed) into the `err`
// variant, so this module never has to distinguish them — the panel says
// one sentence and offers a retry.
//
// Nothing calls this on the startup path. The manual panel runs it when
// the user asks; the sidebar's silent launch check (#238) runs it at
// most once per throttle window, fire-and-forget.

import { invoke } from "./invoke";

/** A newer build exists — its Release page, not a binary URL. */
export interface AppUpdateAvailable {
  status: "available";
  version: string;
  url: string;
  publishedAt?: string;
}

/** The running build is the newest the feed knows about. */
export interface AppUpdateCurrent {
  status: "current";
  version: string;
}

/** The check failed. The payload is for logs only; the UI shows one
 *  sentence either way. */
export interface AppUpdateFailed {
  status: "err";
  err: unknown;
}

export type AppUpdateResult =
  | AppUpdateAvailable
  | AppUpdateCurrent
  | AppUpdateFailed;

/** Ask GitHub whether a newer MiseDeck build exists. Bounded at eight
 *  seconds on the Rust side. */
export async function checkAppUpdate(): Promise<AppUpdateResult> {
  // The manual panel renders a rejected check in its own error state,
  // while the launch check (#238) deliberately swallows every failure so
  // a background check nobody asked for cannot raise UI. Reporting by
  // default would break that silent path (ADR-0009 revision).
  return invoke<AppUpdateResult>("check_app_update", undefined, {
    reportFailure: false,
  });
}
