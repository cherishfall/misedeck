// Thin wrapper around the Tauri `invoke` call. Components consume the
// typed result, never raw CLI output.
//
// The Tauri command returns a `DetectMiseResult` discriminated union
// (`{kind: "ok", ok: ...} | {kind: "err", err: ...}`), so the JS side
// always receives a structured object — never a thrown error. The
// `kind` tag is the only stable discriminator the UI pattern-matches on
// (see docs/agents/conventions.md).

import { invoke } from "@tauri-apps/api/core";

import type {
  AppError,
  DetectMiseResult,
  JsonResult,
  LockfileResult,
  ShellActivationResult,
  TasksEditPathResult,
  TerminalOpenResult,
  TrustResult,
} from "../types/tauri";

/** Type-guard for the structured AppError shape. Exported so the
 *  execution panel's reducer can pattern-match the IPC response. */
export function isAppError(value: unknown): value is AppError {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.message === "string" &&
    typeof v.stderr === "string"
  );
}

/** Calls the `detect_mise` Tauri command and returns the typed union. */
export async function detectMise(): Promise<DetectMiseResult> {
  // The Rust command never returns `Result::Err` (it serializes the error
  // as a `{kind: "err", err: ...}` variant instead), so `invoke` should
  // not throw on the happy path. We still wrap in try/catch as a defensive
  // net for IPC-level errors (channel closed, webview torn down, etc.).
  return (await invoke("detect_mise")) as DetectMiseResult;
}

/** Calls the `tools_ls` Tauri command and returns the typed union. */
export async function toolsLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tools_ls", { cwd })) as JsonResult;
}

/** Calls the `tools_outdated` Tauri command and returns the typed union. */
export async function toolsOutdated(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tools_outdated", { cwd })) as JsonResult;
}

/** Calls the `tools_ls_remote` Tauri command and returns the typed union. */
export async function toolsLsRemote(
  cwd: string | null,
  tool: string,
): Promise<JsonResult> {
  return (await invoke("tools_ls_remote", { cwd, tool })) as JsonResult;
}

/** Calls the `tools_env` Tauri command (`mise env --json`). The
 *  payload is the flat `Map<String, String>` mise emits. */
export async function toolsEnv(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tools_env", { cwd })) as JsonResult;
}

/** Calls the `env_ls` Tauri command (`mise env --json-extended`).
 *  The payload is the object mise emits with source annotations
 *  (`{VAR: {value, source?, tool?}, ...}`). Used by the Env page
 *  (#41) so each row can show where the var came from. */
export async function envLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("env_ls", { cwd })) as JsonResult;
}

/** Calls the `read_lockfile` Tauri command. Returns the file's text
 *  or `null` when the directory has no `mise.lock`. */
export async function readMiseLockfile(
  cwd: string | null,
): Promise<LockfileResult> {
  return (await invoke("read_lockfile", { cwd })) as LockfileResult;
}

/** Calls the `trust_check` Tauri command (`mise trust --show`).
 *  Returns a structured `TrustResult` describing the cwd's
 *  config trust state. The UI uses this to decide whether to
 *  render the trust banner. */
export async function trustCheck(cwd: string | null): Promise<TrustResult> {
  return (await invoke("trust_check", { cwd })) as TrustResult;
}

/** Calls the `tasks_ls` Tauri command (`mise tasks ls --json`).
 *  Returns the raw JSON array mise emits (a `[MiseTask]`); the
 *  JS side parses it via `parseTasksLsPayload` in
 *  `api/miseTools.ts`. Used by the tasks page (issue #27). */
export async function tasksLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("tasks_ls", { cwd })) as JsonResult;
}

/** Calls the `tasks_edit_path` Tauri command
 *  (`mise tasks edit --path <name>`). On success, returns the
 *  absolute path of the file that defines the task; on failure,
 *  the structured `AppError`. The page uses this to drive the
 *  "open the TOML directly" affordance (issue #27). */
export async function tasksEditPath(
  cwd: string | null,
  name: string,
): Promise<TasksEditPathResult> {
  return (await invoke("tasks_edit_path", { cwd, name })) as TasksEditPathResult;
}

/** Calls the `shell_activation_check` Tauri command
 *  (issue #28). Detects the user's shell, reads its rc file,
 *  and decides whether `mise activate` is already present. The
 *  banner surfaces the result on every app start; the result is
 *  also cached in the `ActivationProvider` so the panel does not
 *  re-probe on every page render. */
export async function shellActivationCheck(): Promise<ShellActivationResult> {
  return (await invoke("shell_activation_check")) as ShellActivationResult;
}

/** Calls the `open_in_terminal` Tauri command (issue #28).
 *  Launches the user's terminal at the given path (or `$HOME`
 *  when `path` is `null`). On success, the structured
 *  `TerminalOpenOutcome` is shipped as `ok`; on failure, the
 *  structured `AppError` is shipped as `err` (the only
 *  platform-specific code is `TERMINAL_NOT_FOUND` on Linux). */
export async function openInTerminal(
  path: string | null,
): Promise<TerminalOpenResult> {
  return (await invoke("open_in_terminal", { path })) as TerminalOpenResult;
}

/** Calls the `settings_ls` Tauri command (`mise settings ls --json-extended`).
 *  Returns the raw JSON object mise emits; the JS side parses it into
 *  a table of settings with source badges (issue #29). */
export async function settingsLs(cwd: string | null): Promise<JsonResult> {
  return (await invoke("settings_ls", { cwd })) as JsonResult;
}

/** Calls the `doctor` Tauri command (`mise doctor --json`). Returns the
 *  raw JSON payload on success, or a structured fallback with
 *  `rawLines` when the mise binary does not support `--json` (issue
 *  #29). */
export async function doctor(cwd: string | null): Promise<JsonResult> {
  return (await invoke("doctor", { cwd })) as JsonResult;
}

/** Calls the `registry` Tauri command (`mise registry --json`). Returns
 *  the raw JSON array on success, or a parsed table fallback when
 *  `--json` is unavailable (issue #29). */
export async function registry(cwd: string | null): Promise<JsonResult> {
  return (await invoke("registry", { cwd })) as JsonResult;
}
