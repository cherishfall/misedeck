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
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Minimum supported mise version (see docs/agents/conventions.md).
pub const MIN_MISE_VERSION: &str = "2025.1.0";

/// Generous but finite timeout for the `mise version --json` probe.
pub const DETECT_TIMEOUT: Duration = Duration::from_secs(10);

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
        Self::new(
            code::MISE_NOT_FOUND,
            "errors.miseNotFound",
            String::new(),
        )
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
        Self::new(
            code::TIMEOUT,
            "errors.timeout",
            String::new(),
        )
    }
}

/// Well-known places to look for the mise binary on the host.
/// On macOS the common ones are: `~/.local/bin/mise`, `~/.cargo/bin/mise`,
/// Homebrew on Apple Silicon (`/opt/homebrew/bin/mise`), Homebrew on Intel
/// (`/usr/local/bin/mise`). We do not shell out to `which` so the lookup is
/// portable and synchronous.
pub fn candidate_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();

    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        paths.push(home.join(".local/bin/mise"));
        paths.push(home.join(".cargo/bin/mise"));
    }

    paths.push(PathBuf::from("/opt/homebrew/bin/mise"));
    paths.push(PathBuf::from("/usr/local/bin/mise"));

    // Deduplicate while preserving order.
    let mut seen = std::collections::HashSet::new();
    paths.retain(|p| seen.insert(p.clone()));
    paths
}

/// Probe for a working mise binary in the well-known locations.
/// Returns the first path that exists and is executable, or `AppError::not_found()`.
pub fn locate_mise() -> Result<PathBuf, AppError> {
    for p in candidate_paths() {
        if p.is_file() {
            return Ok(p);
        }
    }
    Err(AppError::not_found())
}

/// Extract the `YYYY.MM.DD` date prefix from a mise version string like
/// `"2026.8.14 macos-arm64 (2026-08-26)"`. Returns `None` if the prefix
/// cannot be parsed.
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

/// Compare two `YYYY.MM.DD` date strings. Returns `true` if `found >= minimum`.
pub fn meets_minimum(found: &str, minimum: &str) -> bool {
    let Some((_, a)) = extract_date(found) else {
        return false;
    };
    let Some((_, b)) = extract_date(minimum) else {
        return false;
    };
    a >= b
}

/// Run `mise version --json` at `mise_path` and return the parsed result.
///
/// `mise_path` is the path to the mise binary (or a fixture script in tests).
/// The runner never touches the user's PATH; the caller is responsible for
/// locating the binary (see `locate_mise`).
pub fn detect_mise(mise_path: &Path) -> Result<DetectMiseOk, AppError> {
    let raw = run_mise_version(mise_path)?;

    let raw_value: serde_json::Value = serde_json::from_slice(&raw.stdout).map_err(|e| {
        AppError::parse_failed(
            format!("invalid mise version --json output: {e}"),
            String::from_utf8_lossy(&raw.stderr).to_string(),
        )
    })?;

    let version = raw_value
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            AppError::parse_failed(
                "mise version --json did not include a `version` string",
                String::from_utf8_lossy(&raw.stderr).to_string(),
            )
        })?
        .to_string();

    let version_date = extract_date(&version)
        .map(|(d, _)| d)
        .ok_or_else(|| AppError::parse_failed("version did not start with YYYY.MM.DD", String::new()))?;

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

/// Raw subprocess output. The runner does not interpret the payload; it just
/// captures stdout/stderr/exit so the parser can shape it.
#[derive(Debug, Default, Clone)]
pub struct MiseOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub status_code: Option<i32>,
    pub timed_out: bool,
}

/// Spawn `mise_path version --json` and collect its output, enforcing a timeout.
///
/// We do not stream here (version is tiny and the whole point of `--json` is
/// the UI gets one structured blob). Streaming concerns are deferred to the
/// execution panel in #18.
pub fn run_mise_version(mise_path: &Path) -> Result<MiseOutput, AppError> {
    let mut child = Command::new(mise_path)
        .arg("version")
        .arg("--json")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => AppError::not_found(),
            _ => AppError::command_failed(
                format!("failed to spawn mise: {e}"),
                String::new(),
            ),
        })?;

    let start = Instant::now();
    let mut out = MiseOutput::default();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                out.status_code = status.code();
                if let Some(mut s) = child.stdout.take() {
                    use std::io::Read;
                    let _ = s.read_to_end(&mut out.stdout);
                }
                if let Some(mut s) = child.stderr.take() {
                    use std::io::Read;
                    let _ = s.read_to_end(&mut out.stderr);
                }
                if !status.success() {
                    return Err(AppError::command_failed(
                        format!(
                            "mise exited with status {}",
                            status.code().unwrap_or(-1)
                        ),
                        String::from_utf8_lossy(&out.stderr).to_string(),
                    ));
                }
                return Ok(out);
            }
            Ok(None) => {
                if start.elapsed() > DETECT_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    out.timed_out = true;
                    return Err(AppError::timeout());
                }
                std::thread::sleep(Duration::from_millis(25));
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
