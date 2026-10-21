// Thin wrapper around the Tauri `invoke` call. Components consume the
// typed result, never raw CLI output.
//
// The Tauri command returns a `DetectMiseResult` discriminated union
// (`{kind: "ok", ok: ...} | {kind: "err", err: ...}`), so the JS side
// always receives a structured object — never a thrown error. The
// `kind` tag is the only stable discriminator the UI pattern-matches on
// (see docs/agents/conventions.md).

import type {
  ConfigFilesResult,
  DetectMiseResult,
  JsonResult,
  LockfileResult,
  ShellActivationResult,
  TerminalOpenResult,
  TrustResult,
} from "../types/tauri";
import { isAppError } from "../utils/isAppError";
import { isConfigFilesResult, parseFailedError } from "./miseTools";
import { invoke, type InvokeOptions } from "./invoke";

/** Type-guard for the structured AppError shape. Re-exported here (its
 *  original home) so the execution panel and page imports keep working;
 *  the implementation lives in `utils/isAppError.ts` to keep the
 *  failure-notice store free of the i18n import graph. */
export { isAppError } from "../utils/isAppError";

// Failure ownership (issue #249): the Rust commands below serialize
// their own failures as `{kind:"err"}` unions, so an `invoke` rejection
// is an IPC-level failure (bridge closed, webview torn down). Each
// caller already renders that rejection — a page error card, the trust
// or activation banner, the Preview section. They pass
// `reportFailure: false` so the global notice does not repeat a failure
// the user can already see. `config_files` and `registry` stay
// default-on: both commands also return a union, and their consumers
// ignore a rejected query, making the bridge failure the one case only
// the global notice can surface.

/** Calls the `detect_mise` Tauri command and returns the typed union. */
export async function detectMise(
  options?: InvokeOptions,
): Promise<DetectMiseResult> {
  // The Rust command never returns `Result::Err` (it serializes the error
  // as a `{kind: "err", err: ...}` variant instead). A rejection is an
  // IPC-level failure; most pages do not render it, so the wrapper keeps
  // the default report. HomePage renders `states.probeFailed` itself and
  // opts out.
  return (await invoke(
    "detect_mise",
    undefined,
    options,
  )) as DetectMiseResult;
}

// The `ls` family (`tools_ls`, `tools_ls_tool`, `tools_ls_remote`) has no
// wrapper here on purpose: those reads are dispatched through the
// execution panel's runner so the exact command is visible and runs once
// (ADR-0005, issue #72). See `useToolsList.ts`. The dedicated Tauri
// commands were removed in #96 once they had no callers left.

/** Calls the `tools_outdated` Tauri command and returns the typed union. */
export async function toolsOutdated(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tools_outdated", { cwd }, { reportFailure: false })) as JsonResult;
}

/** Calls the `tools_env` Tauri command (`mise env --json`). The
 *  payload is the flat `Map<String, String>` mise emits. */
export async function toolsEnv(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tools_env", { cwd }, { reportFailure: false })) as JsonResult;
}

/** Calls the `env_ls` Tauri command (`mise env --json-extended`).
 *  The payload is the object mise emits with source annotations
 *  (`{VAR: {value, source?, tool?}, ...}`). Used by the Env page
 *  (#41) so each row can show where the var came from. */
export async function envLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("env_ls", { cwd }, { reportFailure: false })) as JsonResult;
}

/** Calls the `read_lockfile` Tauri command and normalizes the wire
 *  shape into the `LockfileResult` union the page pattern-matches
 *  on. The Rust command returns a bare `Result<Option<String>,
 *  AppError>`: `invoke` resolves with the file text (or `null` when
 *  the directory has no `mise.lock`) and rejects with the
 *  structured `AppError` on a hard I/O failure. */
export async function readMiseLockfile(
  cwd: string | null,
): Promise<LockfileResult> {
  try {
    const content = (await invoke(
      "read_lockfile",
      { cwd },
      { reportFailure: false },
    )) as string | null;
    return { kind: "ok", content };
  } catch (e) {
    return {
      kind: "err",
      err: isAppError(e)
        ? e
        : { code: "COMMAND_FAILED", message: String(e), stderr: "" },
    };
  }
}

/** Calls the `config_files` Tauri command (`mise config ls --json`).
 *  Returns the loaded config files in precedence order (highest
 *  first), each with its raw text for the read-only content view.
 *  Used by the preview page (issue #42). A response that is not the
 *  documented union is a PARSE_FAILED error, never an empty "no config
 *  files" list (issue #270). */
export async function configFiles(
  cwd: string | null,
): Promise<ConfigFilesResult> {
  const result = (await invoke("config_files", { cwd })) as unknown;
  if (!isConfigFilesResult(result)) {
    return {
      kind: "err",
      err: parseFailedError(
        'config_files did not return a {kind: "ok", files} result',
      ),
    };
  }
  return result;
}

/** Calls the `trust_check` Tauri command (`mise trust --show`).
 *  Returns a structured `TrustResult` describing the cwd's
 *  config trust state. The UI uses this to decide whether to
 *  render the trust banner. */
export async function trustCheck(cwd: string | null): Promise<TrustResult> {
  return (await invoke("trust_check", { cwd }, { reportFailure: false })) as TrustResult;
}

/** Calls the `tasks_ls` Tauri command (`mise tasks ls --json`).
 *  Returns the raw JSON array mise emits (a `[MiseTask]`); the
 *  JS side parses it via `parseTasksLsPayload` in
 *  `api/miseTools.ts`. Used by the tasks page (issue #27). */
export async function tasksLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tasks_ls", { cwd }, { reportFailure: false })) as JsonResult;
}

/** Calls the `shell_activation_check` Tauri command
 *  (issue #28). Detects the user's shell, reads its rc file,
 *  and decides whether `mise activate` is already present. The
 *  banner surfaces the result on every app start; the result is
 *  also cached in the `ActivationProvider` so the panel does not
 *  re-probe on every page render. */
export async function shellActivationCheck(): Promise<ShellActivationResult> {
  return (await invoke(
    "shell_activation_check",
    undefined,
    { reportFailure: false },
  )) as ShellActivationResult;
}

/** Calls the `open_in_terminal` Tauri command (issue #28).
 *  Launches the user's terminal at the given path (or the home
 *  directory `dirs::home_dir()` resolves when `path` is `null` —
 *  not `$HOME`, which Windows does not set, issue #229). On success,
 *  the structured
 *  `TerminalOpenOutcome` is shipped as `ok`; on failure, the
 *  structured `AppError` is shipped as `err` (the only
 *  platform-specific code is `TERMINAL_NOT_FOUND` on Linux). */
export async function openInTerminal(
  path: string | null,
): Promise<TerminalOpenResult> {
  return (await invoke(
    "open_in_terminal",
    { path },
    { reportFailure: false },
  )) as TerminalOpenResult;
}

// The `settings ls` read has no wrapper here on purpose: like the tools
// `ls` family, it is dispatched through the execution-panel runner in
// background mode so the argv contract is pinned in one place and the
// bypass cannot be reintroduced by accident (ADR-0005, issue #162). See
// `useIssue29.ts`.

/** Calls the `doctor` Tauri command (`mise doctor --json`). Returns the
 *  raw JSON payload on success, or a structured fallback with
 *  `rawLines` when the mise binary does not support `--json` (issue
 *  #29). */
export async function doctor(cwd: string | null): Promise<JsonResult> {
  return (await invoke("doctor", { cwd }, { reportFailure: false })) as JsonResult;
}

/** Calls the `registry` Tauri command (`mise registry --json`). Returns
 *  the raw JSON array on success, or a parsed table fallback when
 *  `--json` is unavailable (issue #29). */
export async function registry(cwd: string | null): Promise<JsonResult> {
  return (await invoke("registry", { cwd })) as JsonResult;
}

/** Calls the `plugins_ls` Tauri command (`mise plugins ls --urls`).
 *  `plugins ls` has no `--json` flag, so the runner parses the
 *  plain-text table behind the boundary and returns a JSON array of
 *  `{name, source}` rows (issue #51). */
export async function pluginsLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("plugins_ls", { cwd }, { reportFailure: false })) as JsonResult;
}
