// Mise runner — pure Rust logic for locating and talking to the mise CLI.
// No Tauri imports here so it can be unit-tested against a fixture binary.
//
// Layering (see docs/agents/architecture.md):
//   src-tauri commands  →  this module (mise runner)  →  mise CLI
//
// Every type crossing the Rust↔TS boundary uses `#[serde(rename_all = "camelCase")]`.
// Errors are data: they travel as `AppError` to the UI; the runner never panics.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Minimum supported mise version (see docs/agents/conventions.md).
pub const MIN_MISE_VERSION: &str = "2025.1.0";

/// Generous but finite timeout for the `mise version --json` probe.
pub const DETECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Hard ceiling for the streaming execution panel. The user can cancel;
/// the runner auto-kills if a process runs past this.
pub const STREAMING_TIMEOUT: Duration = Duration::from_secs(60 * 30);

/// Finite, generous-but-bounded timeout for read-only (non-streaming)
/// mise queries (`mise ls`, `mise outdated`, `mise env`, `mise config
/// ls`, `mise settings ls`, `mise doctor`, `mise registry`, `mise
/// plugins ls`, `mise tasks ls`, `mise trust --show`, …). These run on
/// a background thread (issue #46) so the window stays responsive, but a
/// genuinely hung mise process must still be reaped rather than lingering
/// for the streaming ceiling. `mise outdated` hits the network per backend
/// and can be slow, so this is generous — but it is no longer 30 minutes.
pub const READ_TIMEOUT: Duration = Duration::from_secs(120);

/// Fixed set of AppError codes (see docs/agents/conventions.md).
/// Adding a new code is a deliberate API change.
pub mod code {
    pub const MISE_NOT_FOUND: &str = "MISE_NOT_FOUND";
    pub const MISE_TOO_OLD: &str = "MISE_TOO_OLD";
    pub const COMMAND_FAILED: &str = "COMMAND_FAILED";
    pub const PARSE_FAILED: &str = "PARSE_FAILED";
    pub const TIMEOUT: &str = "TIMEOUT";
    pub const UNTRUSTED: &str = "UNTRUSTED";
    /// One-off addition for issue #28's open-in-terminal command
    /// (Linux only): no common terminal emulator was found on
    /// `PATH`. Documented in `docs/agents/conventions.md`.
    pub const TERMINAL_NOT_FOUND: &str = "TERMINAL_NOT_FOUND";
}

/// Result of a successful mise probe.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectMiseOk {
    /// Full version string as mise reports it, e.g. `"2026.8.14 macos-arm64 (2026-08-26)"`.
    pub version: String,
    /// The `YYYY.MM.DD` prefix of `version` — the part we compare to the floor.
    pub version_date: String,
    /// Absolute path to the located mise binary.
    pub binary_path: PathBuf,
    /// Raw JSON payload from `mise version --json` for the UI to display.
    pub raw: serde_json::Value,
}

/// Error type that crosses the Rust↔TS boundary.
/// `code` is a fixed SCREAMING_SNAKE value (see `code` module);
/// `message` is an i18n key resolved in the UI; `stderr` is raw mise stderr when present.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub stderr: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>, stderr: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            stderr: stderr.into(),
        }
    }

    pub fn not_found() -> Self {
        Self::new(code::MISE_NOT_FOUND, "errors.miseNotFound", String::new())
    }

    pub fn too_old(found: &str, minimum: &str) -> Self {
        Self::new(
            code::MISE_TOO_OLD,
            format!("errors.miseTooOld|found={found}|minimum={minimum}"),
            String::new(),
        )
    }

    pub fn command_failed(message: impl Into<String>, stderr: impl Into<String>) -> Self {
        Self::new(code::COMMAND_FAILED, message, stderr)
    }

    pub fn parse_failed(message: impl Into<String>, stderr: impl Into<String>) -> Self {
        Self::new(code::PARSE_FAILED, message, stderr)
    }

    pub fn timeout() -> Self {
        Self::new(code::TIMEOUT, "errors.timeout", String::new())
    }
}

/// Well-known places to look for the mise binary on the host.
pub fn candidate_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();

    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        paths.push(home.join(".local/bin/mise"));
        paths.push(home.join(".cargo/bin/mise"));
    }

    paths.push(PathBuf::from("/opt/homebrew/bin/mise"));
    paths.push(PathBuf::from("/usr/local/bin/mise"));

    let mut seen = std::collections::HashSet::new();
    paths.retain(|p| seen.insert(p.clone()));
    paths
}

/// Probe for a working mise binary in the well-known locations.
pub fn locate_mise() -> Result<PathBuf, AppError> {
    for p in candidate_paths() {
        if p.is_file() {
            return Ok(p);
        }
    }
    Err(AppError::not_found())
}

/// Extract the `YYYY.MM.DD` date prefix from a mise version string like
/// `"2026.8.14 macos-arm64 (2026-08-26)"`.
pub fn extract_date(version: &str) -> Option<(String, [u32; 3])> {
    let head = version.split_whitespace().next()?;
    let parts: Vec<&str> = head.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let y = parts[0].parse::<u32>().ok()?;
    let m = parts[1].parse::<u32>().ok()?;
    let d = parts[2].parse::<u32>().ok()?;
    Some((head.to_string(), [y, m, d]))
}

pub fn meets_minimum(found: &str, minimum: &str) -> bool {
    let Some((_, a)) = extract_date(found) else {
        return false;
    };
    let Some((_, b)) = extract_date(minimum) else {
        return false;
    };
    a >= b
}

/// Outcome of a captured run.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcome {
    /// Full stdout bytes (decoded as UTF-8 lossy for transport).
    pub stdout: String,
    /// Full stderr bytes (decoded as UTF-8 lossy for transport).
    pub stderr: String,
    /// Exit code if the process exited normally; `-1` if killed by signal/timeout.
    pub exit_code: i32,
    /// Wall-clock duration in milliseconds.
    pub duration_ms: u64,
    /// True when the runner killed the process because it exceeded the timeout.
    pub timed_out: bool,
}

/// A single line emitted by a streaming run. The frontend renders these
/// in the execution panel; the final `Exit` event carries the same fields
/// as `RunOutcome` minus the buffered stdout/stderr (the panel already has
/// the lines). Uses camelCase on the wire to match `RunOutcome` and the
/// frontend's channel parser.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RunEvent {
    Stdout { line: String },
    Stderr { line: String },
    Exit {
        exit_code: i32,
        duration_ms: u64,
        timed_out: bool,
    },
}

/// A request to run the mise CLI. `cwd` becomes `-C <dir>`; `args` is the
/// rest of the argv passed verbatim.
#[derive(Debug, Clone)]
pub struct RunRequest {
    pub cwd: Option<PathBuf>,
    pub args: Vec<String>,
}

impl RunRequest {
    pub fn new(args: Vec<String>) -> Self {
        Self { cwd: None, args }
    }

    pub fn with_cwd(args: Vec<String>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            cwd: Some(cwd.into()),
            args,
        }
    }
}

/// Spawn the mise binary and capture its output, enforcing a finite
/// `timeout`. This is the low-level entry point the runner routes every
/// call through.
///
/// `on_event` is called for each line and once at the end with `Exit`.
/// The callback runs on a background thread; keep it cheap (the Tauri
/// command's `Channel::send` is cheap by design).
fn run_mise_timed<F>(
    mise_path: &Path,
    req: &RunRequest,
    mut on_event: F,
    timeout: Duration,
) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    let mut cmd = Command::new(mise_path);
    if let Some(cwd) = &req.cwd {
        cmd.arg("-C").arg(cwd);
    }
    for a in &req.args {
        cmd.arg(a);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::not_found());
        }
        Err(e) => {
            return Err(AppError::command_failed(
                format!("failed to spawn mise: {e}"),
                String::new(),
            ));
        }
    };

    let mut stdout = child.stdout.take().expect("piped");
    let mut stderr = child.stderr.take().expect("piped");

    let (out_tx, out_rx) = channel::<String>();
    let (err_tx, err_rx) = channel::<String>();

    // Reader threads: split on '\n' and forward one line per channel send.
    let out_thread = thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(&mut stdout);
        for line in reader.lines().map_while(Result::ok) {
            if out_tx.send(line).is_err() {
                break;
            }
        }
    });
    let err_thread = thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(&mut stderr);
        for line in reader.lines().map_while(Result::ok) {
            if err_tx.send(line).is_err() {
                break;
            }
        }
    });

    let started = Instant::now();
    let deadline = timeout;
    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Drain remaining lines.
                while let Ok(line) = out_rx.try_recv() {
                    on_event(RunEvent::Stdout { line: line.clone() });
                    stdout_buf.push_str(&line);
                    stdout_buf.push('\n');
                }
                while let Ok(line) = err_rx.try_recv() {
                    on_event(RunEvent::Stderr { line: line.clone() });
                    stderr_buf.push_str(&line);
                    stderr_buf.push('\n');
                }
                let _ = out_thread.join();
                let _ = err_thread.join();

                let duration_ms = started.elapsed().as_millis() as u64;
                let exit_code = status.code().unwrap_or(-1);
                let timed_out = false;
                on_event(RunEvent::Exit {
                    exit_code,
                    duration_ms,
                    timed_out,
                });
                let outcome = RunOutcome {
                    stdout: stdout_buf,
                    stderr: stderr_buf,
                    exit_code,
                    duration_ms,
                    timed_out,
                };
                return Ok(outcome);
            }
            Ok(None) => {
                // Non-blocking drain of pending lines so the UI sees output in real time.
                while let Ok(line) = out_rx.try_recv() {
                    on_event(RunEvent::Stdout { line: line.clone() });
                    stdout_buf.push_str(&line);
                    stdout_buf.push('\n');
                }
                while let Ok(line) = err_rx.try_recv() {
                    on_event(RunEvent::Stderr { line: line.clone() });
                    stderr_buf.push_str(&line);
                    stderr_buf.push('\n');
                }
                if started.elapsed() > deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = out_thread.join();
                    let _ = err_thread.join();
                    on_event(RunEvent::Exit {
                        exit_code: -1,
                        duration_ms: started.elapsed().as_millis() as u64,
                        timed_out: true,
                    });
                    return Err(AppError::timeout());
                }
                // Brief sleep so we don't spin.
                let remaining = deadline.saturating_sub(started.elapsed());
                let slice = remaining.min(Duration::from_millis(50));
                match out_rx.recv_timeout(slice) {
                    Ok(line) => {
                        on_event(RunEvent::Stdout { line: line.clone() });
                        stdout_buf.push_str(&line);
                        stdout_buf.push('\n');
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => {
                        // stdout closed; loop again to check exit
                    }
                }
            }
            Err(e) => {
                return Err(AppError::command_failed(
                    format!("error waiting for mise: {e}"),
                    String::new(),
                ));
            }
        }
    }
}

/// Streaming (cancellable) entry point for the execution panel. Keeps
/// the 30-minute `STREAMING_TIMEOUT` ceiling so a long install / run /
/// self-update is reaped if the user does not cancel it first. Read-only
/// queries must not use this — they route through `run_mise_json` /
/// `run_mise_timed(..., READ_TIMEOUT)` so a hung process is reaped far
/// sooner and never blocks the window (issue #46).
pub fn run_mise<F>(mise_path: &Path, req: &RunRequest, on_event: F) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    run_mise_timed(mise_path, req, on_event, STREAMING_TIMEOUT)
}

/// Source of an installed tool's version, as reported by `mise ls --json`.
/// mise has a small set of well-known sources (the global / local
/// toml files, environment overrides, idle). The `type` is the
/// discriminator; other fields are optional and may be absent when
/// the tool was not pinned by a config file.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MiseSource {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// One row of `mise ls --json` (a single installed version of a tool).
/// All fields are `serde(default)` so a forked mise that omits one of
/// them does not break the UI.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MiseLsItem {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub requested_version: Option<String>,
    #[serde(default)]
    pub install_path: Option<String>,
    #[serde(default)]
    pub symlinked_to: Option<String>,
    #[serde(default)]
    pub source: Option<MiseSource>,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub active: bool,
}

/// One row of `mise outdated --json` (a tool with a newer version
/// available than the one currently requested).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MiseOutdatedItem {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub requested: Option<String>,
    #[serde(default)]
    pub current: Option<String>,
    #[serde(default)]
    pub bump: Option<String>,
    #[serde(default)]
    pub latest: Option<String>,
    #[serde(default)]
    pub source: Option<MiseSource>,
}

/// One row of `mise ls-remote --json <tool>`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MiseLsRemoteItem {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// Run an arbitrary read-only mise command and return its JSON
/// payload as a `serde_json::Value`. Used by the tools page (#21) for
/// `mise ls --json`, `mise outdated --json`, and `mise ls-remote
/// --json <tool>`. The typed shapes above document the expected
/// shape; the actual parsing into TS types happens on the JS side
/// because the mise JSON has drifted historically (new optional
/// fields appear between minor releases) and keeping the boundary
/// tolerant is cheaper than keeping the Rust types in lockstep.
///
/// Errors:
/// * non-zero exit → `COMMAND_FAILED` with stderr preserved verbatim
/// * malformed JSON → `PARSE_FAILED` with the raw payload logged
/// * timeout → `TIMEOUT`
pub fn run_mise_json(
    mise_path: &Path,
    req: &RunRequest,
) -> Result<serde_json::Value, AppError> {
    let outcome = run_mise_timed(mise_path, req, |_| {}, READ_TIMEOUT)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    let value: serde_json::Value = serde_json::from_slice(outcome.stdout.as_bytes())
        .map_err(|e| {
            AppError::parse_failed(
                format!("invalid mise JSON output: {e}"),
                outcome.stderr.clone(),
            )
        })?;
    Ok(value)
}

/// `mise ls --json` — the global tools list. Returns the raw JSON
/// object mise emits (`{tool: [items...]}`); the typed `MiseLsItem`
/// shape above documents the expected fields.
pub fn mise_ls(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(vec!["ls".to_string(), "--json".to_string()], c),
        None => RunRequest::new(vec!["ls".to_string(), "--json".to_string()]),
    };
    run_mise_json(mise_path, &req)
}

/// `mise ls --json <tool>` — the installed versions for a single
/// tool, including non-active ones (faithful to `mise ls <tool>`).
/// Returns the raw JSON object mise emits (`{tool: [items...]}`); the
/// typed `MiseLsItem` shape above documents the per-item fields. The
/// JS side flattens the single-tool payload into a row list.
pub fn mise_ls_tool(
    mise_path: &Path,
    cwd: Option<&Path>,
    tool: &str,
) -> Result<serde_json::Value, AppError> {
    if tool.is_empty() {
        return Err(AppError::command_failed(
            "mise_ls_tool: tool name is empty",
            String::new(),
        ));
    }
    let args = vec![
        "ls".to_string(),
        "--json".to_string(),
        tool.to_string(),
    ];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

/// `mise outdated --json` — the outdated-tools map. Returns the raw
/// JSON object mise emits (`{tool: MiseOutdatedItem}` or `{}` when
/// no tools are outdated). The `--bump` flag is added to the
/// invocation so the JSON includes both `current` and `bump` even
/// when the current version is already the latest.
pub fn mise_outdated(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["outdated".to_string(), "--json".to_string(), "--bump".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

/// `mise env --json` — the resolved environment for the current
/// directory context. Returns the raw JSON object mise emits
/// (`{VAR: value, ...}`); every value is a string. Used by the
/// directory-preview page (#24) to surface env vars alongside the
/// tools. Like the tools commands, the runner accepts `cwd` so the
/// result reflects the directory-scoped resolution (the project's
/// `[env]` table is merged into the env map).
pub fn mise_env(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["env".to_string(), "--json".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

/// `mise env --json-extended` — the resolved environment with source
/// annotations for the current directory context. Returns the raw JSON
/// object mise emits (`{VAR: {value, source?, tool?}, ...}`). Used by
/// the first-class Env page (#41) so each row can show where the var
/// came from (config file path and/or contributing tool).
pub fn mise_env_extended(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["env".to_string(), "--json-extended".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

/// Read the `mise.lock` file at `<cwd>/mise.lock` and return its raw
/// text. Returns `Ok(None)` when the file does not exist (a normal
/// outcome — the lockfile is optional). Any other I/O error is
/// propagated as `AppError::command_failed` so the UI can render it
/// alongside the other read-only commands. Used by the
/// directory-preview page (#24) to surface the project's lockfile in
/// a read-only block.
pub fn read_mise_lockfile(cwd: Option<&Path>) -> Result<Option<String>, AppError> {
    let Some(cwd) = cwd else {
        // The lockfile is a per-directory artifact; the global
        // context has no associated lockfile. Treat as "no lockfile".
        return Ok(None);
    };
    let path = cwd.join("mise.lock");
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::command_failed(
            format!("failed to read {}: {e}", path.display()),
            String::new(),
        )),
    }
}

/// One loaded config file, as reported by `mise config ls --json`
/// and enriched with the file's raw text for the preview page's
/// read-only content view (issue #42).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFile {
    /// Absolute path of the config file, as mise reports it.
    pub path: String,
    /// Tool names the file pins (the `tools` array of
    /// `mise config ls --json`). Empty when the file pins none.
    pub tools: Vec<String>,
    /// Raw file text for the read-only content view. `None` when the
    /// file could not be read (deleted between listing and reading,
    /// permission denied, …) — the UI renders a muted fallback.
    pub content: Option<String>,
}

/// Read a config file's raw text. `None` on any I/O failure — a
/// config file listed by mise that vanished before we could read it
/// is a normal outcome, not an error worth failing the whole
/// section over.
fn read_config_file_content(path: &str) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// `mise config ls --json` — the config files mise loads for the
/// current directory context, each enriched with its raw text for
/// the preview page's read-only content view (issue #42).
///
/// mise's JSON array is ordered highest-precedence-first (nearest
/// config file first, global config last — verified against nested
/// directories; the plain-text table prints the same files in the
/// reverse order). The runner preserves that order verbatim so the
/// UI shows precedence exactly as mise resolves it.
///
/// The file paths come from mise itself, never from the UI, so
/// reading their content here is the same read-only surface
/// `read_mise_lockfile` already exposes.
pub fn mise_config_files(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<Vec<ConfigFile>, AppError> {
    let args = vec!["config".to_string(), "ls".to_string(), "--json".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let value = run_mise_json(mise_path, &req)?;
    let entries = value.as_array().ok_or_else(|| {
        AppError::parse_failed(
            "mise config ls --json did not return an array",
            String::new(),
        )
    })?;
    let mut files = Vec::with_capacity(entries.len());
    for entry in entries {
        let Some(path) = entry.get("path").and_then(|p| p.as_str()) else {
            return Err(AppError::parse_failed(
                "mise config ls --json entry missing a `path` string",
                String::new(),
            ));
        };
        let tools = entry
            .get("tools")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        files.push(ConfigFile {
            path: path.to_string(),
            tools,
            content: read_config_file_content(path),
        });
    }
    Ok(files)
}

/// `mise ls-remote --json <tool>` — the list of upstream versions
/// for a single tool. Returns the raw JSON array mise emits
/// (`[{version, created_at?}, ...]`).
pub fn mise_ls_remote(
    mise_path: &Path,
    cwd: Option<&Path>,
    tool: &str,
) -> Result<serde_json::Value, AppError> {
    if tool.is_empty() {
        return Err(AppError::command_failed(
            "mise_ls_remote: tool name is empty",
            String::new(),
        ));
    }
    let args = vec![
        "ls-remote".to_string(),
        "--json".to_string(),
        tool.to_string(),
    ];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

// ---------- Tasks surface (issue #27) ----------
//
// The mise CLI ships `mise tasks` as a first-class subcommand set
// (add, ls, info, edit, run, …). For this ticket we only need:
//
//   * `mise tasks ls --json`        → list tasks for the cwd
//                                     ([MiseTask, ...])
//   * `mise run <name>`             → run a single task (reused via
//                                     the existing `run_mise_command`
//                                     Tauri command; no new IPC)
//   * `mise tasks add <name> <...> -- <run>` → add or update a task
//                                     (the only documented write path;
//                                     direct TOML edits are forbidden
//                                     by the architecture doc)
//   * `mise tasks edit --path <n>`  → print the path of the file
//                                     that defines the task (used as
//                                     the "open the TOML directly"
//                                     affordance for advanced users)
//
// All of these are wired through the existing `run_mise` and
// `run_mise_json` primitives; this section only adds typed shapes,
// thin wrappers, and the argv builders the JS side consumes.
//
//   The `run` field of `mise tasks ls --json` is an **array of
//   strings** (a single command may be split across multiple lines in
//   the TOML). The JS parser flattens it to a single string for
//   display. Other fields are documented below; every field is
//   `serde(default)` because mise's task JSON has drifted historically
//   (new optional fields appear between minor releases).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MiseTask {
    /// The task name (the key under `[tasks]` in mise.toml).
    #[serde(default)]
    pub name: String,
    /// Alternative names for the task. Optional; mise's older versions
    /// did not emit this field.
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Free-text description from `[tasks.<name>] description = "…"`.
    /// Empty when unset.
    #[serde(default)]
    pub description: String,
    /// The raw run command lines, one per TOML `run` line. The JS
    /// side joins them with `\n` for display. Empty when the task is
    /// defined only by `run_windows` / sources / outputs.
    #[serde(default)]
    pub run: Vec<String>,
    /// Task names this task depends on. Empty when the task has no
    /// `depends` array.
    #[serde(default)]
    pub depends: Vec<String>,
    /// Absolute path of the config file the task came from. Empty
    /// for tasks defined as standalone scripts under `.mise/tasks/`.
    #[serde(default)]
    pub source: String,
    /// The `dir` field — the cwd the task is executed in, when set.
    /// Empty when the task inherits the parent's cwd.
    #[serde(default)]
    pub dir: String,
    /// True when the task is marked `hide = true` in the TOML.
    #[serde(default)]
    pub hide: bool,
}

/// `mise tasks ls --json` — the list of tasks for the current
/// directory context. Returns the raw JSON array mise emits
/// (`[MiseTask, ...]`); the typed `MiseTask` shape above documents
/// the expected fields. The parser on the JS side walks the raw
/// value and tolerates drift (see the rationale on `run_mise_json`).
pub fn mise_tasks_ls(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec![
        "tasks".to_string(),
        "ls".to_string(),
        "--json".to_string(),
    ];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

/// `mise tasks edit --path <name>` — return the absolute path of
/// the file that defines the named task. mise prints a single line
/// (the path) on stdout; the runner surfaces it as `Some(path)` on
/// exit 0, `None` on non-zero exit (the file does not exist or the
/// task is not in scope). The JS side uses this as the
/// "open the TOML directly" affordance — the path is fed to
/// `tauri-plugin-opener` which calls the OS's default editor.
pub fn mise_tasks_edit_path(
    mise_path: &Path,
    cwd: Option<&Path>,
    name: &str,
) -> Result<Option<String>, AppError> {
    if name.is_empty() {
        return Err(AppError::command_failed(
            "mise_tasks_edit_path: task name is empty",
            String::new(),
        ));
    }
    let args = vec![
        "tasks".to_string(),
        "edit".to_string(),
        "--path".to_string(),
        name.to_string(),
    ];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!(
                "mise tasks edit --path {} exited with status {}",
                name, outcome.exit_code
            ),
            outcome.stderr,
        ));
    }
    let path = outcome.stdout.trim().to_string();
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Some(path))
}

/// Trust state for a directory's mise config. Mirrors the
/// architecture doc's "MISE_SAFE=1" semantics:
///
///   * `ConfigTrusted`   — a `mise.toml` was found in the cwd's
///      ancestry and is trusted; the trust banner stays hidden and
///      mutating actions are allowed.
///   * `ConfigUntrusted` — a `mise.toml` was found but the user
///      has not trusted it yet. The directory preview banner
///      surfaces this; mutating actions must route to the banner.
///   * `NoConfig`        — no `mise.toml` is in scope. There is
///      nothing to trust, so the banner stays hidden and the
///      `useTrustGuard()` API allows mutations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TrustSource {
    ConfigTrusted,
    ConfigUntrusted,
    NoConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustStatus {
    pub source: TrustSource,
    /// Absolute path of the config file the trust probe decided on
    /// (or the cwd when `source = NoConfig`). The UI uses this for
    /// debugging only; the trust gate only cares about `source`.
    pub path: String,
}

/// Probe the trust state for `<cwd>` by running `mise trust --show`.
/// The probe is read-only; `mise trust --show` exits 0 in every
/// state — the only signal is the body of stdout. The output format
/// is one line per config file in scope:
///
///   * `<path>: trusted`
///   * `<path>: untrusted`
///
/// When no `mise.toml` is in scope, mise prints
/// `No trusted config files found.` (exit code 0). The first
/// status-bearing line wins — `trust --show` lists the nearest
/// config first, and that is the one governing the cwd.
pub fn check_trust(mise_path: &Path, cwd: Option<&Path>) -> Result<TrustStatus, AppError> {
    let args = vec!["trust".to_string(), "--show".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise trust --show exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    let cwd_fallback = cwd
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    for line in outcome.stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("No trusted") {
            continue;
        }
        // `mise trust --show` emits lines like
        //   `<path>: trusted` / `<path>: untrusted`
        // and on some platforms the path may include a drive letter
        // (Windows). Split on the LAST colon to keep the path
        // intact.
        if let Some((path_part, status_part)) = line.rsplit_once(':') {
            let status = status_part.trim();
            let path = path_part.trim().to_string();
            if status == "trusted" {
                return Ok(TrustStatus {
                    source: TrustSource::ConfigTrusted,
                    path,
                });
            }
            if status == "untrusted" {
                return Ok(TrustStatus {
                    source: TrustSource::ConfigUntrusted,
                    path,
                });
            }
        }
    }
    Ok(TrustStatus {
        source: TrustSource::NoConfig,
        path: cwd_fallback,
    })
}

/// `mise trust` — mark the active directory's `mise.toml` as
/// trusted. Streams each line via `on_event` so the execution panel
/// surfaces the trust attempt live. The caller is responsible for
/// invalidating the trust cache (via `trust_check`) once the
/// outcome returns Ok — this function does not refresh the cache
/// itself, so a successful run followed by a re-probe is the
/// intended pattern.
///
/// This is a thin wrapper around the runner that exists at the
/// runner layer so the Tauri command surface can keep a one-line
/// per-command shape; the underlying `run_mise` already does the
/// heavy lifting. A non-zero exit maps to `COMMAND_FAILED` so the
/// JS side can render stderr in the panel (matches the
/// `run_self_update` pattern in `install.rs`).
pub fn run_trust<F>(
    mise_path: &Path,
    cwd: Option<&Path>,
    on_event: F,
) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    let args = vec!["trust".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise(mise_path, &req, on_event)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise trust exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    Ok(outcome)
}

// ---------- Settings, doctor, registry surface (issue #29) ----------
//
// Three read-mostly pages that all follow the same runner pattern:
//
//   * `mise settings ls --json-extended`  → settings table with source
//                                           badges (the only mutation is
//                                           `mise settings set/unset`)
//   * `mise doctor --json`                → structured health page
//   * `mise registry --json`              → browsable registry table
//
// The runner ships the raw JSON (or a structured fallback) so the JS
// side never has to parse CLI table output. For `doctor` and
// `registry`, older mise versions may not support `--json`; in that
// case the runner captures the plain text output and re-encodes it as
// JSON behind the boundary (doctor lines keep their `[OK]`/`[WARN]`/
// `[ERROR]` status, registry rows are parsed from the space-padded
// table).

/// `mise settings ls --json-extended` for the active context. When
/// `cwd` is `Some`, `--local` is added so the list reflects the
/// project `mise.toml`; otherwise the global config is queried. When
/// `all` is true, `--all` is added so unset keys (with their default
/// values) are listed too — the Settings page's opt-in "--all" view
/// and its key-name completion both read from this (issue #52).
pub fn mise_settings_ls(
    mise_path: &Path,
    cwd: Option<&Path>,
    all: bool,
) -> Result<serde_json::Value, AppError> {
    let mut args = vec![
        "settings".to_string(),
        "ls".to_string(),
        "--json-extended".to_string(),
    ];
    if all {
        args.push("--all".to_string());
    }
    if cwd.is_some() {
        args.push("--local".to_string());
    }
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    run_mise_json(mise_path, &req)
}

/// Build the argv for `mise settings set [--local] <key> <value>`.
/// The `local` flag is passed when the active context is a project.
pub fn mise_settings_set_argv(key: &str, value: &str, local: bool) -> Vec<String> {
    let mut argv = vec!["settings".to_string(), "set".to_string()];
    if local {
        argv.push("--local".to_string());
    }
    argv.push(key.to_string());
    argv.push(value.to_string());
    argv
}

/// Build the argv for `mise settings unset [--local] <key>`.
pub fn mise_settings_unset_argv(key: &str, local: bool) -> Vec<String> {
    let mut argv = vec!["settings".to_string(), "unset".to_string()];
    if local {
        argv.push("--local".to_string());
    }
    argv.push(key.to_string());
    argv
}

/// Status tag the doctor parser extracts from a raw text line.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DoctorLineStatus {
    Ok,
    Warn,
    Error,
    Neutral,
}

/// One line of raw `mise doctor` output, parsed behind the runner so
/// the UI can tint rows by status.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorLine {
    pub text: String,
    pub status: DoctorLineStatus,
}

fn classify_doctor_line(line: &str) -> DoctorLineStatus {
    if line.contains("[OK]") {
        DoctorLineStatus::Ok
    } else if line.contains("[WARN]") {
        DoctorLineStatus::Warn
    } else if line.contains("[ERROR]") {
        DoctorLineStatus::Error
    } else {
        DoctorLineStatus::Neutral
    }
}

fn doctor_text_fallback(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["doctor".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    // A non-zero exit is still valuable diagnostic output for the
    // health page; surface the lines instead of failing the command.
    let lines: Vec<DoctorLine> = outcome
        .stdout
        .lines()
        .map(|line| DoctorLine {
            text: line.to_string(),
            status: classify_doctor_line(line),
        })
        .collect();
    Ok(serde_json::json!({
        "rawLines": lines,
        "rawText": outcome.stdout,
    }))
}

/// `mise doctor --json` for the active context. If the mise binary
/// does not support `--json` (or the output is not valid JSON), the
/// runner falls back to capturing the raw `mise doctor` text and
/// returning it as a structured array of tinted lines.
pub fn mise_doctor(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["doctor".to_string(), "--json".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    match run_mise_json(mise_path, &req) {
        Ok(v) => Ok(v),
        Err(_) => doctor_text_fallback(mise_path, cwd),
    }
}

fn registry_table_fallback(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["registry".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise registry exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    let rows: Vec<serde_json::Value> = outcome
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let mut parts = line.split_whitespace();
            let short = parts.next().unwrap_or("").to_string();
            let backends: Vec<String> = parts.map(|s| s.to_string()).collect();
            serde_json::json!({ "short": short, "backends": backends })
        })
        .collect();
    Ok(serde_json::Value::Array(rows))
}

/// `mise registry --json` for the active context. If the mise binary
/// does not support `--json` (or the output is not valid JSON), the
/// runner falls back to parsing the plain-text registry table into a
/// JSON array.
pub fn mise_registry(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["registry".to_string(), "--json".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    match run_mise_json(mise_path, &req) {
        Ok(v) => Ok(v),
        Err(_) => registry_table_fallback(mise_path, cwd),
    }
}

/// `mise plugins ls --urls` — the installed plugins list (issue #51).
/// `mise plugins ls` has no `--json` flag (a known JSON gap, see
/// docs/agents/architecture.md), so the runner parses the plain-text
/// table behind the boundary: each non-empty line is
/// `<name><padding><url>` — the name is the first
/// whitespace-delimited token, the source URL the rest of the line
/// (absent when a plugin reports no URL). Names and URLs are shipped
/// verbatim; original case is preserved (ui-ux-rules: data honesty).
pub fn mise_plugins_ls(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec![
        "plugins".to_string(),
        "ls".to_string(),
        "--urls".to_string(),
    ];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT)?;
    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise plugins ls exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    let rows: Vec<serde_json::Value> = outcome
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let name = parts.next().unwrap_or("").to_string();
            if name.is_empty() {
                return None;
            }
            let source = parts.next().unwrap_or("").to_string();
            Some(serde_json::json!({ "name": name, "source": source }))
        })
        .collect();
    Ok(serde_json::Value::Array(rows))
}

// ---------- Global tool mutations (issue #22) ----------
//
// The tools page routes every global tool mutation through the
// existing `run_mise_command` Tauri command — no new IPC surface is
// needed. These pure helpers exist so the JS side has typed builders
// for the four write commands. The argv shapes are documented against
// `mise install --help`, `mise uninstall --help`, and
// `mise upgrade --help`:
//
//   * `mise install <tool>@<version>`  → install a tool/version
//   * `mise uninstall <tool>@<version>`→ remove an installed version
//   * `mise upgrade`                    → upgrade all outdated tools
//   * `mise upgrade <tool>`             → upgrade a single tool
//
// The JS side prepends `-g` when the active context is global, so the
// helpers here emit the pure argv and leave the global flag to the
// caller.

/// Build the argv for `mise install <tool>@<version>`.
pub fn mise_install_argv(tool: &str, version: &str) -> Vec<String> {
    vec![
        "install".to_string(),
        format!("{tool}@{version}"),
    ]
}

/// Build the argv for `mise uninstall <tool>@<version>`. Targeting the
/// exact version keeps the dispatched command identical to the
/// confirmation (issue #56).
pub fn mise_uninstall_argv(tool: &str, version: &str) -> Vec<String> {
    vec!["uninstall".to_string(), format!("{tool}@{version}")]
}

/// Build the argv for `mise upgrade --bump [<tool>]`. The `--bump`
/// flag is required so the upgrade respects the latest version
/// reported by `mise outdated --json --bump` and bumps the version
/// in the config file. When `tool` is `None` the command upgrades
/// every outdated tool; when `Some` it targets a single tool.
pub fn mise_upgrade_argv(tool: Option<&str>) -> Vec<String> {
    let mut argv = vec!["upgrade".to_string(), "--bump".to_string()];
    if let Some(tool) = tool {
        argv.push(tool.to_string());
    }
    argv
}

// ---------- Tasks argv builders (issue #27) ----------
//
// The tasks page drives every write through `run_mise_command` and
// the existing execution panel — no new IPC surface is needed. The
// argv builders here follow the same pure-builder pattern as the
// tool-mutation builders above so a future mise CLI change surfaces
// in `tests/tasks.rs` instead of in production.
//
// Documented against `mise tasks --help`, `mise tasks ls --help`,
// `mise run --help`, and `mise tasks add --help`:
//   * `mise run <name>`                      → run a task
//   * `mise tasks ls --json`                 → list tasks (handled
//                                              by `mise_tasks_ls`)
//   * `mise tasks edit --path <name>`        → print task file path
//   * `mise tasks add <name> [--dep X]… [-- <run>…]`
//                                            → add / update a task;
//                                              flags come before `--`,
//                                              the run command (if
//                                              any) comes after. A
//                                              future v2 ticket that
//                                              adds new task fields
//                                              will extend this
//                                              builder; the same
//                                              shape is used in
//                                              `tests/tasks.rs`.
//
// `run` is split across multiple argv entries (one per shell
// token) so the runner's shell-metacharacter check rejects unsafe
// input — passing the whole command as a single string would
// defeat that guardrail.

/// Build the argv for `mise run <name>`. Reused as the
/// "Run" button on the tasks page; output streams through the
/// execution panel via the existing `run_mise_command` IPC.
pub fn mise_run_task_argv(name: &str) -> Vec<String> {
    vec!["run".to_string(), name.to_string()]
}

/// Build the argv for `mise tasks add <name> [--dep X]… -- <run…>`.
///
/// When `run_tokens` is `Some` the run is emitted after `--` so
/// mise preserves it. When `run_tokens` is `None` the call is
/// `mise tasks add <name> [--dep X]…` (no `--`) — useful for
/// commands that only flip metadata, but **dangerous for editing
/// an existing task**: mise drops the existing `run` key when
/// the new argv lacks the `-- <run>` clause. Callers editing an
/// existing task must always pass `run_tokens`.
///
/// `depends` is appended as a sequence of `--depends <name>` pairs;
/// the `description` flag is appended when present. Both are
/// optional. The args are concatenated into the existing argv
/// shape documented in `mise tasks add --help`:
///
///   `mise tasks add [--alias …] [--description …] [--depends …]… [-D …] [-f] [-H] [-q] [-r] [-s …] [-w …] [--depends-post …] [--outputs …] [--run-windows …] [--shell …] [--silent] <TASK> [-- <RUN>…]`
pub fn mise_tasks_add_argv(
    name: &str,
    description: Option<&str>,
    depends: &[String],
    run_tokens: Option<&[String]>,
) -> Vec<String> {
    let mut argv: Vec<String> = vec!["tasks".to_string(), "add".to_string()];
    if let Some(desc) = description {
        if !desc.is_empty() {
            argv.push("--description".to_string());
            argv.push(desc.to_string());
        }
    }
    for dep in depends {
        if dep.is_empty() {
            continue;
        }
        argv.push("--depends".to_string());
        argv.push(dep.clone());
    }
    argv.push(name.to_string());
    if let Some(tokens) = run_tokens {
        argv.push("--".to_string());
        for t in tokens {
            argv.push(t.clone());
        }
    }
    argv
}

/// Run `mise version --json` and return the parsed result. Thin wrapper
/// around the generalized runner for the probe path.
pub fn detect_mise(mise_path: &Path) -> Result<DetectMiseOk, AppError> {
    let req = RunRequest::new(vec!["version".to_string(), "--json".to_string()]);
    let outcome = run_mise_timed(mise_path, &req, |_| {}, DETECT_TIMEOUT)?;

    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }

    let raw_value: serde_json::Value = serde_json::from_slice(outcome.stdout.as_bytes())
        .map_err(|e| {
            AppError::parse_failed(
                format!("invalid mise version --json output: {e}"),
                outcome.stderr.clone(),
            )
        })?;

    let version = raw_value
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            AppError::parse_failed(
                "mise version --json did not include a `version` string",
                outcome.stderr.clone(),
            )
        })?
        .to_string();

    let version_date = extract_date(&version)
        .map(|(d, _)| d)
        .ok_or_else(|| {
            AppError::parse_failed("version did not start with YYYY.MM.DD", String::new())
        })?;

    if !meets_minimum(&version_date, MIN_MISE_VERSION) {
        return Err(AppError::too_old(&version_date, MIN_MISE_VERSION));
    }

    Ok(DetectMiseOk {
        version,
        version_date,
        binary_path: mise_path.to_path_buf(),
        raw: raw_value,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_date_parses_known_shape() {
        let (s, [y, m, d]) = extract_date("2026.8.14 macos-arm64 (2026-08-26)").unwrap();
        assert_eq!(s, "2026.8.14");
        assert_eq!((y, m, d), (2026, 8, 14));
    }

    #[test]
    fn extract_date_rejects_garbage() {
        assert!(extract_date("nope").is_none());
        assert!(extract_date("2026.8").is_none());
        assert!(extract_date("").is_none());
    }

    #[test]
    fn meets_minimum_orders_by_date() {
        assert!(meets_minimum("2025.1.0", "2025.1.0"));
        assert!(meets_minimum("2025.1.1", "2025.1.0"));
        assert!(meets_minimum("2026.8.14", "2025.1.0"));
        assert!(!meets_minimum("2024.12.31", "2025.1.0"));
        assert!(!meets_minimum("garbage", "2025.1.0"));
    }

    #[test]
    fn candidate_paths_includes_known_macos_locations() {
        let paths = candidate_paths();
        let s: Vec<String> = paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
        assert!(s.iter().any(|p| p.ends_with("/.local/bin/mise")), "paths = {s:?}");
        assert!(s.iter().any(|p| p == "/opt/homebrew/bin/mise"), "paths = {s:?}");
        assert!(s.iter().any(|p| p == "/usr/local/bin/mise"), "paths = {s:?}");
    }

    #[test]
    fn trust_status_serializes_with_camel_case_keys() {
        // The Rust↔TS boundary uses camelCase; the JS side imports
        // `trustStatus.source === "configTrusted" | "configUntrusted"
        // | "noConfig"`. Lock the on-the-wire shape so a stray rename
        // does not silently break the wire contract.
        let trusted = TrustStatus {
            source: TrustSource::ConfigTrusted,
            path: "/tmp/example".to_string(),
        };
        let v = serde_json::to_value(&trusted).unwrap();
        assert_eq!(v["source"], "configTrusted");
        assert_eq!(v["path"], "/tmp/example");

        let untrusted = TrustStatus {
            source: TrustSource::ConfigUntrusted,
            path: "/tmp/example".to_string(),
        };
        let v = serde_json::to_value(&untrusted).unwrap();
        assert_eq!(v["source"], "configUntrusted");

        let no_config = TrustStatus {
            source: TrustSource::NoConfig,
            path: "/tmp/example".to_string(),
        };
        let v = serde_json::to_value(&no_config).unwrap();
        assert_eq!(v["source"], "noConfig");
    }

    #[test]
    fn read_config_file_content_roundtrips_a_real_file() {
        // The preview page's read-only content view (issue #42)
        // ships the file's raw text; a missing file yields None
        // instead of failing the section.
        let dir = std::env::temp_dir().join(format!(
            "misedeck-config-content-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("mise.toml");
        std::fs::write(&file, "[tools]\nnode = \"22\"\n").unwrap();
        let path = file.to_string_lossy().to_string();
        assert_eq!(
            read_config_file_content(&path),
            Some("[tools]\nnode = \"22\"\n".to_string())
        );
        std::fs::remove_file(&file).unwrap();
        assert_eq!(read_config_file_content(&path), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
