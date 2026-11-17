// Filesystem probes outside the mise runner. Wrapped here so call
// sites follow the same pattern as `api/mise.ts` — components never
// invoke a Tauri command directly.

import type { DirectoryProbe } from "../utils/directoryAvailability";
import { invoke } from "./invoke";

/**
 * Ask the Rust side whether `path` is an existing directory
 * (`directory_exists`, issue #214). A rejected IPC call is `unknown`,
 * never `missing`: an unanswerable probe is not a negative fact.
 *
 * The probe opts out of the global failure notice (issue #249): it runs
 * for recents and startup checks nobody asked for, and "unknown" is the
 * complete, designed outcome — a notice would report a background
 * guess as an action the user took.
 */
export async function probeDirectory(path: string): Promise<DirectoryProbe> {
  try {
    const exists = (await invoke(
      "directory_exists",
      { path },
      { reportFailure: false },
    )) as boolean;
    return exists ? "exists" : "missing";
  } catch {
    return "unknown";
  }
}

/**
 * Ask the Rust side for the canonical form of a directory-context path
 * (`canonicalize_cwd`, issue #305). mise reports config source paths
 * canonically (`/private/tmp/x` — macOS `/tmp` is a symlink), while the
 * context holds the user-visible path (`/tmp/x`); write-scope
 * classification prefix-compares the two, so it must compare canonical
 * against canonical.
 *
 * Returns `null` when the command rejects or answers nothing: the
 * classifier then falls back to the raw comparison — the pre-#305
 * behavior — instead of misreading Directory mode. The probe opts out
 * of the global failure notice for the same reason `probeDirectory`
 * does: a degradable background fact, not an action the user took.
 */
export async function canonicalizeDirectory(cwd: string | null): Promise<string | null> {
  if (cwd === null) return null;
  try {
    return ((await invoke(
      "canonicalize_cwd",
      { cwd },
      { reportFailure: false },
    )) as string | null) ?? null;
  } catch {
    return null;
  }
}
