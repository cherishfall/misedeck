// Rows of the version-management region's "not installed" section
// (issue #178/#188), split out of AddToolSection so the row rules are
// unit-testable (issue #286).
//
// One row per version, newest first, with the `latest` alias pinned on
// top and annotated with the concrete version it resolves to. The
// pinned row IS the newest version's row: before #286 the loop pushed
// the same version again, so the newest version rendered twice with two
// buttons dispatching the identical `mise use <tool>@<version>` — one
// fact stated twice, one of them pretending to be a second choice.

import type { MiseLsRemoteItem } from "../../types/tauri";
import { compareToolVersions } from "../../utils/versions";

export type AvailableRow =
  | { kind: "latest"; version: string }
  | { kind: "version"; version: string; createdAt?: string };

/** Build ③ from the `ls-remote` read, minus the on-disk set. */
export function buildAvailableRows(
  remote: ReadonlyArray<MiseLsRemoteItem>,
  installed: ReadonlySet<string>,
): AvailableRow[] {
  const sorted = [...remote].sort((a, b) => compareToolVersions(b.version, a.version));
  const newest = sorted[0]?.version;
  const rows: AvailableRow[] = [];
  // The pinned alias row renders only when that version is not already
  // on disk — the sections never overlap.
  if (newest !== undefined && !installed.has(newest)) {
    rows.push({ kind: "latest", version: newest });
  }
  for (const item of sorted) {
    if (installed.has(item.version)) continue;
    // The pinned row above already carries this version; a second
    // actionable row for it would dispatch the same command (#286).
    if (item.version === newest) continue;
    rows.push({ kind: "version", version: item.version, createdAt: item.createdAt });
  }
  return rows;
}
