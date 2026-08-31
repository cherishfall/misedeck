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

/// Fixed set of AppError codes (see docs/agents/conventions.md).
/// Adding a new code is a deliberate API change.
pub mod code {
    pub const MISE_NOT_FOUND: &str = "MISE_NOT_FOUND";
    pub const MISE_TOO_OLD: &str = "MISE_TOO_OLD";
    pub const COMMAND_FAILED: &str = "COMMAND_FAILED";
    pub const PARSE_FAILED: &str = "PARSE_FAILED";
    pub const TIMEOUT: &str = "TIMEOUT";
    pub const UNTRUSTED: &str = "UNTRUSTED";
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
/// the lines).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
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
/// timeout. This is the entry point used by the runner.
///
/// `on_event` is called for each line and once at the end with `Exit`.
/// The callback runs on a background thread; keep it cheap (the Tauri
/// command's `Channel::send` is cheap by design).
pub fn run_mise<F>(mise_path: &Path, req: &RunRequest, mut on_event: F) -> Result<RunOutcome, AppError>
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
    let deadline = STREAMING_TIMEOUT;
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
    let outcome = run_mise(mise_path, req, |_| {})?;
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

/// Run `mise version --json` and return the parsed result. Thin wrapper
/// around the generalized runner for the probe path.
pub fn detect_mise(mise_path: &Path) -> Result<DetectMiseOk, AppError> {
    let req = RunRequest::new(vec!["version".to_string(), "--json".to_string()]);
    let outcome = run_mise(mise_path, &req, |_| {})?;

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
}
