// Mise runner — pure Rust logic for locating and talking to the mise CLI.
// No Tauri imports here so it can be unit-tested against a fixture binary.
//
// Layering (see docs/agents/architecture.md):
//   src-tauri commands  →  this module (mise runner)  →  mise CLI
//
// Every type crossing the Rust↔TS boundary uses `#[serde(rename_all = "camelCase")]`.
// Errors are data: they travel as `AppError` to the UI; the runner never panics.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::process_tree::{self, ChildGuard};

/// Minimum supported mise version (see docs/agents/conventions.md).
///
/// `2025.12.5` is the first release containing every flag the app
/// builds: `ls-remote --json` shipped there (mise #7279, committed
/// 2025-12-13). On an older mise the version picker fails with
/// `unexpected argument '--json'` for every tool, so the floor is a
/// measured requirement, not a guess.
pub const MIN_MISE_VERSION: &str = "2025.12.5";

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

/// File name of the mise executable on this platform. Windows needs the
/// `.exe` suffix to launch it; unix has none.
#[cfg(windows)]
const MISE_BIN: &str = "mise.exe";
#[cfg(not(windows))]
const MISE_BIN: &str = "mise";

/// Well-known places to look for the mise binary on the host, in probe
/// order, deduplicated.
///
/// Home-relative entries resolve through `dirs::home_dir()` instead of
/// the `HOME` env var: `HOME` is normally unset on Windows, which made
/// the probe report MISE_NOT_FOUND there unconditionally (issue #208).
/// This is the same resolution the Global-mode cwd anchor uses (issue
/// #179, `resolve_cwd_anchor`), so both agree on what "home" means.
///
/// unix: `~/.local/bin/mise`, `~/.cargo/bin/mise`,
/// `/opt/homebrew/bin/mise`, `/usr/local/bin/mise`.
///
/// windows: `%USERPROFILE%\.local\bin\mise.exe`,
/// `%USERPROFILE%\.cargo\bin\mise.exe`,
/// `%LOCALAPPDATA%\mise\bin\mise.exe` — the last one is where mise's
/// official Windows installer puts the binary, and it is not on PATH.
pub fn candidate_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();

    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".local").join("bin").join(MISE_BIN));
        paths.push(home.join(".cargo").join("bin").join(MISE_BIN));
    }

    #[cfg(windows)]
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            paths.push(
                PathBuf::from(local_app_data)
                    .join("mise")
                    .join("bin")
                    .join(MISE_BIN),
            );
        }
    }

    #[cfg(unix)]
    {
        paths.push(PathBuf::from("/opt/homebrew/bin/mise"));
        paths.push(PathBuf::from("/usr/local/bin/mise"));
    }

    let mut seen = std::collections::HashSet::new();
    paths.retain(|p| seen.insert(p.clone()));
    paths
}

/// Candidate paths built from a `PATH` value, in `PATH` order. Pure —
/// no filesystem access — so the probe order is testable on every
/// platform, including the Windows runner where `mise` is not installed.
///
/// The binary name carries the platform suffix (`mise.exe` on Windows,
/// `mise` elsewhere) because Windows `CreateProcess` will not launch an
/// extensionless file. A scoop / winget / `apt` install lands on `PATH`
/// under exactly that name and in none of the well-known candidates, so
/// without this scan a mise that works in the terminal still reported
/// `MISE_NOT_FOUND` (issue #229) — and the retry path re-probed the same
/// list, so it could never help.
///
/// Entries that are not absolute are skipped: an empty `PATH` entry
/// means "the current directory" on POSIX, and probing a relative
/// candidate would make mise resolution depend on the process cwd —
/// the leak Global mode's home anchor exists to prevent (issue #179).
fn path_candidates(path_value: &str) -> Vec<PathBuf> {
    std::env::split_paths(path_value)
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(MISE_BIN))
        .collect()
}

/// Every path `locate_mise` probes, in order: the well-known candidates
/// first (unchanged, so macOS/Linux behaviour is identical), then every
/// `PATH` entry. Deduplicated, first occurrence wins.
fn probe_paths() -> Vec<PathBuf> {
    let mut paths = candidate_paths();
    if let Some(path_value) = std::env::var_os("PATH") {
        paths.extend(path_candidates(&path_value.to_string_lossy()));
    }
    let mut seen = std::collections::HashSet::new();
    paths.retain(|p| seen.insert(p.clone()));
    paths
}

/// Probe for a working mise binary: the well-known locations first, then
/// every `PATH` entry (issue #229).
pub fn locate_mise() -> Result<PathBuf, AppError> {
    for p in probe_paths() {
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

/// A request to run the mise CLI. `cwd` selects the resolution context:
/// `Some(dir)` is Directory mode and becomes `-C <dir>`; `None` is Global
/// mode and becomes `-C $HOME` — mise resolves from the user's home
/// directory either way, never from the process cwd (issue #179). `args`
/// is the rest of the argv passed verbatim.
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

/// Characters that would be meaningful to a shell. The runner spawns
/// mise directly with no shell in between, so in argv these are inert
/// data — a value token containing them (a task's `run` command, an
/// env value) must pass through untouched (issue #160).
fn contains_shell_metachar(s: &str) -> bool {
    s.contains(';') || s.contains('|') || s.contains('&') || s.contains('`')
        || s.contains('$') || s.contains('\n') || s.contains('\r')
}

/// Validate the argv for `run_mise_command` before it reaches the
/// runner. Two rules, both narrowing the original guardrail from
/// issue #18, which rejected ANY token containing a shell
/// metacharacter and thereby made common values (`npm run build &&
/// npm run test`, `echo $HOME`, a `DATABASE_URL` containing `&`)
/// impossible to save in the GUI:
///
///   * args must be non-empty;
///   * a token that starts with `-` (a flag/option) must not contain
///     a shell metacharacter — every argv builder in the app
///     separates flags from values, so a flag token carrying
///     metacharacters can only arise from a bug; it stays rejected
///     as a defense-in-depth tripwire. Everything else — the
///     subcommand, positionals, `run` values, `set` values — is data
///     and passes through, since the shell-less spawn gives it no
///     injection surface.
pub fn validate_run_args(args: &[String]) -> Result<(), AppError> {
    if args.is_empty() {
        return Err(AppError::command_failed(
            "run_mise_command called with empty args",
            String::new(),
        ));
    }
    for a in args {
        if a.starts_with('-') && contains_shell_metachar(a) {
            return Err(AppError::command_failed(
                format!("run_mise_command: flag arg contains shell metacharacter: {a:?}"),
                String::new(),
            ));
        }
    }
    Ok(())
}

/// Resolve the `-C` anchor for a run (issue #179). Directory mode
/// (`Some`) anchors at the given directory; Global mode (`None`)
/// anchors at the user's home directory — the same resolution as
/// running mise in `$HOME` — so a dev process cwd on a project
/// directory can never leak project config into Global mode. A Global
/// run without a resolvable home is an error: silently falling back
/// to the process cwd would reintroduce the leak.
pub fn resolve_cwd_anchor(cwd: Option<&Path>) -> Result<PathBuf, AppError> {
    match cwd {
        Some(dir) => Ok(dir.to_path_buf()),
        None => dirs::home_dir().ok_or_else(|| {
            AppError::command_failed(
                "cannot resolve the home directory to anchor Global mode",
                String::new(),
            )
        }),
    }
}

/// Upper bound on how long a runner waits for the pipe readers to reach
/// EOF once the child is gone (issue #222).
///
/// A reader's remaining job at that point is to drain bytes the kernel
/// already buffered — sub-millisecond work, since a unix pipe holds
/// 64 KiB and a Windows anonymous pipe 4 KiB. The bound is for the
/// case where a *grandchild* inherited stdout/stderr and keeps the
/// write end open (`npm run dev &`, a daemon, `curl | sh`): the reader
/// then never sees EOF, and an unbounded `join()` blocked the main loop
/// forever — the panel stayed "running", Cancel did nothing, and the
/// streaming ceiling stopped applying because its deadline check only
/// runs while the child is alive. One second is three orders of
/// magnitude above the drain cost; the deadline is shared by both
/// readers, so a run pays it at most once. Killing the process tree is
/// issue #223's job, not this bound's.
pub(crate) const READER_SHUTDOWN_BOUND: Duration = Duration::from_secs(1);

/// Spawn a reader thread that splits one pipe into lines and forwards
/// them over `tx`.
///
/// Reads bytes and decodes each complete line with
/// `String::from_utf8_lossy`. `BufRead::lines()` ends its iterator at
/// the first invalid byte: the transcript truncated mid-run, the pipe
/// closed, and the child could die with EPIPE while the outcome still
/// reported its exit code (issue #222). `RunOutcome` already documents
/// lossy decoding; this is that promise. `\n` splits, a trailing `\r`
/// is stripped, and a final unterminated line is still delivered — the
/// same line shape `lines()` produced.
pub(crate) fn spawn_line_reader<R>(pipe: R, tx: Sender<String>) -> JoinHandle<()>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    if buf.last() == Some(&b'\n') {
                        buf.pop();
                        if buf.last() == Some(&b'\r') {
                            buf.pop();
                        }
                    }
                    if tx.send(String::from_utf8_lossy(&buf).into_owned()).is_err() {
                        break;
                    }
                }
                // An I/O error is the pipe going away, not a decode
                // problem — either way there is nothing left to read.
                Err(_) => break,
            }
        }
    })
}

/// Wait for the readers with a shared deadline instead of `join()`-ing
/// forever. A reader still blocked at the deadline is abandoned:
/// dropping its `JoinHandle` detaches the thread, which exits by itself
/// once the pipe closes or its channel receiver is gone. The caller
/// drains whatever did arrive and always reaches the exit event
/// (issue #222).
pub(crate) fn join_readers_bounded(handles: Vec<JoinHandle<()>>, bound: Duration) {
    let deadline = Instant::now() + bound;
    for handle in handles {
        loop {
            if handle.is_finished() {
                let _ = handle.join();
                break;
            }
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            thread::sleep((deadline - now).min(Duration::from_millis(5)));
        }
    }
}

/// Move every line the readers have already queued into `on_event` and
/// the aggregate buffers. Every exit path of both streaming runners —
/// normal exit, timeout, cancel — ends the same way, so the drain lives
/// here instead of being copied per branch.
pub(crate) fn drain_streams<F>(
    out_rx: &Receiver<String>,
    err_rx: &Receiver<String>,
    on_event: &mut F,
    stdout: &mut String,
    stderr: &mut String,
) where
    F: FnMut(RunEvent),
{
    while let Ok(line) = out_rx.try_recv() {
        on_event(RunEvent::Stdout { line: line.clone() });
        stdout.push_str(&line);
        stdout.push('\n');
    }
    while let Ok(line) = err_rx.try_recv() {
        on_event(RunEvent::Stderr { line: line.clone() });
        stderr.push_str(&line);
        stderr.push('\n');
    }
}

/// Spawn the mise binary and capture its output, enforcing a finite
/// `timeout`. This is the low-level entry point the runner routes every
/// call through.
///
/// `run_id` links the run to the execution panel so `cancel_run` can
/// stop its process tree; `None` is a run nobody can cancel (read-only
/// queries, fixture tests).
///
/// `on_event` is called for each line and once at the end with `Exit`.
/// The callback runs on a background thread; keep it cheap (the Tauri
/// command's `Channel::send` is cheap by design).
fn run_mise_timed<F>(
    mise_path: &Path,
    req: &RunRequest,
    mut on_event: F,
    timeout: Duration,
    run_id: Option<&str>,
    safe_mode: bool,
) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    let mut cmd = Command::new(mise_path);
    let anchor = resolve_cwd_anchor(req.cwd.as_deref())?;
    cmd.arg("-C").arg(anchor);
    for a in &req.args {
        cmd.arg(a);
    }
    // Read-only views run with `MISE_SAFE=1` (issue #230) — the
    // contract `docs/agents/architecture.md` states for reads of
    // directories the user has not trusted: mise resolves the same
    // config and emits the same data (verified against `mise ls`,
    // `env`, `config ls`, `tasks ls`, `plugins ls`, `trust --show`,
    // `doctor`, `outdated`), while config hooks/plugins stay disabled.
    // Streaming commands (mutations, `mise run`) must NOT set it: they
    // are already gated by the trust check in the UI layer.
    if safe_mode {
        cmd.env("MISE_SAFE", "1");
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut guard = match ChildGuard::spawn(&mut cmd, run_id) {
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

    let stdout = guard.child().stdout.take().expect("piped");
    let stderr = guard.child().stderr.take().expect("piped");

    let (out_tx, out_rx) = channel::<String>();
    let (err_tx, err_rx) = channel::<String>();

    let out_thread = spawn_line_reader(stdout, out_tx);
    let err_thread = spawn_line_reader(stderr, err_tx);

    let started = Instant::now();
    let deadline = timeout;
    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    loop {
        // Cancel (issue #223): the panel has already flipped the run to
        // "cancelled", so this outcome is discarded by the caller — what
        // matters is that the whole group dies instead of only mise.
        // Checked every slice, so the tree is gone within ~50 ms.
        if let Some(id) = run_id {
            if process_tree::take_cancel(id) {
                guard.terminate_tree();
                join_readers_bounded(vec![out_thread, err_thread], READER_SHUTDOWN_BOUND);
                drain_streams(&out_rx, &err_rx, &mut on_event, &mut stdout_buf, &mut stderr_buf);
                on_event(RunEvent::Exit {
                    exit_code: -1,
                    duration_ms: started.elapsed().as_millis() as u64,
                    timed_out: false,
                });
                return Err(AppError::command_failed("mise run cancelled", String::new()));
            }
        }
        match guard.try_wait() {
            Ok(Some(status)) => {
                // The process has been reaped; the guard unregistered
                // its group, so nothing can signal it again.
                // Join readers BEFORE draining: once the child has exited the
                // pipes usually go to EOF, so joining first is what makes their
                // last lines visible. The join is bounded, though: a grandchild
                // that inherited the pipe keeps it open, and waiting on it
                // forever would swallow the exit event (issue #222). Whatever
                // the readers managed to send is drained below either way.
                join_readers_bounded(vec![out_thread, err_thread], READER_SHUTDOWN_BOUND);
                // Drain remaining lines.
                drain_streams(&out_rx, &err_rx, &mut on_event, &mut stdout_buf, &mut stderr_buf);

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
                drain_streams(&out_rx, &err_rx, &mut on_event, &mut stdout_buf, &mut stderr_buf);
                if started.elapsed() > deadline {
                    // Timeout is a cancel with a deadline: the whole
                    // group dies, not just mise (issue #223) — a `mise
                    // run` task shell must not outlive its 30-minute
                    // ceiling.
                    guard.terminate_tree();
                    // Join readers BEFORE the final drain for the same reason as
                    // the exit branch — still bounded, because the pipes may be
                    // held by something that outlived the group (issue #222).
                    join_readers_bounded(vec![out_thread, err_thread], READER_SHUTDOWN_BOUND);
                    drain_streams(&out_rx, &err_rx, &mut on_event, &mut stdout_buf, &mut stderr_buf);
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

/// Streaming entry point for the execution panel. Keeps the 30-minute
/// `STREAMING_TIMEOUT` ceiling so a long install / run / self-update is
/// reaped if the user does not cancel it first. Read-only queries must
/// not use this — they route through `run_mise_json` /
/// `run_mise_timed(..., READ_TIMEOUT)` so a hung process is reaped far
/// sooner and never blocks the window (issue #46).
///
/// This variant is not cancellable by id; the execution panel uses
/// `run_mise_tracked`.
pub fn run_mise<F>(mise_path: &Path, req: &RunRequest, on_event: F) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    run_mise_tracked(mise_path, req, None, on_event)
}

/// Streaming run that `cancel_run(run_id)` can stop (issue #223). The
/// panel's cancel marks the run cancelled and then tears down its whole
/// process group — `mise run`'s task shell included — instead of waiting
/// out the 30-minute ceiling.
pub fn run_mise_tracked<F>(
    mise_path: &Path,
    req: &RunRequest,
    run_id: Option<&str>,
    on_event: F,
) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    // Streaming surface: mutations, `mise run`, install and trust.
    // These are already gated by the trust check in the UI layer, so
    // they must NOT run with MISE_SAFE (issue #230).
    run_mise_timed(mise_path, req, on_event, STREAMING_TIMEOUT, run_id, false)
}

/// A read dispatched through the panel, with the same read-only
/// `MISE_SAFE=1` contract as `run_mise_json` (issue #276).
///
/// The panel is the single path for every mise invocation (ADR-0005), so
/// the Tools and Settings table reads still stream through it — but they
/// are views, not mutations, and must resolve an untrusted directory
/// exactly like the dedicated read commands do. Mutations and
/// `mise run` keep [`run_mise_tracked`]'s unsafe mode because they
/// evaluate the directory's config.
pub fn run_mise_tracked_read_only<F>(
    mise_path: &Path,
    req: &RunRequest,
    run_id: Option<&str>,
    on_event: F,
) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    run_mise_timed(mise_path, req, on_event, STREAMING_TIMEOUT, run_id, true)
}

/// The timed core with an explicit deadline, exposed for tests that
/// need to drive the timeout path without waiting 30 minutes (issue
/// #223) and for callers with their own ceiling. No cancel id: a
/// caller that needs both uses `run_mise_tracked`.
pub fn run_mise_with_timeout<F>(
    mise_path: &Path,
    req: &RunRequest,
    timeout: Duration,
    on_event: F,
) -> Result<RunOutcome, AppError>
where
    F: FnMut(RunEvent) + Send + 'static,
{
    run_mise_timed(mise_path, req, on_event, timeout, None, true)
}

/// Normalize a completed streaming run for the `run_mise_command`
/// boundary (issue #221). `run_mise` deliberately reports non-zero
/// exits as `Ok(RunOutcome)` with the code attached — the runner is
/// the transport, not the judge. The IPC boundary is where that
/// becomes a success/failure verdict, so the frontend only ever sees
/// `{kind:"ok"}` for a clean exit and `{kind:"err"}` otherwise, the
/// same contract `run_mise_json` already offers the read commands.
///
/// The error carries mise's own stderr verbatim; the execution panel
/// has already streamed the transcript by the time this runs.
pub fn require_success(outcome: RunOutcome) -> Result<RunOutcome, AppError> {
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    Ok(outcome)
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
    // Every read in the app funnels through here (`mise ls`, `env`,
    // `config ls`, `tasks ls`, `plugins ls`, `outdated`, `doctor`,
    // `registry`, `trust --show`, `tasks edit --path`, version
    // detection), so this is the one place the read-only MISE_SAFE
    // contract is enforced (issue #230).
    let outcome = run_mise_timed(mise_path, req, |_| {}, READ_TIMEOUT, None, true)?;
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
/// Unlike the whole-list `mise ls --json`, mise emits a bare JSON
/// array here (`[items...]`, no tool key); the typed `MiseLsItem`
/// shape above documents the per-item fields. The JS side normalises
/// the array into a row list.
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
/// no tools are outdated). No `--bump`: without it `latest` is the
/// newest version *inside the configured range*, i.e. exactly what
/// `mise upgrade <tool>` reaches (ui-ux-rules, beta13 Q9). With
/// `--bump` mise reports the newest published version regardless of
/// the request, which the UI would advertise and then fail to install.
pub fn mise_outdated(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["outdated".to_string(), "--json".to_string()];
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
/// Resolve the lockfile that actually governs `cwd`.
///
/// mise governs a directory through its *config* file, and the
/// lockfile sits beside that config — not necessarily in the directory
/// the user picked. Reading only `<cwd>/mise.lock` therefore reported
/// "no lockfile" for a subdirectory of a project that does have one
/// (issue #230). Walk up the directory tree (the same ancestry mise's
/// config search uses) and take the nearest `mise.lock`.
fn lockfile_path(cwd: &Path) -> Option<PathBuf> {
    let mut dir = Some(cwd);
    while let Some(current) = dir {
        let candidate = current.join("mise.lock");
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = current.parent();
    }
    None
}

pub fn read_mise_lockfile(cwd: Option<&Path>) -> Result<Option<String>, AppError> {
    let Some(cwd) = cwd else {
        // The lockfile is a per-directory artifact; the global
        // context has no associated lockfile. Treat as "no lockfile".
        return Ok(None);
    };
    let Some(path) = lockfile_path(cwd) else {
        return Ok(None);
    };
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
    /// True for a global override file (`config.override.toml`), which
    /// mise ranks above every project config. Older mise builds do not
    /// report the key; the parser then defaults to false (issue #259).
    #[serde(default)]
    pub r#override: bool,
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
            r#override: entry
                .get("override")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
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
/// task is not in scope). Exercised by the Rust integration tests
/// only; no JS caller uses it today.
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
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT, None, true)?;
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
/// is one line per config directory in scope:
///
///   * `<directory>: trusted`
///   * `<directory>: untrusted`
///
/// (Real probe: `~/AiCodingProjects/mise-ui: trusted` — the line
/// names the directory holding the config, and `~` abbreviates home.)
///
/// When no `mise.toml` is in scope, mise prints
/// `No trusted config files found.` (exit code 0).
///
/// Trust is per config directory, and `trust --show` lists ancestors
/// before descendants (probe: a trusted parent precedes an untrusted
/// child), so the first line is NOT the decision for the cwd.
/// `parse_trust_show` keeps every line that governs the cwd and fails
/// closed: one untrusted directory anywhere in that chain makes the
/// cwd untrusted (issue #268).
///
/// **Fail closed** (issue #254): a line this parser does not recognise
/// is not evidence that there is nothing to trust. If stdout carries
/// content but no line yields a status, the probe returns
/// `COMMAND_FAILED` with the raw output instead of `NoConfig`, so a
/// mise release that changes the separator, adds a header, or localises
/// the words surfaces an error rather than silently removing the trust
/// gate. Only an empty stdout or the documented "no trusted config"
/// sentence means `NoConfig`.
pub fn check_trust(mise_path: &Path, cwd: Option<&Path>) -> Result<TrustStatus, AppError> {
    let args = vec!["trust".to_string(), "--show".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT, None, true)?;
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise trust --show exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    parse_trust_show(&outcome.stdout, cwd)
}

/// Pure half of `check_trust`, so the decision is unit-testable
/// without a mise binary. The `path` kept in `TrustStatus` is the
/// string mise printed (home shorthand intact) — it is display-only.
fn parse_trust_show(stdout: &str, cwd: Option<&Path>) -> Result<TrustStatus, AppError> {
    let cwd_fallback = cwd
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut entries: Vec<(PathBuf, bool, String)> = Vec::new();
    let mut unparsed = false;
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("No trusted") {
            continue;
        }
        // Split on the LAST colon to keep a Windows drive letter
        // (`C:\repo: trusted`) intact.
        let Some((path_part, status_part)) = line.rsplit_once(':') else {
            unparsed = true;
            continue;
        };
        let displayed = path_part.trim();
        let trusted = match status_part.trim() {
            "trusted" => true,
            "untrusted" => false,
            _ => {
                unparsed = true;
                continue;
            }
        };
        entries.push((expand_home(displayed), trusted, displayed.to_string()));
    }
    if entries.is_empty() && unparsed {
        // The raw payload *is* the detail here: mise exited 0, so there
        // is no stderr to surface. The panel shows it verbatim.
        return Err(AppError::command_failed(
            "mise trust --show printed output the app could not parse",
            stdout,
        ));
    }
    // Only directories in the cwd's own chain apply. Without a cwd the
    // probe ran at the process default, so every line applies.
    let mut applicable: Vec<_> = entries
        .into_iter()
        .filter(|(dir, _, _)| cwd.is_none_or(|cwd| trust_dir_applies(dir, cwd)))
        .collect();
    // Longest path last: the nearest directory is the most specific
    // line for the cwd.
    applicable.sort_by_key(|(dir, _, _)| dir.components().count());
    if applicable.is_empty() {
        return Ok(TrustStatus {
            source: TrustSource::NoConfig,
            path: cwd_fallback,
        });
    }
    // Fail closed: any untrusted directory in the chain blocks the
    // cwd, even when a nearer line says "trusted".
    if let Some((_, _, path)) = applicable.iter().rev().find(|(_, trusted, _)| !trusted) {
        return Ok(TrustStatus {
            source: TrustSource::ConfigUntrusted,
            path: path.clone(),
        });
    }
    let (_, _, path) = applicable.last().expect("applicable is non-empty");
    Ok(TrustStatus {
        source: TrustSource::ConfigTrusted,
        path: path.clone(),
    })
}

/// Expand mise's `~` shorthand so a reported directory compares
/// against the absolute cwd.
fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(path));
    }
    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// True when a reported directory is `cwd` itself or one of its
/// ancestors — the configs mise resolves `cwd` from. Sibling and child
/// directories never govern it.
fn trust_dir_applies(dir: &Path, cwd: &Path) -> bool {
    let norm = |p: &Path| {
        let raw = p.to_string_lossy().replace('\\', "/");
        let trimmed = raw.trim_end_matches('/');
        let out = if trimmed.is_empty() && raw.starts_with('/') {
            "/".to_string()
        } else {
            trimmed.to_string()
        };
        // macOS/Windows filesystems fold case by default; compare the
        // same way mise reports paths on those hosts.
        if cfg!(any(windows, target_os = "macos")) {
            out.to_lowercase()
        } else {
            out
        }
    };
    let dir = norm(dir);
    let cwd = norm(cwd);
    if dir.is_empty() || cwd.is_empty() {
        return false;
    }
    if cwd == dir {
        return true;
    }
    let prefix = if dir.ends_with('/') {
        dir
    } else {
        format!("{dir}/")
    };
    cwd.starts_with(&prefix)
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
/// per-command shape; the underlying `run_mise_tracked` already does
/// the heavy lifting. A non-zero exit maps to `COMMAND_FAILED` so the
/// JS side can render stderr in the panel (matches the
/// `run_self_update` pattern in `install.rs`).
pub fn run_trust<F>(
    mise_path: &Path,
    cwd: Option<&Path>,
    run_id: Option<&str>,
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
    let outcome = run_mise_tracked(mise_path, &req, run_id, on_event)?;
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
///
/// The dedicated `settings_ls` Tauri command was removed in #162: the
/// page now dispatches this read through the execution-panel runner in
/// background mode (ADR-0005), building the same argv in the frontend.
/// The function stays as the pinned argv/contract reference, tested
/// against fixtures like the tools `ls` family (issue #72).
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

/// Turn raw `mise doctor` output into the fallback payload. This is
/// the only fallback: the text the `--json` attempt printed is re-used,
/// never re-fetched. A second `mise doctor` would double the blocking
/// wait and could disagree with the first run (issue #254).
fn doctor_text_payload(
    stdout: &str,
    stderr: String,
    exit_code: i32,
) -> Result<serde_json::Value, AppError> {
    let lines: Vec<DoctorLine> = stdout
        .lines()
        .map(|line| DoctorLine {
            text: line.to_string(),
            status: classify_doctor_line(line),
        })
        .collect();
    // A non-zero exit with NO output lines is a broken mise, not a
    // report: shipping Ok({rawLines: []}) would render "Status: OK"
    // from no data (issue #233). Non-zero exits WITH lines stay Ok —
    // those lines are the diagnostic output the fallback exists for.
    if lines.is_empty() && exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise doctor exited with status {exit_code}"),
            stderr,
        ));
    }
    Ok(serde_json::json!({
        "rawLines": lines,
        "rawText": stdout,
    }))
}

/// `mise doctor --json` for the active context.
///
/// The exit code is checked *after* parsing, not before: mise calls
/// `exit(1)` when it collected `errors`, so a broken install — exactly
/// when a user opens this page — still emits a complete JSON report.
/// Checking the code first sent that payload into the text fallback,
/// hiding `warnings`/`errors` from the structured view and running
/// `mise doctor` a second time (issue #259).
///
/// There is no second run: whatever the one `--json` attempt printed
/// is parsed as JSON, or shown as raw text. Empty output with a
/// non-zero exit is a `COMMAND_FAILED` (issue #233), not a reason to
/// try again (issues #230, #254). A timeout or a missing binary is
/// propagated as-is, never retried.
pub fn mise_doctor(
    mise_path: &Path,
    cwd: Option<&Path>,
) -> Result<serde_json::Value, AppError> {
    let args = vec!["doctor".to_string(), "--json".to_string()];
    let req = match cwd {
        Some(c) => RunRequest::with_cwd(args, c),
        None => RunRequest::new(args),
    };
    // Same read-only contract as `run_mise_json` (MISE_SAFE), but the
    // exit code cannot short-circuit the parse — see the doc comment.
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT, None, true)?;
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(outcome.stdout.trim()) {
        return Ok(value);
    }
    doctor_text_payload(&outcome.stdout, outcome.stderr, outcome.exit_code)
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
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT, None, true)?;
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
        // Same rule as `mise_doctor` (issue #230): the table fallback
        // covers "this mise has no `--json` / emitted unparseable
        // output", never a timeout or a missing binary — retrying those
        // doubles the wait and repeats a known failure.
        Err(e) if e.code == code::PARSE_FAILED || e.code == code::COMMAND_FAILED => {
            registry_table_fallback(mise_path, cwd)
        }
        Err(e) => Err(e),
    }
}

/// One row of `mise plugins ls --urls`. mise prints a four-column
/// table (`Plugin  Url  Ref  Sha`), so all four are modelled — the ref
/// and commit identify a plugin pinned to a tag/branch, and an empty
/// `url` must stay empty rather than absorb the ref (issue #259).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MisePluginRow {
    /// Plugin name exactly as mise prints it (ui-ux-rules: data honesty).
    pub name: String,
    /// Git URL mise reports; empty when the plugin has no remote.
    pub url: String,
    /// Checked-out ref (`HEAD` when mise left the clone detached).
    pub r#ref: String,
    /// Short commit hash.
    pub sha: String,
}

/// Parse one `mise plugins ls --urls` line. mise suppresses the header
/// when stdout is not a tty (the app always pipes), and trims trailing
/// empty cells, so a row is one of:
///
///   * `<name>` — no URL and no git info (a configured plugin)
///   * `<name> <url>` — URL only
///   * `<name> <ref> <sha>` — no URL (the last two tokens are the git
///     pair, never a ref masquerading as a URL)
///   * `<name> <url> <ref> <sha>`
fn parse_plugin_row(line: &str) -> Option<MisePluginRow> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    let name = tokens.first()?.to_string();
    let mut row = MisePluginRow {
        name,
        ..MisePluginRow::default()
    };
    match tokens.len() {
        0 | 1 => {}
        2 => row.url = tokens[1].to_string(),
        3 => {
            row.r#ref = tokens[1].to_string();
            row.sha = tokens[2].to_string();
        }
        n => {
            // Git URLs contain no whitespace, but joining the middle
            // tokens keeps a defensive parser from dropping one.
            row.url = tokens[1..n - 2].join(" ");
            row.r#ref = tokens[n - 2].to_string();
            row.sha = tokens[n - 1].to_string();
        }
    }
    Some(row)
}

/// `mise plugins ls --urls` — the installed plugins list (issue #51).
/// `mise plugins ls` has no `--json` flag (a known JSON gap, see
/// docs/agents/architecture.md), so the runner parses the plain-text
/// table behind the boundary. Names, URLs, refs, and hashes are
/// shipped verbatim; original case is preserved.
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
    let outcome = run_mise_timed(mise_path, &req, |_| {}, READ_TIMEOUT, None, true)?;
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise plugins ls exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }
    let rows: Vec<MisePluginRow> = outcome
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(parse_plugin_row)
        .collect();
    serde_json::to_value(rows).map_err(|e| {
        AppError::parse_failed(
            format!("could not serialize mise plugins ls rows: {e}"),
            String::new(),
        )
    })
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
//   * `mise uninstall <tool>@<version>`→ delete one non-active version's files
//   * `mise unuse <tool>`              → remove a tool from config + prune
//   * `mise link <tool>@<version> <path>` → symlink a local dir as a version
//   `mise upgrade`                        → upgrade all outdated tools
//   `mise upgrade <tool>`                 → upgrade a single tool
//
// The beta13 batch-operation ban: `mise uninstall --all` has no GUI
// path — an orphan tool's versions are removed one by one (#189).
//
// `global` mirrors the page's context: true means Global mode, where
// `use`/`unuse` carry an explicit `-g` so the echoed line is
// dispatchable on its own. The tools-page builders in
// `src/pages/ToolsPage/toolActionArgs.ts` are the argv the app actually
// dispatches; these helpers and that module are pinned against the same
// case table (`tests/fixtures/argv-parity.json`) by
// `scripts/check-argv-parity.ts` and `tests/argv_parity.rs`
// (issue #255).

/// Build the argv for `mise install <tool>@<version>`. An empty version
/// means latest (issue #111), and `latest` is named explicitly: per
/// `mise install --help`, a bare `<tool>` installs the version the
/// config requests for it, which is *not* latest when the config pins
/// one (issue #254).
pub fn mise_install_argv(tool: &str, version: &str) -> Vec<String> {
    let version = if version.is_empty() { "latest" } else { version };
    vec!["install".to_string(), format!("{tool}@{version}")]
}

/// Build the argv for `mise uninstall <tool>@<version>`. Targeting the
/// exact version keeps the dispatched command identical to the
/// confirmation (issue #56). This deletes one version's files only —
/// tool-level removal is `mise_unuse_argv`.
pub fn mise_uninstall_argv(tool: &str, version: &str) -> Vec<String> {
    vec!["uninstall".to_string(), format!("{tool}@{version}")]
}

/// Build the argv for `mise use [-g] <tool>@<version>`. `global` is
/// true in Global mode; Directory mode leaves the flag off and the
/// runner anchors with `-C <dir>` (issue #179).
pub fn mise_use_argv(tool: &str, version: &str, global: bool) -> Vec<String> {
    let mut argv = vec!["use".to_string()];
    if global {
        argv.push("-g".to_string());
    }
    argv.push(format!("{tool}@{version}"));
    argv
}

/// Build the argv for `mise unuse [-g] <tool>` (ADR-0008, issue #131):
/// the real tool-level removal — drops the tool from the Config file
/// and prunes installations no longer referenced. Reachable only from
/// the version-management section's in-use rows, where a config request
/// always exists (issue #189 removed the orphan branch and with it the
/// `mise uninstall --all` path — the GUI never batch-deletes).
pub fn mise_unuse_argv(tool: &str, global: bool) -> Vec<String> {
    let mut argv = vec!["unuse".to_string()];
    if global {
        argv.push("-g".to_string());
    }
    argv.push(tool.to_string());
    argv
}

/// Build the argv for `mise link <tool>@<version> <path>` (issue #71).
///
/// Documented against `mise link --help` (verified on mise 2026.8.14):
///
/// ```text
/// Usage: mise link [-f --force] <TOOL@VERSION> <PATH>
/// ```
///
/// The argument order is `<TOOL@VERSION>` first, then the local `<PATH>`
/// (not path-first). `--force` is intentionally NOT emitted here: on a
/// conflict the frontend surfaces a friendly hint instead of force-
/// overwriting, matching the agreed design. The runner still adds `-C
/// <dir>` when a directory context is active, so the builder emits the
/// pure argv and leaves the directory flag to the caller.
pub fn mise_link_argv(tool: &str, version: &str, path: &str) -> Vec<String> {
    vec![
        "link".to_string(),
        format!("{tool}@{version}"),
        path.to_string(),
    ]
}

/// Build the argv for `mise upgrade [<tool>]`. The default mode
/// upgrades within the range the config file writes (node@20 → newest
/// 20.x) without rewriting the config — matching the `latest` field of
/// `mise outdated --json`. The retired `--bump` mode (beta13 Q9:
/// dev tools favor stability over chasing major versions) is not
/// emitted. When `tool` is `None` the command upgrades every outdated
/// tool; when `Some` it targets a single tool.
pub fn mise_upgrade_argv(tool: Option<&str>) -> Vec<String> {
    let mut argv = vec!["upgrade".to_string()];
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
// `run` is split across multiple argv entries — one per shell
// word of the user's run draft — so mise receives the command
// exactly as the user typed it. The GUI's run field is a
// `<textarea>` edited one command per line; on save each line is
// split into shell words (the same splitting an interactive shell
// applies) and the words become the tokens after `--` (issue
// #161). This matters because `mise tasks add` stores
// `shell_words::join(RUN)` — a whole line passed as a single
// token would be stored quoted and the task would not run. The
// runner entry check (issue #160) lets value tokens through
// regardless, so this split is about argv fidelity, not about the
// guardrail.

/// Build the argv for `mise run <name>`. Reused as the
/// "Run" button on the tasks page; output streams through the
/// execution panel via the existing `run_mise_command` IPC.
pub fn mise_run_task_argv(name: &str) -> Vec<String> {
    vec!["run".to_string(), name.to_string()]
}

/// Build the argv for `mise tasks add <name> [--dep X]… -- <run…>`.
///
/// When `run_tokens` is `Some` the run is emitted after `--` so
/// mise preserves it. The slice is one **shell word** per element —
/// the GUI splits each edited line of the run textarea into words
/// (issue #161); blank lines are dropped before the builder. mise
/// re-quotes the words when it writes the TOML (`shell_words::join`),
/// so a word containing spaces or metacharacters must arrive here
/// verbatim and is stored as a single quoted unit. When
/// `run_tokens` is `None` the call is
/// `mise tasks add <name> [--dep X]…` (no `--`) — useful for
/// commands that only flip metadata, but **dangerous for editing
/// an existing task**: `mise tasks add` replaces the task's whole
/// TOML table, so an argv without `-- <run>` drops the existing
/// `run` key (and any field the argv does not name). Callers
/// editing an existing task must always pass `run_tokens` and
/// every other field the task has; the Tasks page only offers
/// inline edit when `taskEditBlock` proves the form can round-trip
/// every field it can see, and leaves the rest to `mise tasks edit`
/// (issue #267).
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

/// Read `mise version --json` over the read path: `DETECT_TIMEOUT`
/// (10 s, not the 30-minute streaming ceiling) and `MISE_SAFE=1`, like
/// every other read (issue #254). Returns the raw payload and the
/// `version` string it carries. Used by the startup probe and by the
/// post-self-update version read in `install.rs`, so the two can never
/// disagree on which contract a version read follows.
pub fn mise_version(mise_path: &Path) -> Result<(serde_json::Value, String), AppError> {
    let req = RunRequest::new(vec!["version".to_string(), "--json".to_string()]);
    let outcome = run_mise_timed(mise_path, &req, |_| {}, DETECT_TIMEOUT, None, true)?;
    if outcome.exit_code != 0 {
        return Err(AppError::command_failed(
            format!("mise exited with status {}", outcome.exit_code),
            outcome.stderr,
        ));
    }

    let raw: serde_json::Value = serde_json::from_slice(outcome.stdout.as_bytes()).map_err(|e| {
        AppError::parse_failed(
            format!("invalid mise version --json output: {e}"),
            outcome.stderr.clone(),
        )
    })?;
    let version = raw
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            AppError::parse_failed(
                "mise version --json did not include a `version` string",
                outcome.stderr.clone(),
            )
        })?
        .to_string();
    Ok((raw, version))
}

/// Run `mise version --json` and return the parsed result. Thin wrapper
/// around the generalized runner for the probe path.
pub fn detect_mise(mise_path: &Path) -> Result<DetectMiseOk, AppError> {
    let (raw_value, version) = mise_version(mise_path)?;

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
    fn resolve_cwd_anchor_directory_mode_returns_the_dir() {
        // Directory mode anchors at the given directory, unchanged
        // (issue #179: only the Global anchor is new).
        let dir = PathBuf::from("/tmp/misedeck-anchor-test");
        assert_eq!(resolve_cwd_anchor(Some(&dir)).unwrap(), dir);
    }

    #[test]
    fn resolve_cwd_anchor_global_mode_anchors_at_home() {
        // Global mode (cwd: None) anchors at the user's home directory,
        // matching what `dirs` resolves — never at the process cwd.
        let home = dirs::home_dir().expect("test environment has a home dir");
        assert_eq!(resolve_cwd_anchor(None).unwrap(), home);
        assert!(resolve_cwd_anchor(None).unwrap().is_absolute());
    }

    // The two `candidate_paths` tests below are platform-gated on
    // purpose: each pins its own OS's candidate set, order, and binary
    // name (issue #208). On macOS/Linux the Windows test is compiled out
    // and vice versa, so the Windows expectations only execute for real
    // on the `windows-latest` CI job — there is no Windows machine in
    // the maintainer's review loop.
    #[cfg(windows)]
    #[test]
    fn candidate_paths_covers_windows_install_locations() {
        let paths = candidate_paths();
        let home = dirs::home_dir().expect("test environment has a home dir");
        let local_app_data =
            std::env::var_os("LOCALAPPDATA").expect("windows runners set LOCALAPPDATA");

        assert_eq!(
            paths,
            vec![
                home.join(".local").join("bin").join("mise.exe"),
                home.join(".cargo").join("bin").join("mise.exe"),
                PathBuf::from(local_app_data)
                    .join("mise")
                    .join("bin")
                    .join("mise.exe"),
            ],
            "paths = {paths:?}"
        );
        // Every Windows probe target must be the launchable `.exe`, never
        // the extensionless unix name.
        assert!(paths.iter().all(|p| p.to_string_lossy().ends_with("mise.exe")));
    }

    #[cfg(unix)]
    #[test]
    fn candidate_paths_keeps_unix_locations_and_order() {
        // Regression pin for the macOS/Linux probe: same four paths, in
        // the same order, as before the Windows fix (issue #208).
        let home = dirs::home_dir().expect("test environment has a home dir");
        assert_eq!(
            candidate_paths(),
            vec![
                home.join(".local").join("bin").join("mise"),
                home.join(".cargo").join("bin").join("mise"),
                PathBuf::from("/opt/homebrew/bin/mise"),
                PathBuf::from("/usr/local/bin/mise"),
            ]
        );
    }

    /// `PATH` is appended after the well-known candidates so the
    /// macOS/Linux probe order is bit-for-bit what it was (issue #229);
    /// the pure builder is what makes that assertable without a mise
    /// install and without touching the filesystem.
    #[test]
    fn probe_paths_appends_path_after_the_candidates() {
        let candidates = candidate_paths();
        let probe = probe_paths();
        assert_eq!(
            probe[..candidates.len()],
            candidates[..],
            "the well-known candidates must stay first, in order"
        );
        assert!(
            probe.len() >= candidates.len(),
            "PATH entries are appended, never substituted"
        );
    }

    /// The pure half of the PATH scan: `PATH` order is preserved and
    /// every entry carries this platform's binary name (`mise.exe` on
    /// Windows — `CreateProcess` will not launch an extensionless file).
    #[test]
    fn path_candidates_joins_the_platform_binary_name_in_path_order() {
        let (dir_a, dir_b, separator) = if cfg!(windows) {
            (r"C:\opt\mise", r"C:\usr\bin", ";")
        } else {
            ("/opt/mise", "/usr/bin", ":")
        };
        let candidates = path_candidates(&format!("{dir_a}{separator}{dir_b}"));
        let expected: Vec<PathBuf> =
            vec![PathBuf::from(dir_a).join(MISE_BIN), PathBuf::from(dir_b).join(MISE_BIN)];
        assert_eq!(candidates, expected, "candidates = {candidates:?}");
        assert!(
            candidates.iter().all(|p| p.to_string_lossy().ends_with(MISE_BIN)),
            "every PATH probe must use {MISE_BIN}"
        );
    }

    #[test]
    fn path_candidates_ignores_entries_that_are_not_absolute() {
        // An empty PATH entry means "the current directory" on POSIX;
        // probing a relative candidate would tie mise resolution to the
        // process cwd (issue #179).
        assert!(path_candidates("").is_empty());
        assert!(path_candidates("bin:relative").is_empty());
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

    // The real `mise trust --show` probe lists the trusted parent
    // before the untrusted child; the first line must not decide the
    // cwd's trust state (issue #268). Lines name directories.
    #[test]
    fn parse_trust_show_flags_untrusted_child_under_trusted_parent() {
        let stdout = "/repo: trusted\n/repo/child: untrusted\n";
        let status = parse_trust_show(stdout, Some(Path::new("/repo/child"))).unwrap();
        assert_eq!(status.source, TrustSource::ConfigUntrusted);
        assert_eq!(status.path, "/repo/child");
    }

    #[test]
    fn parse_trust_show_fails_closed_when_a_parent_is_untrusted() {
        // A trusted nearest directory cannot vouch for an untrusted
        // ancestor: mise still treats the ancestor's contents as
        // untrusted when resolving the cwd.
        let stdout = "/repo: untrusted\n/repo/child: trusted\n";
        let status = parse_trust_show(stdout, Some(Path::new("/repo/child"))).unwrap();
        assert_eq!(status.source, TrustSource::ConfigUntrusted);
        assert_eq!(status.path, "/repo");
    }

    #[test]
    fn parse_trust_show_accepts_a_trusted_chain() {
        let stdout = "/repo: trusted\n/repo/child: trusted\n";
        let status = parse_trust_show(stdout, Some(Path::new("/repo/child"))).unwrap();
        assert_eq!(status.source, TrustSource::ConfigTrusted);
        assert_eq!(status.path, "/repo/child");
    }

    #[test]
    fn parse_trust_show_ignores_directories_outside_the_cwd_chain() {
        // A sibling or child directory does not govern this cwd, so
        // its status must not leak into the decision.
        let stdout = "/other: untrusted\n/repo/child: trusted\n";
        let status = parse_trust_show(stdout, Some(Path::new("/repo/child"))).unwrap();
        assert_eq!(status.source, TrustSource::ConfigTrusted);
        assert_eq!(status.path, "/repo/child");
    }

    #[test]
    fn parse_trust_show_expands_home_shorthand() {
        // The real probe abbreviates home: `~/proj: trusted`. The
        // expansion must land inside the absolute cwd's chain.
        let home = dirs::home_dir().expect("test environment has a home dir");
        let stdout = "~/repo: trusted\n~/repo/child: untrusted\n";
        let cwd = home.join("repo").join("child");
        let status = parse_trust_show(stdout, Some(&cwd)).unwrap();
        assert_eq!(status.source, TrustSource::ConfigUntrusted);
        assert_eq!(status.path, "~/repo/child");
    }

    #[test]
    fn parse_trust_show_reports_no_config_for_the_documented_sentence() {
        let stdout = "No trusted config files found.\n";
        let status = parse_trust_show(stdout, Some(Path::new("/repo"))).unwrap();
        assert_eq!(status.source, TrustSource::NoConfig);
        assert_eq!(status.path, "/repo");
    }

    #[test]
    fn parse_trust_show_rejects_output_without_a_status_line() {
        let stdout = "trust: ???\n";
        let err = parse_trust_show(stdout, Some(Path::new("/repo"))).unwrap_err();
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert_eq!(err.stderr, stdout);
    }

    #[test]
    fn parse_trust_show_without_a_cwd_considers_every_line() {
        let stdout = "/repo: trusted\n/repo/child: untrusted\n";
        let status = parse_trust_show(stdout, None).unwrap();
        assert_eq!(status.source, TrustSource::ConfigUntrusted);
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
