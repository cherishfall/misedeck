// The app's own update check (#236, spec #234).
//
// One command, three outcomes. The Rust side collapses every failure
// (offline, proxy, timeout, no curl, unparseable feed) into the `err`
// variant, so this module never has to distinguish them — the panel says
// one sentence and offers a retry.
//
// Nothing calls this at launch. It runs when the user asks, and only then.

import { invoke } from "@tauri-apps/api/core";

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
  return invoke<AppUpdateResult>("check_app_update");
}
