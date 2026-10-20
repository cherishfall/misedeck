// Directory availability — the pure decision behind the directory
// context's validity gate (issue #214).
//
// The persisted context and the recents list both survive restarts,
// so a path can stop existing while MiseDeck is closed. Pages must
// never learn about that through their own failed mise queries (one
// stderr block per page); the context probes the directory once and
// turns the answer into a single state every surface reads.
//
// The probe is a filesystem fact supplied by Rust (`directory_exists`):
//   * exists  — the directory is usable
//   * missing — deleted, moved, or now a file → revert + guide
//   * unknown — the probe could not answer (IPC failure). Data honesty
//               (ui-ux-rules.md): an unanswerable probe is not a
//               negative fact, so this never reads as "unavailable".

export type DirectoryProbe = "probing" | "exists" | "missing" | "unknown";

/** The slice of `DirContext` this module needs, kept structural so the
 *  util does not depend on React state modules. */
export interface DirectoryContextLike {
  kind: "global" | "dir";
  path?: string;
}

export interface DirectoryProbeRecord {
  path: string;
  result: DirectoryProbe;
}

export type DirectoryAvailability =
  | { kind: "global" }
  | { kind: "probing"; path: string }
  | { kind: "available"; path: string }
  | { kind: "unavailable"; path: string }
  | { kind: "unknown"; path: string };

/** Combine the active context with the latest probe. A probe for a
 *  different path is stale and must not describe the current one. */
export function resolveDirectoryAvailability(
  context: DirectoryContextLike,
  probe: DirectoryProbeRecord | null,
): DirectoryAvailability {
  if (context.kind !== "dir" || context.path === undefined) {
    return { kind: "global" };
  }
  const path = context.path;
  if (probe === null || probe.path !== path) {
    return { kind: "probing", path };
  }
  switch (probe.result) {
    case "probing":
      return { kind: "probing", path };
    case "exists":
      return { kind: "available", path };
    case "missing":
      return { kind: "unavailable", path };
    case "unknown":
      return { kind: "unknown", path };
  }
}
