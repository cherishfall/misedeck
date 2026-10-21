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
