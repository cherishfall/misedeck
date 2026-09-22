// The human-readable command echo (what the user would type in a
// terminal) for an execution. `mise` runs an arbitrary command;
// `install` runs the official install script (the actual
// platform-specific command is built in Rust); `selfUpdate` runs
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
export function commandEcho(
  kind: "mise" | "install" | "selfUpdate",
  cwd: string | null,
  args: string[],
): string {
  if (kind === "install") {
    return "curl -fsSL https://mise.jdx.dev/install.sh | sh";
  }
  if (kind === "selfUpdate") {
    const parts: string[] = ["mise"];
    parts.push("-C", cwd ?? "$HOME");
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
    parts.push("-C", cwd);
  }
  for (const a of args) {
    if (a.includes(" ") || a.includes("\t")) {
      parts.push(JSON.stringify(a));
    } else {
      parts.push(a);
    }
  }
  return parts.join(" ");
}
