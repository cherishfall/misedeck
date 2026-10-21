// Opening a web link in the OS browser (#248).
//
// Neither `<a target="_blank">` nor `window.open()` works inside the
// webview: the platform webview refuses to create a window the app never
// asked for, so the activation is dropped and the user sees nothing. The
// link goes through a Tauri command instead, which checks the scheme
// before handing the URL to the opener plugin — see
// `src-tauri/src/external_link.rs` for why that check cannot live here.

import { isTauri } from "@tauri-apps/api/core";

import { invoke } from "./invoke";

/** Is this running inside the app, or in a plain browser tab?
 *
 *  A frontend-only `npm run dev` has no Tauri bridge, and there the
 *  browser already does the right thing with a link. */
export function inAppShell(): boolean {
  return isTauri();
}

/** Hand `url` to the OS browser.
 *
 *  Resolves once the request has left the app; rejects with the
 *  structured `AppError` when the URL was refused or the launch failed.
 *  Callers in a plain browser tab must not call this — use
 *  `inAppShell()` first. */
export async function openExternalUrl(url: string): Promise<void> {
  // ExternalLink renders the rejection inline with the URL still
  // copyable (issue #262), so the global notice would say it twice.
  await invoke("open_external", { url }, { reportFailure: false });
}
