// The human-readable command echo (what the user would type in a
// terminal) for an execution. `mise` runs an arbitrary command;
// `install` runs the official install script — the platform-specific
// line lives here and in `src-tauri/src/install.rs`, and
// `scripts/check-install-echo-parity.ts` (part of `npm run ci`) fails
// the build if the two ever disagree; `selfUpdate` runs
// `mise self-update`.
//
// The echo is terminal-perspective (issue #191): it shows what a user
// would type in a terminal, not the runner's exact argv. The runner
// anchors every mise invocation at a directory context — Directory
// mode passes `-C <cwd>`, Global mode (`cwd === null`) passes
// `-C $HOME` (issue #179) — but the echo only surfaces the anchor a
// terminal user would write: Directory mode keeps `-C <dir>` inline,
// Global mode renders the bare command body (`use`/`unuse` carry `-g`
// explicitly) and the working directory is disclosed separately by the
// "Working directory: ~ (home)" context line rendered next to this echo
// in the panel and in ConfirmDialog. The `selfUpdate` echo is the one
// deliberate exception: it keeps `-C $HOME` verbatim (out of #191's
// scope per the beta13 settlement).
//
// Exported so confirmations (e.g. the uninstall dialog, issue #56) can
// show the exact command that will run — identical to what the deck
// echoes once the mutation dispatches.

/** The three platforms MiseDeck ships to. */
export type HostPlatform = "windows" | "macos" | "linux";

/**
 * The official install one-liner per platform — the line a user pastes
 * into that platform's shell. Mirrored verbatim in
 * `src-tauri/src/install.rs` (`INSTALL_SCRIPT_LINE`), which is what
 * the Rust executor actually runs; the parity lint keeps them equal.
 */
const INSTALL_SCRIPT_LINES: Record<HostPlatform, string> = {
  windows: "irm https://mise.jdx.dev/install.ps1 | iex",
  macos: "curl -fsSL https://mise.jdx.dev/install.sh | sh",
  linux: "curl -fsSL https://mise.jdx.dev/install.sh | sh",
};

/**
 * Classify the host from the webview's user agent. Only the platform
 * the install script depends on — a wrong answer here is a wrong
 * install line, not a security boundary, so a UA probe is proportionate
 * and needs no IPC. Anything that is not recognisably Windows or macOS
 * is treated as Linux, which covers the BSDs' sh-based install too.
 */
export function hostPlatform(userAgent?: string): HostPlatform {
  const ua =
    userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  return "linux";
}

/** Characters that carry no meaning to a shell, so the token can stay
 *  bare and read like what the user typed. */
const BARE_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Quote one argv token the way a shell would need it. The echo promises
 * a dispatchable command line (#72), so the rule applies to every token
 * alike — the `-C` anchor included, not just the args (#209):
 * `-C "/Users/me/My Project"` must not split at the space.
 *
 * Single quotes, not JSON quotes (issue #229): inside `'…'` a POSIX
 * shell expands nothing, so `$HOME`, `$(…)`, backticks, `!` and `&`
 * arrive verbatim — which is exactly what broke with `JSON.stringify`,
 * where a token was quoted only if it contained a space or a tab.
 * Tokens that are shell-inert as written stay bare.
 *
 * The embedded-quote escape is platform-specific because the paste
 * target is: POSIX shells close and reopen the quote (`'\''`),
 * PowerShell doubles the quote (`''`). Both treat `'…'` as literal, so
 * the quoted line means the same thing on either side. The PowerShell
 * half is NOT verified on real Windows — there is no Windows machine in
 * the review loop; it follows PowerShell's documented quoting rules.
 *
 * A token carrying a literal newline is quoted but still cannot survive
 * a paste: no shell takes a control character through a pasted line.
 * Such a value is a real mise value and the panel shows it faithfully —
 * it is just not pasteable, and never was.
 */
function quoteArg(arg: string, platform: HostPlatform): string {
  if (arg.length > 0 && BARE_SAFE.test(arg)) return arg;
  const escaped =
    platform === "windows" ? arg.replace(/'/g, "''") : arg.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

export function commandEcho(
  kind: "mise" | "install" | "selfUpdate",
  cwd: string | null,
  args: string[],
  platform: HostPlatform = hostPlatform(),
): string {
  if (kind === "install") {
    // Same platform branch the executor takes (issue #229): on Windows
    // the runner spawns `powershell -Command "irm … | iex"`, so echoing
    // `curl … | sh` there was a line that could never reproduce the run.
    return INSTALL_SCRIPT_LINES[platform];
  }
  if (kind === "selfUpdate") {
    const parts: string[] = ["mise"];
    // `$HOME` is a placeholder the shell must expand, not a literal
    // path — quoting it would pass the five characters `$HOME` to mise.
    parts.push("-C", cwd === null ? "$HOME" : quoteArg(cwd, platform));
    // `--yes` is what the runner really passes (issue #125): the CLI's
    // own `[Y/n]` prompt is bypassed, the GUI confirms first instead.
    parts.push("self-update", "--yes");
    return parts.join(" ");
  }
  const parts: string[] = ["mise"];
  // Terminal perspective (#191): a terminal user in Global mode types
  // the bare command (use/unuse carry `-g`); only Directory mode shows
  // the `-C <dir>` anchor inline.
  if (cwd !== null) {
    parts.push("-C", quoteArg(cwd, platform));
  }
  for (const a of args) {
    parts.push(quoteArg(a, platform));
  }
  return parts.join(" ");
}
