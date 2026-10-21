// The app's only Tauri `invoke` import (issue #249).
//
// Every command rejection is a user-visible failure by default: the
// wrapper forwards the rejection to the global failure-notice queue and
// then rethrows, so call sites keep their existing error handling. That
// default is what makes a forgotten rejection visible without every
// call site growing its own UI.
//
// Opting out is deliberate and local: a call site passes
// `{ reportFailure: false }` only when a surface *it owns* already
// renders that failure — the execution panel for mise runs, the
// ExternalLink inline alert, the theme-chrome banner, a page's own
// error card. The opt-out lives at the wrapper that owns the surface,
// never in a command-name policy list here: this module must not need
// editing when a new command appears. `npm run lint:invoke-wrapper`
// keeps third-party `invoke` imports out of every other file.
//
// The queue is a module singleton rather than a React context because
// this wrapper is not a component; the notice surface subscribes to the
// same store with `useSyncExternalStore`.

import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";

import { reportFailure } from "../state/failureNotices";

export interface InvokeOptions {
  /** Set to `false` when the caller already renders this rejection.
   *  Defaults to `true`. */
  reportFailure?: boolean;
}

/** Call a Tauri command, reporting a rejection to the global notice
 *  queue unless the caller explicitly owns the failure. The original
 *  rejection is always rethrown unchanged. */
export async function invoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    if (options?.reportFailure !== false) {
      reportFailure(error);
    }
    throw error;
  }
}
