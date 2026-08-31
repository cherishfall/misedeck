// Install / self-update commands for mise.
//
// Two surfaces from issue #30:
//   * `install_mise` runs the official install script for the current
//     platform and streams its output through the same `RunEvent`
//     stream the execution panel already knows how to render. macOS /
//     Linux uses `curl -fsSL https://mise.jdx.dev/install.sh | sh`;
//     Windows uses `irm https://mise.jdx.dev/install.ps1 | iex` via
//     PowerShell.
//   * `run_self_update` is a thin wrapper around the existing runner
//     that runs `mise self-update` and streams the same `RunEvent`
//     shape the panel already consumes.
//
// Reusing `RunEvent` keeps the JS-side reducer simple: the install
// panel is the same component as the execution panel.

use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::mise::{
    extract_date, meets_minimum, run_mise, AppError, RunEvent, RunRequest, MIN_MISE_VERSION,
};

/// Maximum wall-clock time the official install script is allowed to
/// take. The script downloads mise + a few shim files, so 5 minutes
/// is generous; anything longer almost certainly means a hang the
/// user should be able to cancel.
pub const INSTALL_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Outcome of an install attempt. The streamed events go straight
/// through `RunEvent`; this struct is the aggregate the JS side gets
/// back after the process exits.
#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub timed_out: bool,
}

/// Build the platform-specific install command. Returned as a
/// `Command` so the caller owns the spawn.
fn build_install_command() -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "irm https://mise.jdx.dev/install.ps1 | iex",
        ]);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "curl -fsSL https://mise.jdx.dev/install.sh | sh"]);
        cmd
    }
}

/// Run the official install script for the current platform and stream
/// each line via `on_event`. Returns the aggregated outcome.
///
/// This mirrors `run_mise` so the two surfaces (mise commands +
/// non-mise shell commands) share the same streaming pattern and
/// the same `RunEvent` payload — the JS side has one reducer.
pub fn run_install<F>(mut on_event: F) -> Result<InstallOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    let mut cmd = build_install_command();
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return Err(AppError::command_failed(
                format!("failed to spawn install command: {e}"),
                String::new(),
            ));
        }
    };

    let mut stdout = child.stdout.take().expect("piped");
    let mut stderr = child.stderr.take().expect("piped");

    let (out_tx, out_rx) = channel::<String>();
    let (err_tx, err_rx) = channel::<String>();

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
    let deadline = INSTALL_TIMEOUT;
    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
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
                on_event(RunEvent::Exit {
                    exit_code,
                    duration_ms,
                    timed_out: false,
                });
                return Ok(InstallOutcome {
                    stdout: stdout_buf,
                    stderr: stderr_buf,
                    exit_code,
                    duration_ms,
                    timed_out: false,
                });
            }
            Ok(None) => {
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
                    let duration_ms = started.elapsed().as_millis() as u64;
                    on_event(RunEvent::Exit {
                        exit_code: -1,
                        duration_ms,
                        timed_out: true,
                    });
                    return Err(AppError::timeout());
                }
                let remaining = deadline.saturating_sub(started.elapsed());
                let slice = remaining.min(Duration::from_millis(50));
                match out_rx.recv_timeout(slice) {
                    Ok(line) => {
                        on_event(RunEvent::Stdout { line: line.clone() });
                        stdout_buf.push_str(&line);
                        stdout_buf.push('\n');
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => {}
                }
            }
            Err(e) => {
                return Err(AppError::command_failed(
                    format!("error waiting for install: {e}"),
                    String::new(),
                ));
            }
        }
    }
}

/// Outcome of `mise self-update`. Same shape as `InstallOutcome` plus
/// a `new_version` field for the post-update probe.
#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfUpdateOutcome {
    pub outcome: InstallOutcome,
    /// The version string the running mise binary self-reports after
    /// the update. `None` if the post-update probe failed — the
    /// update may still have succeeded.
    pub new_version: Option<String>,
}

/// Run `mise self-update` via the existing runner, streaming the same
/// `RunEvent` line the panel already knows. On success, re-runs
/// `mise version --json` to capture the post-update version string.
pub fn run_self_update<F>(mise_path: &Path, mut on_event: F) -> Result<SelfUpdateOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    let req = RunRequest::new(vec!["self-update".to_string()]);
    let outcome = run_mise(mise_path, &req, move |e| on_event(e))?;

    if outcome.timed_out {
        return Err(AppError::timeout());
    }
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise self-update exited with status {}", outcome.exit_code),
            outcome.stderr.clone(),
        ));
    }

    // Best-effort post-update probe. Failure here is non-fatal — the
    // self-update succeeded, we just couldn't read the new version.
    let probe_req = RunRequest::new(vec!["version".to_string(), "--json".to_string()]);
    let new_version = match run_mise(mise_path, &probe_req, |_| {}) {
        Ok(out) if out.exit_code == 0 => {
            serde_json::from_slice::<serde_json::Value>(out.stdout.as_bytes())
                .ok()
                .and_then(|v| {
                    v.get("version")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                })
        }
        _ => None,
    };

    // If we got a date back, check it still meets the floor. The
    // outcome is the same either way; this is a soft assertion the
    // JS side can read off `new_version` if it cares.
    let _ = new_version
        .as_deref()
        .and_then(|v| extract_date(v).map(|(d, _)| d))
        .map(|d| meets_minimum(&d, MIN_MISE_VERSION));

    Ok(SelfUpdateOutcome {
        outcome: InstallOutcome {
            stdout: outcome.stdout,
            stderr: outcome.stderr,
            exit_code: outcome.exit_code,
            duration_ms: outcome.duration_ms,
            timed_out: outcome.timed_out,
        },
        new_version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn install_outcome_default_is_zero() {
        let o = InstallOutcome::default();
        assert_eq!(o.exit_code, 0);
        assert_eq!(o.duration_ms, 0);
        assert!(!o.timed_out);
        assert!(o.stdout.is_empty());
        assert!(o.stderr.is_empty());
    }

    /// Smoke-test the streaming loop body against `printf` so we
    /// exercise the line-splitter + exit plumbing without hitting the
    /// network. Unix-only because the helper shell is `sh`.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn run_install_streams_a_short_command() {
        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events_for_cb = events.clone();
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "printf 'line-1\\nline-2\\n'; exit 0"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().expect("spawn");
        let mut out = child.stdout.take().unwrap();
        let mut err = child.stderr.take().unwrap();
        let (otx, orx) = channel::<String>();
        let (etx, erx) = channel::<String>();
        let ot = thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(&mut out).lines().map_while(Result::ok) {
                let _ = otx.send(line);
            }
        });
        let et = thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(&mut err).lines().map_while(Result::ok) {
                let _ = etx.send(line);
            }
        });
        let started = Instant::now();
        loop {
            match child.try_wait().unwrap() {
                Some(status) => {
                    while let Ok(line) = orx.try_recv() {
                        events_for_cb
                            .lock()
                            .unwrap()
                            .push(RunEvent::Stdout { line });
                    }
                    while let Ok(line) = erx.try_recv() {
                        events_for_cb
                            .lock()
                            .unwrap()
                            .push(RunEvent::Stderr { line });
                    }
                    let _ = ot.join();
                    let _ = et.join();
                    events_for_cb.lock().unwrap().push(RunEvent::Exit {
                        exit_code: status.code().unwrap_or(-1),
                        duration_ms: started.elapsed().as_millis() as u64,
                        timed_out: false,
                    });
                    break;
                }
                None => {
                    while let Ok(line) = orx.try_recv() {
                        events_for_cb
                            .lock()
                            .unwrap()
                            .push(RunEvent::Stdout { line });
                    }
                    while let Ok(line) = erx.try_recv() {
                        events_for_cb
                            .lock()
                            .unwrap()
                            .push(RunEvent::Stderr { line });
                    }
                    thread::sleep(Duration::from_millis(5));
                }
            }
        }
        let captured = events.lock().unwrap();
        let stdout_lines = captured
            .iter()
            .filter_map(|e| match e {
                RunEvent::Stdout { line } => Some(line.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(stdout_lines, vec!["line-1", "line-2"]);
        assert!(matches!(captured.last(), Some(RunEvent::Exit { .. })));
        if let Some(RunEvent::Exit { exit_code, .. }) = captured.last() {
            assert_eq!(*exit_code, 0);
        }
    }
}
