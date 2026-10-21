import type { MiseLsItem, MiseOutdatedItem } from "../types/tauri";

/**
 * Directional compare for mise's date-based versions (e.g. 2026.9.2):
 * split on `.` and compare segment-wise numerically. Returns > 0 when
 * `a` is newer. Unparseable segments compare as equal (no update offer).
 *
 * Shared by the HomePage update check (issue #99) and table column
 * sorting (issue #105).
 */
export function compareVersions(a: string, b: string): number {
  const as = a.split(".");
  const bs = b.split(".");
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const av = Number.parseInt(as[i] ?? "0", 10);
    const bv = Number.parseInt(bs[i] ?? "0", 10);
    if (Number.isNaN(av) || Number.isNaN(bv)) return 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Directional compare for full tool version strings, including mise's
 * prefixed distribution builds (`graalvm-community-17.0.7`,
 * `temurin-jre-21.0.0+35.0.LTS` — most of java's 3000+ versions) where
 * `compareVersions` bails out on the letter prefix. Every digit run is a
 * numeric segment, so the version core dominates and equal cores fall
 * back to the metadata suffix, then the vendor prefix, then the whole
 * string — a deterministic total order. Returns > 0 when `a` is newer.
 * Never throws: input without digits degrades to a lexical comparison
 * (issue #178).
 */
export function compareToolVersions(a: string, b: string): number {
  const ka = toolVersionKey(a);
  const kb = toolVersionKey(b);
  const len = Math.max(ka.numbers.length, kb.numbers.length);
  for (let i = 0; i < len; i++) {
    const av = ka.numbers[i];
    const bv = kb.numbers[i];
    // A shorter numeric run is older: 21.0 < 21.0.1, and 21.0.0+35
    // (build metadata) is newer than the bare 21.0.0.
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av !== bv) return av - bv;
  }
  // Same numeric core: the bare release outranks a metadata suffix
  // (`.LTS`), then the vendor prefix breaks the tie, then the whole
  // string — deterministic for anything left.
  if (ka.trailing !== kb.trailing) {
    if (ka.trailing === "") return 1;
    if (kb.trailing === "") return -1;
    const byTrailing = ka.trailing.localeCompare(kb.trailing);
    if (byTrailing !== 0) return byTrailing;
  }
  if (ka.prefix !== kb.prefix) return ka.prefix.localeCompare(kb.prefix);
  return a.localeCompare(b);
}

interface ToolVersionKey {
  /** Every digit run in the string, in order (`21.0.0+35` → [21,0,0,35]). */
  numbers: number[];
  /** Text before the first digit run (the vendor prefix). */
  prefix: string;
  /** Text after the last digit run (the metadata suffix). */
  trailing: string;
}

function toolVersionKey(v: string): ToolVersionKey {
  const numbers: number[] = [];
  const re = /\d+/g;
  let match: RegExpExecArray | null;
  let firstIndex = -1;
  let lastEnd = 0;
  while ((match = re.exec(v)) !== null) {
    if (firstIndex < 0) firstIndex = match.index;
    numbers.push(Number.parseInt(match[0], 10));
    lastEnd = match.index + match[0].length;
  }
  if (firstIndex < 0) {
    // No digits at all — nothing to compare numerically.
    return { numbers, prefix: v, trailing: "" };
  }
  return { numbers, prefix: v.slice(0, firstIndex), trailing: v.slice(lastEnd) };
}

/**
 * True when a `mise outdated` row names a real upgrade target: a
 * non-empty `latest` that differs from a non-empty `current`. mise can
 * report the same value for both — rust requested as `latest` reports
 * `current: "stable"` and `latest: "stable"` — and an upgrade hint whose
 * target equals the current version promises a change that cannot
 * happen (issue #224). A requested-but-missing version also reports
 * `current: null` (probe: `[tools] node = "22.0.0"` with another
 * version installed) — there is nothing installed to upgrade, so the
 * row must never count as outdated (issue #269). This is the one
 * predicate behind every upgrade surface: the Tools table's Version-cell
 * chip, the "N tools outdated" count, and the version-management
 * section's in-use hint all derive from it, so they can never disagree.
 */
export function hasUpgradeTarget(item: MiseOutdatedItem): boolean {
  // `current` may arrive as JSON null for a missing request; the parser
  // turns it into `undefined`, and this guard keeps the raw shape safe
  // too.
  return (
    typeof item.current === "string" &&
    item.current !== "" &&
    typeof item.latest === "string" &&
    item.latest !== "" &&
    item.latest !== item.current
  );
}

/**
 * The `mise ls --json` row the Tools table shows for one tool, plus
 * whether the requested version is missing from disk (issue #269).
 *
 * Selection order: the active version; otherwise the newest installed
 * version; only when nothing is installed does the requested-but-missing
 * row appear — a row that must be labelled "not installed" rather than
 * passed off as a working install.
 */
export interface ToolVersionSelection {
  item: MiseLsItem;
  missing: boolean;
}

export function selectToolVersion(items: MiseLsItem[]): ToolVersionSelection | null {
  const active = items.find((it) => it.active);
  const newestInstalled = items
    .filter((it) => it.installed)
    .sort((a, b) => compareToolVersions(b.version, a.version))[0];
  const item = active ?? newestInstalled ?? items[0];
  if (!item) return null;
  return { item, missing: !item.installed && !item.active };
}
