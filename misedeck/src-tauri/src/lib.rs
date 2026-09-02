// Tauri command surface for MiseDeck.
//
// Layering (see docs/agents/architecture.md):
//   React UI (src/)  →  Tauri commands (this file)  →  mise runner (mise.rs)  →  mise CLI
//
// Commands are thin: validate input, resolve the mise binary, call the
// runner, shape the result. Everything reusable sits in `mise::`.

use std::path::PathBuf;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::Serialize;

pub mod install;
pub mod mise;
pub mod shell;

use install::{run_install as run_install_script, run_self_update, InstallOutcome, SelfUpdateOutcome};
use mise::{
    check_trust, detect_mise as run_mise_probe, locate_mise, mise_config_files, mise_doctor,
    mise_env, mise_env_extended, mise_ls, mise_ls_remote, mise_outdated, mise_plugins_ls,
    mise_registry, mise_settings_ls, mise_tasks_edit_path, mise_tasks_ls, read_mise_lockfile,
    run_mise, run_trust,
    AppError, DetectMiseOk, RunEvent, RunOutcome, RunRequest,
};
use shell::{check_shell_activation, open_in_terminal as open_in_terminal_inner};

// Re-export `JsonResult` from the lib root so integration tests can
// import it via `misedeck_lib::JsonResult` (mirrors the
// `DetectMiseResult` re-export pattern).
pub use self::json_result::JsonResult;
pub use self::tasks_edit_result::TasksEditPathResult;
pub use self::config_files_result::ConfigFilesResult;
pub use self::trust_result::TrustResult;
pub use self::shell_activation_result::ShellActivationResult;
pub use self::terminal_open_result::TerminalOpenResult;

mod json_result {
    use serde::Serialize;

    use super::mise::AppError;

    /// Discriminated union for the read-only tools commands
    /// (`tools_ls`, `tools_outdated`, `tools_ls_remote`). On success,
    /// the raw JSON payload mise returned is shipped as `value`; on
    /// failure, the structured `AppError` is shipped as `err`. The
    /// JS side parses the `value` into the typed shapes defined in
    /// `types/tauri.ts`.
    #[derive(Debug, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum JsonResult {
        Ok { value: serde_json::Value },
        Err { err: AppError },
    }
}

mod trust_result {
    use serde::Serialize;

    use super::mise::{AppError, TrustStatus};

    /// Discriminated union for the `trust_check` Tauri command
    /// (issue #25). On success, the structured `TrustStatus` is
    /// shipped as `ok`; on failure, the structured `AppError` is
    /// shipped as `err`. Mirrors the `JsonResult` shape so the JS
    /// side can pattern-match on `kind` the same way it does for
    /// the other read-only commands.
    #[derive(Debug, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum TrustResult {
        Ok { ok: TrustStatus },
        Err { err: AppError },
    }
}

mod tasks_edit_result {
    use serde::Serialize;

    use super::mise::AppError;

    /// Discriminated union for the `tasks_edit_path` Tauri command
    /// (issue #27). On success, the absolute path of the file that
    /// defines the task is shipped as `path`; on failure, the
    /// structured `AppError` is shipped as `err`. Mirrors
    /// `TrustResult` so the JS side can pattern-match on `kind`.
    #[derive(Debug, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum TasksEditPathResult {
        Ok { path: Option<String> },
        Err { err: AppError },
    }
}

mod config_files_result {
    use serde::Serialize;

    use super::mise::{AppError, ConfigFile};

    /// Discriminated union for the `config_files` Tauri command
    /// (issue #42). On success, the loaded config files are shipped
    /// as `files` in mise's precedence order (highest first), each
    /// carrying its raw text for the read-only content view; on
    /// failure, the structured `AppError` is shipped as `err`.
    /// Mirrors `TrustResult` so the JS side can pattern-match on
    /// `kind`.
    #[derive(Debug, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum ConfigFilesResult {
        Ok { files: Vec<ConfigFile> },
        Err { err: AppError },
    }
}

mod shell_activation_result {
    use serde::Serialize;

    use super::shell::ActivationStatus;
    use super::mise::AppError;

    /// Discriminated union for the `shell_activation_check` Tauri
    /// command (issue #28). On success, the structured
    /// `ActivationStatus` is shipped as `ok`; on failure, the
    /// structured `AppError` is shipped as `err`. Mirrors
    /// `TrustResult` so the JS side can pattern-match on `kind`.
    #[derive(Debug, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum ShellActivationResult {
        Ok { ok: ActivationStatus },
        Err { err: AppError },
    }
}

mod terminal_open_result {
    use serde::Serialize;

    use super::shell::TerminalOpenOutcome;
    use super::mise::AppError;

    /// Discriminated union for the `open_in_terminal` Tauri command
    /// (issue #28). On success, the structured `TerminalOpenOutcome`
    /// is shipped as `ok`; on failure, the structured `AppError`
    /// is shipped as `err`. Mirrors `TrustResult` so the JS side
    /// can pattern-match on `kind`.
    #[derive(Debug, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum TerminalOpenResult {
        Ok { ok: TerminalOpenOutcome },
        Err { err: AppError },
    }
}

/// Cached path to the mise binary, resolved once on first call to `detect_mise`.
/// Holding it lets subsequent commands skip the filesystem probe and keeps
/// the call cheap for the UI's polling needs.
static MISE_BINARY: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Discriminated union for the mise-detection result. Returning a single
/// structured value (rather than `Result<T, AppError>`) keeps the Tauri
/// IPC contract on the happy path — the JS side always receives a
/// `{kind: "ok" | "err", ...}` object and never has to recover the
/// payload from a thrown error.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DetectMiseResult {
    Ok { ok: DetectMiseOk },
    Err { err: AppError },
}

/// Result of a streaming mise command, structured for the IPC boundary.
/// On success, the final `outcome` is returned (the streaming events
/// have already been delivered via the channel). On failure, the
/// structured `AppError` is returned so the JS side can render the
/// correct branch.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunCommandResult {
    Ok { outcome: RunOutcome },
    Err { err: AppError },
}

/// Result of a streaming install / self-update run. The success variant
/// carries the post-run outcome (the streaming events have already
/// been delivered via the channel); the error variant carries the
/// structured `AppError` for the UI to render. The success variant
/// flattens the outcome fields so the JS side sees a single object
/// with `stdout`, `stderr`, `exitCode`, `durationMs`, `timedOut` —
/// the same shape `RunCommandResult` uses.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InstallCommandResult {
    Ok {
        #[serde(flatten)]
        outcome: InstallOutcome,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        new_version: Option<String>,
    },
    Err { err: AppError },
}

/// Probe for the mise binary, run `mise version --json`, and return the
/// typed result as a structured enum (never throws on the JS side).
#[tauri::command]
fn detect_mise() -> DetectMiseResult {
    let path = {
        let cached = MISE_BINARY.lock().expect("mise path mutex poisoned");
        cached.clone()
    };
    let path = match path {
        Some(p) => p,
        None => match locate_mise() {
            Ok(p) => {
                *MISE_BINARY.lock().expect("mise path mutex poisoned") = Some(p.clone());
                p
            }
            Err(e) => return DetectMiseResult::Err { err: e },
        },
    };
    match run_mise_probe(&path) {
        Ok(ok) => DetectMiseResult::Ok { ok },
        Err(e) => DetectMiseResult::Err { err: e },
    }
}

/// Run an arbitrary mise command, streaming each line to the UI via the
/// `on_event` channel. The final result is returned as a structured
/// `RunCommandResult`.
#[tauri::command]
fn run_mise_command(
    cwd: Option<String>,
    args: Vec<String>,
    on_event: tauri::ipc::Channel<RunEvent>,
) -> RunCommandResult {
    // Validate args: must be non-empty, no shell metacharacters.
    if args.is_empty() {
        return RunCommandResult::Err {
            err: AppError::command_failed(
                "run_mise_command called with empty args",
                String::new(),
            ),
        };
    }
    for a in &args {
        if a.contains(';') || a.contains('|') || a.contains('&') || a.contains('`')
            || a.contains('$') || a.contains('\n') || a.contains('\r') {
            return RunCommandResult::Err {
                err: AppError::command_failed(
                    format!("run_mise_command: arg contains shell metacharacter: {a:?}"),
                    String::new(),
                ),
            };
        }
    }

    // Resolve the mise binary path.
    let path = {
        let cached = MISE_BINARY.lock().expect("mise path mutex poisoned");
        cached.clone()
    };
    let path = match path {
        Some(p) => p,
        None => match locate_mise() {
            Ok(p) => {
                *MISE_BINARY.lock().expect("mise path mutex poisoned") = Some(p.clone());
                p
            }
            Err(e) => return RunCommandResult::Err { err: e },
        },
    };

    let req = RunRequest {
        cwd: cwd.map(PathBuf::from),
        args,
    };

    match run_mise(&path, &req, move |evt| {
        // Channel::send is fallible only if the receiver is dropped;
        // swallow the error rather than panicking in the runner thread.
        let _ = on_event.send(evt);
    }) {
        Ok(outcome) => RunCommandResult::Ok { outcome },
        Err(e) => RunCommandResult::Err { err: e },
    }
}

/// Run the official install script for the current platform, streaming
/// each line via the `on_event` channel. Returns a structured
/// `InstallCommandResult` (the streaming events have already been
/// delivered by the time the final result is returned).
#[tauri::command]
fn install_mise(on_event: tauri::ipc::Channel<RunEvent>) -> InstallCommandResult {
    match run_install_script(move |evt| {
        let _ = on_event.send(evt);
    }) {
        Ok(outcome) => InstallCommandResult::Ok {
            outcome,
            new_version: None,
        },
        Err(e) => InstallCommandResult::Err { err: e },
    }
}

/// Run `mise self-update`, streaming each line via the `on_event`
/// channel. Resolves the cached mise binary; returns the structured
/// `InstallCommandResult` with the post-update version (when the
/// post-update probe succeeded).
#[tauri::command]
fn mise_self_update(on_event: tauri::ipc::Channel<RunEvent>) -> InstallCommandResult {
    // Resolve the mise binary path.
    let path = {
        let cached = MISE_BINARY.lock().expect("mise path mutex poisoned");
        cached.clone()
    };
    let path = match path {
        Some(p) => p,
        None => match locate_mise() {
            Ok(p) => {
                *MISE_BINARY.lock().expect("mise path mutex poisoned") = Some(p.clone());
                p
            }
            Err(e) => return InstallCommandResult::Err { err: e },
        },
    };

    match run_self_update(&path, move |evt| {
        let _ = on_event.send(evt);
    }) {
        Ok(SelfUpdateOutcome { outcome, new_version }) => InstallCommandResult::Ok {
            outcome,
            new_version,
        },
        Err(e) => InstallCommandResult::Err { err: e },
    }
}

/// Resolve the mise binary path, populating the cache on first call.
/// Returns `Err(AppError)` (wrapped in the supplied closure) when the
/// binary cannot be located.
fn resolve_mise_binary<F>(on_err: F) -> Result<PathBuf, AppError>
where
    F: FnOnce(AppError) -> AppError,
{
    let path = {
        let cached = MISE_BINARY.lock().expect("mise path mutex poisoned");
        cached.clone()
    };
    match path {
        Some(p) => Ok(p),
        None => match locate_mise() {
            Ok(p) => {
                *MISE_BINARY.lock().expect("mise path mutex poisoned") = Some(p.clone());
                Ok(p)
            }
            Err(e) => Err(on_err(e)),
        },
    }
}

/// `mise ls --json` for the current directory context. Read-only;
/// returns the raw JSON object mise emits.
#[tauri::command]
fn tools_ls(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_ls(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise outdated --json --bump` for the current directory context.
/// Read-only; returns the raw JSON object mise emits (`{}` when no
/// tools are outdated).
#[tauri::command]
fn tools_outdated(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_outdated(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise ls-remote --json <tool>` for upstream version browsing.
/// Read-only; returns the raw JSON array mise emits. `tool` is
/// rejected when empty so the runner never sees a half-formed argv.
#[tauri::command]
fn tools_ls_remote(cwd: Option<String>, tool: String) -> JsonResult {
    if tool.is_empty() {
        return JsonResult::Err {
            err: AppError::command_failed("tools_ls_remote: tool is empty", String::new()),
        };
    }
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_ls_remote(&path, cwd_path, &tool) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise env --json` for the current directory context. Read-only;
/// returns the raw JSON object mise emits (a flat
/// `Map<String, String>` of var name → value). Used by the
/// directory-preview page (#24) to surface the env alongside the
/// tools.
#[tauri::command]
fn tools_env(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_env(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise env --json-extended` for the current directory context.
/// Read-only; returns the raw JSON object mise emits
/// (`{VAR: {value, source?, tool?}, ...}`) with source annotations.
/// Used by the first-class Env page (#41).
#[tauri::command]
fn env_ls(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_env_extended(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// Read the `mise.lock` file at `<cwd>/mise.lock`. Returns
/// `Ok(Some(content))` when present (content may be empty when the
/// file is zero-byte), `Ok(None)` when absent, or `Err(AppError)`
/// on a hard I/O error. Used by the directory-preview page (#24)
/// to surface the project's lockfile in a read-only block.
#[tauri::command]
fn read_lockfile(cwd: Option<String>) -> Result<Option<String>, AppError> {
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    read_mise_lockfile(cwd_path)
}

/// `mise config ls --json` for the current directory context.
/// Read-only; returns the config files mise loads in precedence
/// order (highest first), each carrying its raw text for the
/// read-only content view. Used by the preview page (issue #42) in
/// both Global and directory contexts.
#[tauri::command]
fn config_files(cwd: Option<String>) -> ConfigFilesResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return ConfigFilesResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_config_files(&path, cwd_path) {
        Ok(files) => ConfigFilesResult::Ok { files },
        Err(e) => ConfigFilesResult::Err { err: e },
    }
}

/// `mise trust --show` for the active directory context. Read-only;
/// returns a structured `TrustStatus` (configTrusted / configUntrusted
/// / noConfig). Drives the directory-preview trust banner (issue #25)
/// and the `useTrustGuard()` API surface that future mutating
/// actions will call before running.
#[tauri::command]
fn trust_check(cwd: Option<String>) -> TrustResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return TrustResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match check_trust(&path, cwd_path) {
        Ok(ok) => TrustResult::Ok { ok },
        Err(e) => TrustResult::Err { err: e },
    }
}

/// `mise trust` — mark the active directory's `mise.toml` as
/// trusted. Streams each line via the same `RunEvent` channel the
/// panel already knows, then returns the aggregated `RunOutcome`.
/// The trust cache is the caller's responsibility to invalidate —
/// `useTrustAction()` on the JS side does this once the
/// `RunCommandResult` resolves Ok.
#[tauri::command]
fn mise_trust(
    cwd: Option<String>,
    on_event: tauri::ipc::Channel<RunEvent>,
) -> RunCommandResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return RunCommandResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match run_trust(&path, cwd_path, move |evt| {
        let _ = on_event.send(evt);
    }) {
        Ok(outcome) => RunCommandResult::Ok { outcome },
        Err(e) => RunCommandResult::Err { err: e },
    }
}

/// `mise tasks ls --json` for the current directory context.
/// Read-only; returns the raw JSON array mise emits. Used by the
/// tasks page (issue #27) to render the per-directory task table.
/// When `cwd` is `None` the global task set is returned (the same
/// surface `mise tasks ls --json` exposes from any directory).
#[tauri::command]
fn tasks_ls(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_tasks_ls(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise tasks edit --path <name>` — return the absolute path of
/// the file that defines the named task. The JS side feeds the
/// path to `tauri-plugin-opener` for the "open the TOML
/// directly" affordance. `name` is rejected when empty so the
/// runner never sees a half-formed argv.
#[tauri::command]
fn tasks_edit_path(cwd: Option<String>, name: String) -> TasksEditPathResult {
    if name.is_empty() {
        return TasksEditPathResult::Err {
            err: AppError::command_failed(
                "tasks_edit_path: task name is empty",
                String::new(),
            ),
        };
    }
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return TasksEditPathResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_tasks_edit_path(&path, cwd_path, &name) {
        Ok(p) => TasksEditPathResult::Ok { path: p },
        Err(e) => TasksEditPathResult::Err { err: e },
    }
}

/// `mise settings ls --json-extended` for the active directory
/// context. Returns the raw JSON object mise emits; the JS side
/// parses it into a table of settings with source badges. When
/// `cwd` is `Some`, `--local` is added so project-level settings
/// are listed.
#[tauri::command]
fn settings_ls(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_settings_ls(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise doctor --json` for the active directory context. Returns
/// the raw JSON payload on success; if the mise binary does not
/// support `--json`, the runner captures the raw doctor text and
/// returns it as a structured array of tinted lines.
#[tauri::command]
fn doctor(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_doctor(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise registry --json` for the active directory context.
/// Returns the raw JSON array mise emits; if the mise binary does
/// not support `--json`, the runner parses the plain-text registry
/// table into a JSON array behind the boundary.
#[tauri::command]
fn registry(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_registry(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// `mise plugins ls --urls` for the active directory context.
/// Read-only; `plugins ls` has no `--json` flag, so the runner parses
/// the plain-text table behind the boundary and returns a JSON array
/// of `{name, source}` rows (issue #51). Used by the plugins page's
/// installed-plugins section.
#[tauri::command]
fn plugins_ls(cwd: Option<String>) -> JsonResult {
    let path = match resolve_mise_binary(|e| e) {
        Ok(p) => p,
        Err(e) => return JsonResult::Err { err: e },
    };
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    match mise_plugins_ls(&path, cwd_path) {
        Ok(value) => JsonResult::Ok { value },
        Err(e) => JsonResult::Err { err: e },
    }
}

/// Detect the user's shell and decide whether the rc file contains
/// a `mise activate` line (issue #28). Read-only; never spawns mise.
/// On a hard I/O error (e.g. permission denied on a sandboxed
/// volume) the structured `AppError` is shipped so the UI can
/// surface it alongside the banner.
#[tauri::command]
fn shell_activation_check() -> ShellActivationResult {
    match check_shell_activation() {
        Ok(ok) => ShellActivationResult::Ok { ok },
        Err(e) => ShellActivationResult::Err {
            err: AppError::command_failed(
                format!("failed to read shell rc file: {e}"),
                String::new(),
            ),
        },
    }
}

/// Open a terminal at the given directory (or `$HOME` when `None`).
/// The `path` is the absolute path of the directory the terminal
/// should land in. Implementation is platform-specific (see the
/// `shell` module); the outcome is a structured
/// `TerminalOpenOutcome` with the platform the command used, so
/// the UI can show a sensible "Opened Terminal.app at <path>"
/// success line and a "no terminal detected" failure line.
#[tauri::command]
fn open_in_terminal(path: Option<String>) -> TerminalOpenResult {
    match open_in_terminal_inner(path.as_deref()) {
        Ok(ok) => TerminalOpenResult::Ok { ok },
        Err(e) => TerminalOpenResult::Err { err: e },
    }
}

/// Apply the app theme to the native window chrome (issue #47).
///
/// Sets the window appearance (`light` | `dark`) so the macOS title
/// bar text and controls — and the Windows dark title bar — follow the
/// in-app theme instead of the system appearance. On macOS the title
/// bar is configured transparent (`titleBarStyle: "Transparent"` in
/// tauri.conf.json), so the window background color shows through it;
/// the color is tinted to the theme's surface token (`--void` in
/// tokens.css) — parchment in light, warm charcoal in dark.
///
/// Window-chrome only; never spawns mise.
#[tauri::command]
fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), AppError> {
    let resolved = match theme.as_str() {
        "light" => tauri::Theme::Light,
        "dark" => tauri::Theme::Dark,
        other => {
            return Err(AppError::command_failed(
                format!("set_window_theme: unknown theme {other:?}"),
                String::new(),
            ));
        }
    };
    window.set_theme(Some(resolved)).map_err(|e| {
        AppError::command_failed(
            format!("set_window_theme: set_theme failed: {e}"),
            String::new(),
        )
    })?;
    #[cfg(target_os = "macos")]
    {
        // `--void` from tokens.css: parchment light / warm charcoal dark.
        let (r, g, b) = match theme.as_str() {
            "light" => (0xfd, 0xf8, 0xf3),
            _ => (0x14, 0x10, 0x10),
        };
        window
            .set_background_color(Some(tauri::window::Color(r, g, b, 0xff)))
            .map_err(|e| {
                AppError::command_failed(
                    format!("set_window_theme: set_background_color failed: {e}"),
                    String::new(),
                )
            })?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            detect_mise,
            run_mise_command,
            install_mise,
            mise_self_update,
            tools_ls,
            tools_outdated,
            tools_ls_remote,
            tools_env,
            env_ls,
            read_lockfile,
            config_files,
            trust_check,
            mise_trust,
            tasks_ls,
            tasks_edit_path,
            settings_ls,
            doctor,
            registry,
            plugins_ls,
            shell_activation_check,
            open_in_terminal,
            set_window_theme
        ])
        .setup(|_app| {
            let mut guard = MISE_BINARY.lock().expect("mise path mutex poisoned");
            if guard.is_none() {
                if let Ok(p) = locate_mise() {
                    *guard = Some(p);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    // The Tauri commands depend on the Tauri runtime; covered indirectly
    // through the integration tests in `tests/mise.rs` and `tests/runner.rs`.
}
