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

/** Absolute-path shapes worth eliding: POSIX root, home shorthand,
 *  Windows drive, UNC share. Anything else (registry tokens, bare tool
 *  names) is left exactly as mise reported it. */
function isAbsolutePathLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  );
}

/**
 * Character budget for a Source cell in a 160px table column, measured
 * rather than guessed (issue #216).
 *
 * A 160px column carries `--space-3` (12px) of padding on each side, leaving
 * 136px of text. `--font-mono` at `--size-data` (12px) advances 0.6em, i.e.
 * 7.2px per character, so `floor(136 / 7.2) = 18` characters fit. Anything
 * longer is re-truncated by the cell's own end `text-overflow: ellipsis` —
 * which hides the file name, the exact bug the head-elision exists to fix.
 */
export const SOURCE_CELL_CHARS = 18;

/**
 * Display-only shortening for source paths. The tail is what identifies a
 * config source (`mise.toml` vs `config.toml`), so elide the *head*:
 * `/Users/dev/proj/mise.toml` becomes `…/proj/mise.toml` instead of losing
 * its file name to a trailing ellipsis.
 *
 * Never mutates the value sent to mise — callers pass the full string to the
 * tooltip and store this result in render output only. Values that are not
 * absolute paths, and paths already within `maxLength`, come back unchanged.
 * A basename longer than the budget is returned whole: the whole point is to
 * keep it visible.
 */
export function shortenPathTail(path: string, maxLength = 40): string {
  if (path === "" || path.length <= maxLength || !isAbsolutePathLike(path)) {
    return path;
  }
  const winSeparator = path.includes("\\") && !path.includes("/");
  const separator = winSeparator ? "\\" : "/";
  const segments = path.split(/[\\/]+/).filter((segment) => segment !== "");
  if (segments.length < 2) return path;

  let tail = segments[segments.length - 1];
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const candidate = `${segments[i]}${separator}${tail}`;
    if (`…${separator}${candidate}`.length > maxLength) break;
    tail = candidate;
  }
  return `…${separator}${tail}`;
}

