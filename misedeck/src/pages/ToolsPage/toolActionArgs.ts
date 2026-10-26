// Pure argv builders for the tools page's mutations.
//
// These are the argv the page actually dispatches (the runner adds
// `-C <dir>` in Directory mode and `-C $HOME` in Global mode, issue
// #179). The Rust builders in `src-tauri/src/mise.rs` mirror them, but
// nothing at compile time spans the two languages — so the pair is pinned
// against one checked-in case table instead of a comment (issue #255):
//
//   * `scripts/check-argv-parity.ts` (`npm run lint:argv-parity`, wired
//     into `npm run ci`) executes these builders against
//     `src-tauri/tests/fixtures/argv-parity.json`.
//   * `src-tauri/tests/argv_parity.rs` executes the Rust builders
//     against the same table under `cargo test`.
//
// A new builder or a changed shape needs a table case; both halves then
// fail together when one side drifts.
//
// Only `mise use` and `mise unuse` accept a `-g` flag; `install`,
// `uninstall`, `link`, and `upgrade` operate on the active directory
// context. In Global mode the command carries `-g` explicitly (beta13):
// the echo must read as a dispatchable command, not rely on the runner's
// hidden `-C $HOME` anchoring.

export function miseInstallArgs(tool: string, version: string): string[] {
  // An empty version means latest (issue #111), and `latest` is named
  // explicitly: per `mise install --help`, a bare `<tool>` installs the
  // version the config requests for it, which is not latest when the
  // config pins one (issue #254).
  return ["install", `${tool}@${version.length > 0 ? version : "latest"}`];
}

export function miseUninstallArgs(tool: string, version: string): string[] {
  // Target the exact row's version (issue #56): the confirmation teaches
  // the command `mise uninstall <tool>@<version>`, so the dispatched
  // command must match what is shown.
  return ["uninstall", `${tool}@${version}`];
}

// Tool-level removal (ADR-0008, issue #131): `mise unuse <tool>` drops
// the tool from the Config file and prunes its installations. Only the
// version-management section's active rows reach this — a row there
// always carries a config request, so no orphan branch exists (#189:
// `mise uninstall --all` does not enter the GUI, the beta13
// batch-operation ban).
export function miseUnuseArgs(tool: string, cwd: string | null): string[] {
  return cwd === null ? ["unuse", "-g", tool] : ["unuse", tool];
}

/**
 * Build the argv for `mise link <tool>@<version> <path>` (issue #71).
 * The argument order is `<tool>@<version>` first, then the local
 * `<path>` — not path-first. `--force` is never sent; on a conflict the
 * panel's stderr drives a friendly hint instead of force-overwriting.
 */
export function miseLinkArgs(tool: string, version: string, path: string): string[] {
  return ["link", `${tool}@${version}`, path];
}

export function miseUseArgs(tool: string, version: string, cwd: string | null): string[] {
  return cwd === null
    ? ["use", "-g", `${tool}@${version}`]
    : ["use", `${tool}@${version}`];
}

export function miseUpgradeArgs(tool: string): string[] {
  // No `--bump` (beta13 Q9): the default upgrades within the range the
  // config file writes (node@20 → newest 20.x) without rewriting the
  // config — matching the `latest` field of `mise outdated`.
  return ["upgrade", tool];
}
