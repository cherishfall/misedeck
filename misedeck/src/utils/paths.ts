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
 * Character budget for a fixed-width, `--font-mono` table column at
 * `--size-data`, measured rather than guessed (issue #216, generalized
 * in #225 so every path cell derives its budget from the same math).
 *
 * A column of `widthPx` carries `--space-3` (12px) of padding on each
 * side, leaving `widthPx - 24` px of text. `--font-mono` at
 * `--size-data` (12px) advances 0.6em, i.e. 7.2px per character. The
 * budget is the floor of that division: one character more would push
 * the rendered string past the cell and let the cell's own end
 * `text-overflow: ellipsis` re-truncate the tail — hiding the file
 * name, the exact bug head-elision exists to fix.
 *
 * The unit is a mono advance. `shortenPathTail` compares display width in
 * these columns, counting an East Asian Wide/Fullwidth character as two
 * (#258): CJK sub-path segments occupy two advances each, so measuring
 * them with `String.length` understated the budget they consume.
 *
 * Why a constant and not a runtime `measureText`: since #241 JetBrains
 * Mono is **bundled** (`src/fonts.css`), so the 0.6em advance is the
 * same on macOS, Windows and Linux — before that, every platform fell
 * back to a different mono face (Consolas 0.55em, DejaVu 0.602em) and
 * this number quietly overstated the budget on Windows by ~2
 * characters. `scripts/check-css-tokens.ts` now fails the build if
 * `--font-mono` stops naming the bundled family, which is the only way
 * the assumption can break (#246).
 */
export function columnCharBudget(widthPx: number): number {
  const CELL_PADDING_PX = 2 * 12; // --space-3 on each side
  const MONO_ADVANCE_PX = 7.2; // 0.6em at --size-data (12px), guaranteed by the bundled font
  return Math.floor((widthPx - CELL_PADDING_PX) / MONO_ADVANCE_PX);
}

/**
 * Tools page's Source column (issue #225, widening #216's 160px): 216px
 * makes the budget 26 characters — enough for `…/.config/mise/config.toml`,
 * so the global config (`/Users/<me>/.config/mise/config.toml`) keeps its
 * `.config` directory segment and stays separable from a project config
 * (`…/<dir>/.mise/config.toml`). At the old 160px budget of 18 both
 * collapsed toward `…/mise/config.toml`.
 */
export const SOURCE_CELL_CHARS = columnCharBudget(216);

/**
 * Env page's Value column (issue #225): the column is declared 320px,
 * so the budget is 41 characters — head-elision keeps enough of the
 * tail (`…/installs/node/22.11.0/bin` vs `…/installs/go/1.23.2`) for
 * same-prefix env values like GOBIN / GOROOT / JAVA_HOME to be told
 * apart, where the CSS end-ellipsis used to cut every one of them at
 * the same `/Users/<me>/.local/share/mise/insta…`.
 */
export const ENV_VALUE_CELL_CHARS = columnCharBudget(320);

/**
 * Display columns a string occupies in a fixed-width data cell. The
 * budget (`columnCharBudget`) is expressed in mono advances, and an East
 * Asian Wide/Fullwidth character occupies two of them (#258) — a CJK
 * path measured with `String.length` looked half as wide as it renders,
 * so the head-elision kept segments that pushed the tail past the cell
 * and let the CSS end-ellipsis cut the file name the function exists to
 * preserve.
 */
function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += isWideCodePoint(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

/** East Asian Wide / Fullwidth code points (Unicode EastAsianWidth W/F),
 *  the ranges a path realistically carries: CJK, Hangul, fullwidth
 *  forms. */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/**
 * Display-only shortening for source paths. The tail is what identifies a
 * config source (`mise.toml` vs `config.toml`), so elide the *head*:
 * `/Users/dev/proj/mise.toml` becomes `…/proj/mise.toml` instead of losing
 * its file name to a trailing ellipsis.
 *
 * `maxLength` is measured in display columns, not UTF-16 units: a wide
 * (CJK / fullwidth) character counts as two (#258). Never mutates the value
 * sent to mise — callers pass the full string to the tooltip and store this
 * result in render output only. Values that are not absolute paths, and
 * paths already within `maxLength`, come back unchanged. A basename longer
 * than the budget is returned whole: the whole point is to keep it visible.
 */
export function shortenPathTail(path: string, maxLength = 40): string {
  if (path === "" || displayWidth(path) <= maxLength || !isAbsolutePathLike(path)) {
    return path;
  }
  const winSeparator = path.includes("\\") && !path.includes("/");
  const separator = winSeparator ? "\\" : "/";
  const segments = path.split(/[\\/]+/).filter((segment) => segment !== "");
  if (segments.length < 2) return path;

  let tail = segments[segments.length - 1];
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const candidate = `${segments[i]}${separator}${tail}`;
    if (displayWidth(`…${separator}${candidate}`) > maxLength) break;
    tail = candidate;
  }
  return `…${separator}${tail}`;
}

