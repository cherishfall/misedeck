// Whether `mise settings unset` can actually remove a settings row
// (issue #213, tightening beta11's 4.7-M1 rule).
//
// The write target is chosen by the directory context, not by where the
// row is defined: Global mode writes the global config, Directory mode
// writes a local config. A source outside that target makes the command
// exit 0 while changing nothing, so the row's Unset renders disabled
// with a Tooltip instead of silently no-opping.
//
// Pure so the branches are unit-tested without a DOM. The global-mode
// test is the same `isGlobalConfigPath` judgment the Env page uses
// (`isEnvWriteScopeMismatch`) — one definition of "the global config".

import { isGlobalConfigPath } from "../../api/miseTools";
import { isPathUnder, normalizePathForCompare } from "../../utils/paths";

export function settingsUnsetInScope(
  source: string | undefined,
  cwd: string | null,
  allView: boolean,
): boolean {
  if (!source) {
    // An `--all` row without a source carries only a built-in default
    // — there is nothing to unset. The explicit view's rows are by
    // construction explicitly set (the plain `--json` fallback shape
    // merely drops the source field), so they stay in scope.
    return !allView;
  }
  if (cwd === null) {
    // Global mode: `unset` targets the global config, so only a row
    // defined there can be removed. A project-sourced row would no-op.
    return isGlobalConfigPath(source);
  }
  // Directory mode: a global-config source is never under the local
  // write target, so Unset would no-op even when the global config happens
  // to sit inside the cwd tree.
  if (isGlobalConfigPath(source)) return false;
  // Otherwise the source's directory must be the cwd itself or one of
  // its ancestors.
  const normalized = normalizePathForCompare(source);
  const sourceDir = normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));
  return isPathUnder(sourceDir, cwd);
}
