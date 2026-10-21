// The running app's own identity — issued by Tauri, not by us.
//
// `getVersion()` reads `tauri.conf.json` → `version` through the Tauri
// context, so the string the UI shows is byte-identical to the one the
// bundler stamped into the binary (#235). Never hardcode a version in a
// component: a literal drifts the first time someone bumps three files
// and forgets the fourth, and it would also drift from the value a future
// updater compares against.
//
// No capability change is needed — `core:default` already grants
// `core:app:allow-version`.

import { getVersion } from "@tauri-apps/api/app";

/** The MiseDeck build's own version, e.g. `1.0.0-beta.16`.
 *
 *  Resolves to `null` when the Tauri context is unavailable (a plain
 *  browser tab). The UI renders a placeholder rather than throwing: a
 *  missing version must never take the shell down. */
export async function getAppVersion(): Promise<string | null> {
  try {
    const version = await getVersion();
    return version.trim() === "" ? null : version;
  } catch {
    return null;
  }
}

/** The project's Releases page — where every build is published. The app
 *  never downloads a build itself (ADR-0009): the browser (or the user's
 *  download manager / proxy) owns the transfer. */
export const RELEASES_URL = "https://github.com/cherishfall/misedeck/releases";
