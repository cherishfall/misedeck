// Shared path comparison helpers (issue #159).
//
// The frontend classifies mise-reported paths (config sources, tool
// install dirs) against the app's directory context, and those strings
// arrive with the host platform's separators and casing:
//
//   * Windows uses `\` and folds case (NTFS default) — a naive
//     `path.startsWith(dir + "/")` is always false there, so every
//     comparison must normalize separators first.
//   * macOS uses `/` and folds case by default (APFS/HFS+) — a config
//     path can differ from the cwd in case (`/Users/…` vs `/users/…`
//     through case-insensitive volume access).
//   * Linux uses `/` and is case-sensitive — folding would merge two
//     real directories, so callers can opt out.
//
// What normalization deliberately does NOT do: resolve symlinks. A
// webview cannot canonicalize `/tmp/x` to `/private/tmp/x` (the classic
// macOS alias), so callers must pass paths that are already canonical —
// the Tauri directory picker and mise both report canonical absolute
// paths in practice. A symlink mismatch degrades to the "global"
// fallback, never to a crash.

export interface PathCompareOptions {
  /**
   * Fold case before comparing. Default true: both primary platforms
   * (Windows and default macOS) have case-insensitive filesystems.
   * Pass `false` on case-sensitive filesystems (typical Linux).
   */
  caseInsensitive?: boolean;
}

/** Case folding for path comparison — `toLowerCase`, never locale-sensitive. */
function foldCase(p: string, caseInsensitive: boolean): string {
  return caseInsensitive ? p.toLowerCase() : p;
}

/**
 * Reduce a path to a canonical string form for comparison: unify
 * separators to `/`, collapse duplicate slashes, and trim trailing
 * slashes (keeping the roots `/` and `C:/`). Exported so future
 * path-under-cwd judgments can reuse the same normalization instead of
 * growing per-call-site ad-hoc comparisons.
 */
export function normalizePathForCompare(path: string, options?: PathCompareOptions): string {
  const caseInsensitive = options?.caseInsensitive ?? true;
  let out = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (out.length > 1) {
    out = out.replace(/\/+$/, "");
    // Trimming turned a drive root (`C:/`) into `C:` — restore it.
    if (/^[A-Za-z]:$/.test(out)) out += "/";
  }
  return foldCase(out, caseInsensitive);
}

/**
 * True when `childPath` is `parentDir` itself or lives somewhere under
 * it. Segment-aware: `/foo/barbaz` is NOT under `/foo/bar`. Exact match
 * counts as "under" — a config file at the cwd root (e.g. the cwd's own
 * `mise.toml`) is directory-scoped.
 */
export function isPathUnder(
  parentDir: string,
  childPath: string,
  options?: PathCompareOptions,
): boolean {
  const parent = normalizePathForCompare(parentDir, options);
  const child = normalizePathForCompare(childPath, options);
  if (parent === "" || child === "") return parent === child && parent !== "";
  if (parent === child) return true;
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return child.startsWith(prefix);
}
