// Filesystem probes outside the mise runner. Wrapped here so call
// sites follow the same pattern as `api/mise.ts` — components never
// invoke a Tauri command directly.

import { invoke } from "@tauri-apps/api/core";

import type { DirectoryProbe } from "../utils/directoryAvailability";

/**
 * Ask the Rust side whether `path` is an existing directory
 * (`directory_exists`, issue #214). A rejected IPC call is `unknown`,
 * never `missing`: an unanswerable probe is not a negative fact.
 */
export async function probeDirectory(path: string): Promise<DirectoryProbe> {
  try {
    const exists = (await invoke("directory_exists", { path })) as boolean;
    return exists ? "exists" : "missing";
  } catch {
    return "unknown";
  }
}
