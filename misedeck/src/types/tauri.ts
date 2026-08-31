// Types that mirror the Rust `#[serde(rename_all = "camelCase")]` shapes
// defined in `src-tauri/src/mise.rs` and `src-tauri/src/lib.rs`. Keep this
// in sync with the Rust side; do not invent extra fields here.

export interface DetectMiseOk {
  /** Full version string, e.g. `"2026.8.14 macos-arm64 (2026-08-26)"`. */
  version: string;
  /** `YYYY.MM.DD` prefix of `version` — the part we compare to the floor. */
  versionDate: string;
  /** Absolute path to the located mise binary. */
  binaryPath: string;
  /** Raw JSON payload from `mise version --json` for the UI to display. */
  raw: Record<string, unknown>;
}

/**
 * Fixed set of error codes. See `src-tauri/src/mise.rs` (`code` module).
 * Adding a new code is a deliberate API change and must be mirrored
 * here and on the UI. The `TERMINAL_NOT_FOUND` addition is for
 * issue #28's open-in-terminal command (Linux only); see
 * `docs/agents/conventions.md`.
 */
export type AppErrorCode =
  | "MISE_NOT_FOUND"
  | "MISE_TOO_OLD"
  | "COMMAND_FAILED"
  | "PARSE_FAILED"
  | "TIMEOUT"
  | "UNTRUSTED"
  | "TERMINAL_NOT_FOUND";

export interface AppError {
  code: AppErrorCode;
  /** i18n key (optionally with `|key=value` params) — resolved in the UI. */
  message: string;
  /** Raw mise stderr preserved verbatim when a command failed. */
  stderr: string;
}

/**
 * The Tauri command always resolves to a discriminated union instead of
 * throwing. The `kind` tag is the on-the-wire discriminator. Mirrors
 * `DetectMiseResult` in `src-tauri/src/lib.rs`.
 */
export type DetectMiseResult =
  | { kind: "ok"; ok: DetectMiseOk }
  | { kind: "err"; err: AppError };

/**
 * Discriminated union for the read-only tools commands
 * (`tools_ls`, `tools_outdated`, `tools_ls_remote`). The Rust
 * boundary returns the raw JSON mise produced as `value`; the JS
 * side parses it into the typed shapes below. Mirrors `JsonResult`
 * in `src-tauri/src/lib.rs`.
 */
export type JsonResult =
  | { kind: "ok"; value: Record<string, unknown> }
  | { kind: "err"; err: AppError };

/**
 * Source of an installed tool's version, as reported by
 * `mise ls --json`. The `type` is the discriminator (e.g. "mise.toml",
 * "environment", "idfk"); other fields may be absent.
 */
export interface MiseSource {
  type: string;
  path?: string;
}

/** One row of `mise ls --json` (a single installed version of a tool). */
export interface MiseLsItem {
  version: string;
  requestedVersion?: string;
  installPath?: string;
  symlinkedTo?: string;
  source?: MiseSource;
  installed: boolean;
  active: boolean;
}

/** One row of `mise outdated --json --bump`. */
export interface MiseOutdatedItem {
  name: string;
  requested?: string;
  current?: string;
  bump?: string;
  latest?: string;
  source?: MiseSource;
}

/** One row of `mise ls-remote --json <tool>`. */
export interface MiseLsRemoteItem {
  version: string;
  createdAt?: string;
}

/**
 * One row of `mise tasks ls --json` (issue #27). Mirrors
 * `MiseTask` in `src-tauri/src/mise.rs`. All fields are
 * `serde(default)` on the Rust side, so the JS parser tolerates
 * drift. `run` is an array of strings — a single command may be
 * split across multiple `run` lines in the TOML — and the page
 * joins them with `\n` for display.
 */
export interface MiseTask {
  /** Task name (the key under `[tasks]` in mise.toml). */
  name: string;
  /** Alternative names for the task. Empty when unset. */
  aliases: string[];
  /** Free-text description; empty when unset. */
  description: string;
  /** The run command lines (one per TOML `run` line). */
  run: string[];
  /** Task names this task depends on. */
  depends: string[];
  /** Absolute path of the config file the task came from. */
  source: string;
  /** The `dir` field; empty when the task inherits the cwd. */
  dir: string;
  /** True when the task is marked `hide = true` in the TOML. */
  hide: boolean;
}

/**
 * The `tasks_edit_path` Tauri command returns this discriminated
 * union (issue #27). On success, the path is shipped as `path`
 * (Option<String>); on failure, the structured `AppError` is
 * shipped as `err`. Mirrors `TasksEditPathResult` in
 * `src-tauri/src/lib.rs`.
 */
export type TasksEditPathResult =
  | { kind: "ok"; path: string | null }
  | { kind: "err"; err: AppError };

/**
 * The `read_lockfile` Tauri command returns a discriminated union so
 * the JS side can tell "no lockfile" (None) apart from "the file
 * exists but is empty" (`Some("")`) apart from a hard I/O error
 * (the structured AppError). Mirrors the Tauri command in
 * `src-tauri/src/lib.rs`.
 */
export type LockfileResult =
  | { kind: "ok"; content: string | null }
  | { kind: "err"; err: AppError };

/**
 * Trust state for a directory's mise config (issue #25). Mirrors
 * `TrustSource` in `src-tauri/src/mise.rs` and the architecture
 * doc's "MISE_SAFE=1" semantics.
 *
 *   * `configTrusted`   — a `mise.toml` is in scope and is trusted.
 *   * `configUntrusted` — a `mise.toml` is in scope but the user
 *      has not trusted it yet; the directory preview banner
 *      surfaces this state and mutating actions must route to
 *      the banner.
 *   * `noConfig`        — no `mise.toml` is in scope; nothing to
 *      trust, the banner stays hidden.
 */
export type TrustSource = "configTrusted" | "configUntrusted" | "noConfig";

/**
 * The `trust_check` Tauri command returns this discriminated union.
 * On success, the `TrustStatus` is shipped as `ok`; on failure, the
 * structured `AppError` is shipped as `err`. Mirrors `TrustResult`
 * in `src-tauri/src/lib.rs`.
 */
export interface TrustStatus {
  source: TrustSource;
  /** Path of the config file the trust probe decided on (or the cwd when `source = "noConfig"`). */
  path: string;
}

export type TrustResult =
  | { kind: "ok"; ok: TrustStatus }
  | { kind: "err"; err: AppError };

/**
 * The shell family the activation probe decided on. Mirrors
 * `ShellKind` in `src-tauri/src/shell.rs`. `kind` is the
 * discriminator; the `unknown` variant carries the raw name
 * (e.g. "nushell") so the banner can show it back to the user.
 */
export type ShellKind =
  | { kind: "zsh" }
  | { kind: "bash" }
  | { kind: "fish" }
  | { kind: "powerShell" }
  | { kind: "unknown"; name: string };

/**
 * Result of a shell-activation probe (issue #28). The
 * `shell_activation_check` Tauri command surfaces one of these
 * as the `ok` payload. `activated` is true when the rc file
 * already contains a `mise activate` line; the banner stays
 * hidden in that case. The `rcContents` field is for debugging
 * — the UI never displays the full text.
 */
export interface ActivationStatus {
  shell: ShellKind;
  /** Absolute path of the rc file the probe decided on. Empty
   *  when the shell family is unknown. */
  rcPath: string;
  /** Raw rc file contents (UTF-8, lossy). Empty when the file
   *  does not exist. Debug-only — do not render in the UI. */
  rcContents: string;
  /** True when the rc file already contains a `mise activate` line. */
  activated: boolean;
}

/**
 * The `shell_activation_check` Tauri command returns this
 * discriminated union (issue #28). On success, the structured
 * `ActivationStatus` is shipped as `ok`; on failure, the
 * structured `AppError` is shipped as `err`. Mirrors
 * `ShellActivationResult` in `src-tauri/src/lib.rs`.
 */
export type ShellActivationResult =
  | { kind: "ok"; ok: ActivationStatus }
  | { kind: "err"; err: AppError };

/**
 * Result of a successful `open_in_terminal` invocation
 * (issue #28). The `platform` label is what the runner decided
 * ("macOS" / "Windows" / "Linux"); `terminalApp` is the exact
 * binary or app the command targeted ("Terminal.app" /
 * "cmd.exe" / "gnome-terminal"). `argv` is the exact argv that
 * was spawned — surfaced in the success toast and in debug
 * output.
 */
export interface TerminalOpenOutcome {
  platform: string;
  terminalApp: string;
  path: string;
  argv: string[];
}

/**
 * The `open_in_terminal` Tauri command returns this
 * discriminated union (issue #28). On success, the structured
 * `TerminalOpenOutcome` is shipped as `ok`; on failure, the
 * structured `AppError` is shipped as `err` (the only
 * platform-specific error code is `TERMINAL_NOT_FOUND` on
 * Linux). Mirrors `TerminalOpenResult` in `src-tauri/src/lib.rs`.
 */
export type TerminalOpenResult =
  | { kind: "ok"; ok: TerminalOpenOutcome }
  | { kind: "err"; err: AppError };
