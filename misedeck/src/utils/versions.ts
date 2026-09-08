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
