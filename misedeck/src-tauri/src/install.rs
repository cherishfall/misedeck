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
use std::process::Command;
use std::time::Duration;

use serde::Serialize;

use crate::mise::{
    drive_child, extract_date, meets_minimum, mise_version, run_mise_tracked, AppError, DriveEnd,
    DriveError, PipeMode, RunEvent, RunRequest, MIN_MISE_VERSION,
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

/// The install one-liner this platform's shell runs — and the line the
/// execution panel echoes, so the two can never drift (issue #229).
/// `scripts/check-install-echo-parity.ts` (wired into `npm run ci`)
/// asserts the frontend's copy of these strings matches this file.
#[cfg(target_os = "windows")]
pub const INSTALL_SCRIPT_LINE: &str = "irm https://mise.jdx.dev/install.ps1 | iex";
#[cfg(not(target_os = "windows"))]
pub const INSTALL_SCRIPT_LINE: &str = "curl -fsSL https://mise.jdx.dev/install.sh | sh";

/// Build the platform-specific install command. Returned as a
/// `Command` so the caller owns the spawn. Both branches hand
/// `INSTALL_SCRIPT_LINE` to the platform's shell, so what the panel
/// echoes is the same line the executor runs.
///
/// On Windows the program is the absolute Windows PowerShell 5.1 binary
/// (`System32\WindowsPowerShell\v1.0\powershell.exe`) rather than a `PATH`
/// lookup: `CreateProcess` searches the current directory first, so a bare
/// name could run a planted binary with the app's privileges (issue #253).
fn build_install_command() -> Command {
    #[cfg(target_os = "windows")]
    let program = crate::process_tree::windows_powershell();
    #[cfg(not(target_os = "windows"))]
    let program = "sh".to_string();

    let mut cmd = Command::new(program);
    cmd.args(install_command_args());
    cmd
}

/// The argv the install command runs with — separated from
/// `build_install_command` so the encoding prefix can be asserted in a
/// test (a built `Command` cannot be read back).
fn install_command_args() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        // Encoding, not decoration (issue #243). `powershell` is Windows
        // PowerShell 5.1, and it writes a *redirected* stdout/stderr in
        // the console output code page — cp936 on a Simplified-Chinese
        // Windows, cp437 on English — while the runner decodes UTF-8
        // (`from_utf8_lossy`). The install script itself is pure ASCII
        // today, but every message PowerShell generates on its own
        // (a failed `irm`, a policy rejection, a missing command) is
        // localized, and those are exactly the lines a user needs to
        // read. Pinning the encoding on the executed command fixes the
        // class; the echoed line stays `INSTALL_SCRIPT_LINE` because
        // that is what the user can paste into their own shell.
        //
        // `UTF8Encoding($false)`: no BOM, so the first log line does not
        // begin with a zero-width character. The `try/catch` is
        // defensive — where the setter is unavailable the install still
        // runs (degraded to the old behaviour, never worse).
        vec![
            "-NoProfile".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-Command".to_string(),
            format!(
                "try {{ [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) }} catch {{ }}; {INSTALL_SCRIPT_LINE}"
            ),
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec!["-c".to_string(), INSTALL_SCRIPT_LINE.to_string()]
    }
}

/// Run the official install script for the current platform and stream
/// each line via `on_event`. Returns the aggregated outcome; a non-zero
/// exit (or a timeout) is `Err`, matching `run_self_update`'s contract.
///
/// This mirrors `run_mise` so the two surfaces (mise commands +
/// non-mise shell commands) share the same streaming pattern and
/// the same `RunEvent` payload — the JS side has one reducer.
///
/// `run_id` is the execution panel's run id. The script is `sh -c
/// "curl … | sh"` (or PowerShell on Windows), so cancelling must kill
/// the process group, not just `sh` — otherwise `curl` and the
/// installer keep writing shims after the panel said "cancelled"
/// (issue #223).
pub fn run_install<F>(run_id: Option<&str>, on_event: F) -> Result<InstallOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    run_install_command(build_install_command(), INSTALL_TIMEOUT, run_id, on_event)
}

/// Stream one install-shaped command to completion under `timeout`.
/// This is the body of `run_install`; it is public and takes the
/// command so tests can drive the real loop with a local process and a
/// short deadline instead of the network install script (issue #255).
/// Runtime callers use `run_install`, which pins the platform command
/// and `INSTALL_TIMEOUT`.
pub fn run_install_command<F>(
    mut cmd: Command,
    timeout: Duration,
    run_id: Option<&str>,
    mut on_event: F,
) -> Result<InstallOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    // The loop is the runner's, not this module's (issue #282): cancel,
    // deadline, exit and reader shutdown have one implementation, shared
    // with `run_mise_timed`.
    let driven = drive_child(&mut cmd, timeout, run_id, PipeMode::Lines, &mut on_event).map_err(
        |e| match e {
            DriveError::Spawn(e) => AppError::command_failed(
                format!("failed to spawn install command: {e}"),
                String::new(),
            ),
            DriveError::Wait(e) => {
                AppError::command_failed(format!("error waiting for install: {e}"), String::new())
            }
        },
    )?;
    match driven.end {
        // The panel already shows "cancelled", so the outcome is
        // discarded; what matters is that `curl` and the installer died
        // with `sh` (issue #223).
        DriveEnd::Cancelled => Err(AppError::command_failed("install cancelled", String::new())),
        DriveEnd::TimedOut => Err(AppError::timeout()),
        DriveEnd::Exited => {
            // A non-zero exit is a failure, not an outcome — returning Ok
            // would let the next caller treat a failed install as success
            // (issue #172).
            if driven.exit_code != 0 {
                return Err(AppError::command_failed(
                    format!("install script exited with status {}", driven.exit_code),
                    driven.stderr.clone(),
                ));
            }
            Ok(InstallOutcome {
                stdout: driven.stdout,
                stderr: driven.stderr,
                exit_code: driven.exit_code,
                duration_ms: driven.duration_ms,
                timed_out: false,
            })
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

/// argv for `mise self-update`. The `--yes` flag is load-bearing
/// (issue #125): the runner never wires stdin, so mise's interactive
/// `[Y/n]` confirmation prompt would read EOF and abort with exit 1
/// every time. `--yes` bypasses the CLI-side confirmation — the GUI
/// replaces it with a ConfirmDialog before dispatching.
pub fn mise_self_update_argv() -> Vec<String> {
    vec!["self-update".to_string(), "--yes".to_string()]
}

/// Run `mise self-update` via the existing runner, streaming the same
/// `RunEvent` line the panel already knows. On success, re-reads
/// `mise version --json` on the read path (`MISE_SAFE=1`, 10 s ceiling)
/// to capture the post-update version string.
///
/// `run_id` makes the update cancellable and part of the app-exit
/// cleanup (issue #223); the post-update probe is short and runs
/// untracked.
pub fn run_self_update<F>(
    mise_path: &Path,
    run_id: Option<&str>,
    on_event: F,
) -> Result<SelfUpdateOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    let req = RunRequest::new(mise_self_update_argv());
    let outcome = run_mise_tracked(mise_path, &req, run_id, on_event)?;

    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise self-update exited with status {}", outcome.exit_code),
            outcome.stderr.clone(),
        ));
    }

    // Best-effort post-update probe. Failure here is non-fatal — the
    // self-update succeeded, we just couldn't read the new version.
    // A version read follows the read contract (10 s + MISE_SAFE), not
    // the streaming one: a hung probe must not extend a successful
    // self-update by 30 minutes (issue #254).
    let new_version = mise_version(mise_path).ok().map(|(_, version)| version);

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
    // The streaming-loop tests below are unix-only (their helper shell is
    // `sh`), so the import they need must be gated the same way — an unused
    // import is a clippy error, and clippy runs with `-D warnings`.
    #[cfg(not(target_os = "windows"))]
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

    /// Issue #243: the executed command carries the UTF-8 encoding pin
    /// **and** the echoed one-liner, so the user can still reproduce the
    /// command by hand.
    #[cfg(target_os = "windows")]
    #[test]
    fn install_command_pins_utf8_output_without_touching_the_echo() {
        let args = install_command_args();
        let script = args.last().expect("script arg");
        assert!(
            script.contains("[Console]::OutputEncoding"),
            "windows install must pin the console output encoding: {script}"
        );
        assert!(
            script.contains("UTF8Encoding]::new($false)"),
            "must use a BOM-less UTF8 encoder: {script}"
        );
        assert!(
            script.contains(INSTALL_SCRIPT_LINE),
            "the executed script must still be the echoed one-liner: {script}"
        );
        assert!(args[0] == "-NoProfile");
    }

    /// Issue #243 counterpart: on unix the install line is the whole
    /// argv, unchanged — no encoding theatre where none is needed.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn install_command_is_the_echoed_line_verbatim() {
        assert_eq!(
            install_command_args(),
            vec!["-c".to_string(), INSTALL_SCRIPT_LINE.to_string()]
        );
    }

    /// Smoke-test the streaming loop body against `printf` so we
    /// exercise the line-splitter + exit plumbing without hitting the
    /// network. Unix-only because the helper shell is `sh`.
    ///
    /// `#[serial]` because this spawns through `ChildGuard`, which
    /// registers in a process-global map that
    /// `process_tree::tests::terminate_all_kills_a_registered_tree`
    /// empties with SIGKILL (see that test's note).
    #[cfg(not(target_os = "windows"))]
    #[test]
    #[serial_test::serial]
    fn run_install_streams_a_short_command() {
        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events_for_cb = events.clone();
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "printf 'line-1\\nline-2\\n'; exit 0"]);
        // The production loop, not a copy of it (issue #255): the old
        // body re-implemented the reader/exit plumbing here, so a
        // regression in `run_install` itself would not have failed.
        let outcome = run_install_command(cmd, Duration::from_secs(5), None, move |e| {
            events_for_cb.lock().unwrap().push(e);
        })
        .expect("a clean install-shaped command should yield Ok");
        assert_eq!(outcome.exit_code, 0);
        assert!(!outcome.timed_out);
        assert_eq!(outcome.stdout, "line-1\nline-2\n");
        assert!(outcome.stderr.is_empty());

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

    /// The installer shares the runner's capped reader (issue #277): a
    /// huge line is truncated, the next line still arrives, and the typed
    /// notice is emitted once instead of a marker string in stdout.
    ///
    /// This is the test the ubuntu leg failed on, twice, before the gate
    /// was added — not because the cap was wrong but because a parallel
    /// test's `terminate_all` SIGKILLed this `sh`, and a signal death
    /// surfaces as `exited with status -1` with empty stderr. Keep the
    /// `#[serial]` and keep it on every `ChildGuard`-spawning test.
    #[cfg(not(target_os = "windows"))]
    #[test]
    #[serial_test::serial]
    fn run_install_caps_a_huge_line_and_notifies() {
        use crate::mise::MAX_LINE_BYTES;

        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events_for_cb = events.clone();
        let mut cmd = Command::new("sh");
        cmd.args([
            "-c",
            "head -c 20000 /dev/zero | tr '\\0' x; printf '\\n'; printf 'tail\\n'",
        ]);
        let outcome = run_install_command(cmd, Duration::from_secs(5), None, move |e| {
            events_for_cb.lock().unwrap().push(e);
        })
        .expect("a capped install-shaped command should still succeed");

        assert_eq!(
            outcome.stdout,
            format!("{}\ntail\n", "x".repeat(MAX_LINE_BYTES))
        );
        let captured = events.lock().unwrap();
        let notices = captured
            .iter()
            .filter(|e| matches!(e, RunEvent::OutputTruncated { .. }))
            .count();
        assert_eq!(notices, 1, "one notice per stream");
        let lines = captured
            .iter()
            .filter_map(|e| match e {
                RunEvent::Stdout { line } => Some(line.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len(), MAX_LINE_BYTES);
        assert!(lines[0].chars().all(|c| c == 'x'));
        assert_eq!(lines[1], "tail");
    }
}
