// Integration tests for the generalized mise runner (issue #18).
//
// These tests use the fixture-mise script (a tiny bash stand-in for the
// real `mise` binary) and never touch the user's actual mise. They cover:
//   - capturing stdout/stderr
//   - non-zero exit mapping to COMMAND_FAILED
//   - the -C <cwd> arg being prepended in front of the user's args
//   - Global mode (cwd: None) prepending -C <home> (issue #179)
//   - streaming emits Stdout/Stderr/Exit events in order
//   - missing binary maps to MISE_NOT_FOUND
//   - cancel / timeout kill the whole process tree, grandchild included
//     (issue #223; unix only — see the module at the end)

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use misedeck_lib::mise::{
    code, require_success, run_mise, run_mise_json, run_mise_tracked, run_mise_tracked_read_only,
    run_mise_with_timeout, RunEvent, RunRequest,
};
use serial_test::serial;

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mise/fixture-mise")
}

/// Set FIXTURE_MISE_SLUG for the duration of the closure.
fn with_slug<F: FnOnce()>(slug: &str, f: F) {
    unsafe {
        std::env::set_var("FIXTURE_MISE_SLUG", slug);
    }
    f();
    unsafe {
        std::env::remove_var("FIXTURE_MISE_SLUG");
    }
}

#[test]
#[serial]
fn captured_run_collects_stdout_and_stderr() {
    let script = fixture_script();
    with_slug("doctor-happy", || {
        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events2 = Arc::clone(&events);
        let req = RunRequest::new(vec!["doctor".to_string()]);
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("doctor happy path should yield Ok");
        assert_eq!(outcome.exit_code, 0);
        assert!(outcome.stdout.contains("[OK]"));
        // At least one Stdout line was emitted.
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        // Exit event is the last one.
        assert!(matches!(
            evs.last(),
            Some(RunEvent::Exit { exit_code: 0, .. })
        ));
    });
}

#[test]
#[serial]
fn captured_run_with_nonzero_exit_keeps_stderr() {
    let script = fixture_script();
    with_slug("doctor-fail", || {
        let req = RunRequest::new(vec!["doctor".to_string()]);
        // run_mise itself does not return Err on non-zero exit; the
        // captured outcome has the exit code. The probe wrapper turns
        // non-zero into COMMAND_FAILED — this test asserts the raw
        // surface so the wrapper can rely on it.
        let outcome =
            run_mise(&script, &req, |_| {}).expect("runner returns Ok even on non-zero exit");
        assert_ne!(outcome.exit_code, 0);
        assert!(outcome.stderr.contains("ERROR"));
    });
}

#[test]
#[serial]
fn streaming_boundary_turns_nonzero_exit_into_command_failed() {
    // Issue #221: `run_mise` keeps reporting non-zero exits as Ok, but
    // the `run_mise_command` boundary normalizes them with
    // `require_success` — so the frontend sees `kind:"err"` and never a
    // green success with a failing exit code.
    let script = fixture_script();
    with_slug("doctor-fail", || {
        let req = RunRequest::new(vec!["doctor".to_string()]);
        let outcome = run_mise(&script, &req, |_| {}).expect("raw runner returns Ok");
        let err = require_success(outcome).expect_err("non-zero exit must fail at the boundary");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(err.stderr.contains("ERROR"), "stderr = {:?}", err.stderr);
        assert!(
            err.message.contains("exited with status"),
            "message = {:?}",
            err.message
        );
    });
}

#[test]
#[serial]
fn streaming_boundary_passes_a_clean_exit_through() {
    let script = fixture_script();
    with_slug("doctor-happy", || {
        let req = RunRequest::new(vec!["doctor".to_string()]);
        let outcome = run_mise(&script, &req, |_| {}).expect("happy fixture yields Ok");
        let outcome = require_success(outcome).expect("exit 0 must stay Ok");
        assert_eq!(outcome.exit_code, 0);
        assert!(outcome.stdout.contains("[OK]"));
    });
}

#[test]
#[serial]
fn cwd_is_passed_as_dash_c() {
    let script = fixture_script();
    with_slug("echo-argv", || {
        // The fixture-mise script, when given an unknown argv, prints the
        // argv to stderr. The "echo-argv" slug uses the catch-all path:
        // it prints "<argv-joined-by-spaces>" to stdout. We use a
        // recognisable cwd path to assert -C was prepended.
        let cwd_marker = "/tmp/misedeck-runner-test";
        let req = RunRequest::with_cwd(vec!["echo-argv".to_string()], cwd_marker);
        let outcome = run_mise(&script, &req, |_| {}).expect("echo-argv should yield Ok");
        // The fixture (when given an unknown slug under the catch-all path)
        // prints the slug argv joined to stdout. But our catch-all
        // invocation here is "echo-argv" which doesn't match a slug; the
        // fixture prints the error to stderr instead. So we assert the
        // cwd is present in stderr.
        let combined = format!("{}{}", outcome.stdout, outcome.stderr);
        // Exact pair, not `contains(cwd) || contains("-C")`: the loose
        // form passed even when the cwd was wrong, as long as some `-C`
        // showed up somewhere (#278).
        assert!(
            combined.contains(&format!("-C {cwd_marker}")),
            "expected `-C {cwd_marker}` in argv, got stdout={:?} stderr={:?}",
            outcome.stdout,
            outcome.stderr
        );
    });
}

#[test]
#[serial]
fn cwd_none_anchors_to_home() {
    let script = fixture_script();
    with_slug("no-such-fixture", || {
        // Unknown slug: the fixture echoes the full argv to stderr and
        // exits 127. Global mode (cwd: None) must prepend `-C <home>`
        // so mise resolves from the user's home directory, never from
        // the process cwd (issue #179).
        let home = dirs::home_dir().expect("test environment has a home dir");
        let req = RunRequest::new(vec!["env".to_string(), "--json".to_string()]);
        let outcome =
            run_mise(&script, &req, |_| {}).expect("runner returns Ok even on non-zero exit");
        assert_eq!(outcome.exit_code, 127);
        let combined = format!("{}{}", outcome.stdout, outcome.stderr);
        assert!(
            combined.contains(&format!("-C {}", home.display())),
            "expected `-C <home>` in argv, got stdout={:?} stderr={:?}",
            outcome.stdout,
            outcome.stderr
        );
    });
}

#[test]
fn missing_binary_returns_not_found() {
    let bogus = PathBuf::from("/this/path/does/not/exist/mise-xyz");
    let req = RunRequest::new(vec!["version".to_string()]);
    let err = run_mise(&bogus, &req, |_| {}).expect_err("missing binary should yield Err");
    assert_eq!(err.code, code::MISE_NOT_FOUND);
    assert!(err.stderr.is_empty());
}

#[test]
#[serial]
fn streaming_emits_stdout_stderr_and_exit_in_order() {
    let script = fixture_script();
    with_slug("doctor-mixed", || {
        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events2 = Arc::clone(&events);
        let req = RunRequest::new(vec!["doctor".to_string()]);
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("mixed fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0);
        let evs = events.lock().unwrap();
        // At least one Stdout and one Stderr line.
        let stdout_count = evs
            .iter()
            .filter(|e| matches!(e, RunEvent::Stdout { .. }))
            .count();
        let stderr_count = evs
            .iter()
            .filter(|e| matches!(e, RunEvent::Stderr { .. }))
            .count();
        assert!(stdout_count >= 1, "expected stdout lines, got {evs:?}");
        assert!(stderr_count >= 1, "expected stderr lines, got {evs:?}");
        // Last event is Exit.
        assert!(matches!(evs.last(), Some(RunEvent::Exit { .. })));
    });
}

/// The fixture-mise script only replays recorded bytes, so this case gets
/// its own script: the child exits while a grandchild (`sleep 10 &`) holds
/// the stdout pipe open, exactly like a task that ends with `npm run dev &`
/// or starts a daemon (issue #222).
#[test]
fn exited_child_whose_grandchild_holds_stdout_still_returns() {
    let script =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/hold-stdout-fixture");
    let req = RunRequest::new(vec!["run".to_string(), "dev".to_string()]);
    let started = Instant::now();
    let outcome = run_mise(&script, &req, |_| {}).expect("runner must return Ok");
    let elapsed = started.elapsed();

    // The reader bound is one second; anything under three proves the
    // main loop escaped instead of waiting for EOF that never comes.
    assert!(
        elapsed < Duration::from_secs(3),
        "run blocked for {elapsed:?} — the reader join is not bounded"
    );
    assert_eq!(outcome.exit_code, 7, "the child's exit code must survive");
    assert!(
        outcome.stdout.contains("leaving"),
        "buffered lines must still be drained, stdout = {:?}",
        outcome.stdout
    );
}

#[test]
#[serial]
fn invalid_utf8_output_does_not_truncate_the_transcript() {
    let script = fixture_script();
    with_slug("invalid-utf8-output", || {
        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events2 = Arc::clone(&events);
        let req = RunRequest::new(vec!["doctor".to_string()]);
        // Used to end the reader at the first invalid byte, losing everything
        // after it and closing the pipe on the still-running child (#222).
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("invalid UTF-8 must not fail the run");

        assert_eq!(outcome.exit_code, 0);
        assert!(
            outcome.stdout.contains("line-before"),
            "stdout = {:?}",
            outcome.stdout
        );
        assert!(
            outcome.stdout.contains("line-after-bad-bytes"),
            "transcript truncated after invalid bytes: {:?}",
            outcome.stdout
        );
        // The replacement character proves the bytes were decoded lossily
        // rather than dropped.
        assert!(
            outcome.stdout.contains('\u{FFFD}'),
            "stdout = {:?}",
            outcome.stdout
        );
        let evs = events.lock().unwrap();
        assert!(
            evs.iter()
                .any(|e| matches!(e, RunEvent::Stdout { line } if line == "line-after-bad-bytes")),
            "events = {evs:?}"
        );
        assert!(matches!(
            evs.last(),
            Some(RunEvent::Exit { exit_code: 0, .. })
        ));
    });
}

// ---------- MISE_SAFE routing (issue #230, coverage #255) ----------
//
// The trust guarantee lives in one `if` in `run_mise_timed`. The fixture
// logs the MISE_SAFE value it received, so these assertions pin the
// contract from the outside: every read (`run_mise_json`) is safe;
// streaming mutations (`run_mise` / `run_mise_tracked`) deliberately are
// not. A refactor that drops `cmd.env` fails here.

#[test]
#[serial]
fn read_json_sets_mise_safe_and_streaming_does_not() {
    let script = fixture_script();
    let env_log = std::env::temp_dir().join(format!(
        "misedeck-mise-safe-{}.log",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&env_log);
    unsafe {
        std::env::set_var("FIXTURE_MISE_ENV_LOG", &env_log);
    }

    with_slug("ls---json", || {
        let req = RunRequest::new(vec!["ls".to_string(), "--json".to_string()]);
        run_mise_json(&script, &req).expect("the recorded ls payload parses");
    });
    with_slug("upgrade", || {
        let req = RunRequest::new(vec!["upgrade".to_string()]);
        run_mise(&script, &req, |_| {}).expect("the recorded upgrade fixture exits cleanly");
    });
    // A panel-dispatched read (Tools / Settings table) opts into the same
    // contract explicitly (issue #276).
    with_slug("ls---json", || {
        let req = RunRequest::new(vec![
            "settings".to_string(),
            "ls".to_string(),
            "--json-extended".to_string(),
        ]);
        run_mise_tracked_read_only(&script, &req, None, |_| {})
            .expect("the tracked read fixture exits cleanly");
    });

    // The same runner without the flag stays unsafe: the contract is the
    // explicit flag, never the argv shape (issue #276).
    with_slug("ls---json", || {
        let req = RunRequest::new(vec!["ls".to_string(), "--json".to_string()]);
        run_mise_tracked(&script, &req, None, |_| {})
            .expect("the unsafe tracked fixture exits cleanly");
    });

    unsafe {
        std::env::remove_var("FIXTURE_MISE_ENV_LOG");
    }
    let calls = std::fs::read_to_string(&env_log).unwrap_or_default();
    let _ = std::fs::remove_file(&env_log);

    let read_call = calls
        .lines()
        .find(|line| line.contains("ls --json"))
        .expect("the read must have invoked the fixture");
    assert!(
        read_call.ends_with("MISE_SAFE=1"),
        "a read must run with MISE_SAFE=1: {read_call:?}"
    );
    let stream_call = calls
        .lines()
        .find(|line| line.contains("upgrade"))
        .expect("the mutation must have invoked the fixture");
    assert!(
        stream_call.ends_with("MISE_SAFE=<unset>"),
        "a streaming mutation must not run under MISE_SAFE: {stream_call:?}"
    );
    let panel_read_call = calls
        .lines()
        .find(|line| line.contains("settings ls --json-extended"))
        .expect("the panel read must have invoked the fixture");
    assert!(
        panel_read_call.ends_with("MISE_SAFE=1"),
        "a panel read marked read-only must run with MISE_SAFE=1: {panel_read_call:?}"
    );
    let unsafe_call = calls
        .lines()
        .find(|line| line.contains("ls --json MISE_SAFE=<unset>"))
        .expect("the unsafe tracked call must have been logged");
    assert!(
        unsafe_call.ends_with("MISE_SAFE=<unset>"),
        "a tracked run without read_only must not run under MISE_SAFE: {unsafe_call:?}"
    );
}

// ---------- process tree (issue #223) ----------
//
// Both tests below are unix-only and deliberately so, stated here rather
// than implied: the fixture is a bash script that starts a grandchild
// (`sleep 300`), which the Windows CI job cannot execute (it runs
// `cargo test --lib` for exactly that reason), and the liveness probe
// uses `kill(pid, 0)`. The Windows side of the mechanism —
// `CREATE_NEW_PROCESS_GROUP` + `taskkill /F /T` — has no test: there is
// no Windows machine in the review loop, only the compile/test CI job.
//
// Both tests put a hard bound on the runner: a broken implementation
// blocks until the grandchild's `sleep 300` ends, and `recv_timeout`
// turns that hang into a failure instead of a stuck CI job.

#[cfg(unix)]
mod process_tree {
    use super::*;
    use misedeck_lib::process_tree::request_cancel;
    use std::sync::mpsc::channel as std_channel;

    fn tree_fixture() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tree-kill-fixture")
    }

    /// `kill(pid, 0)` — "the process exists and we may signal it".
    fn alive(pid: i32) -> bool {
        // SAFETY: signal 0 only checks existence; no handler runs.
        unsafe { libc::kill(pid, 0) == 0 }
    }

    /// The fixture writes its grandchild's pid once the background
    /// `sleep` is running; poll until the file parses.
    fn wait_for_pid(path: &std::path::Path, bound: Duration) -> Option<i32> {
        let deadline = Instant::now() + bound;
        while Instant::now() < deadline {
            if let Some(pid) = std::fs::read_to_string(path)
                .ok()
                .and_then(|s| s.trim().parse::<i32>().ok())
            {
                return Some(pid);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    }

    /// SIGKILL is asynchronous: give the kernel (and the reaper) a
    /// moment before declaring the grandchild a survivor.
    fn dead_within(pid: i32, bound: Duration) -> bool {
        let deadline = Instant::now() + bound;
        while Instant::now() < deadline {
            if !alive(pid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        !alive(pid)
    }

    /// Cancel must stop the work, not just `sh`. Before #223 the runner
    /// had no cancel path at all (soft cancel) and killed only the direct
    /// child at timeout.
    #[test]
    fn cancel_kills_the_grandchild_too() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pid_file = dir.path().join("grandchild.pid");
        let run_id = "runner-cancel-tree";

        let (tx, rx) = std_channel();
        let script = tree_fixture();
        let pid_arg = pid_file.to_string_lossy().to_string();
        std::thread::spawn(move || {
            let req = RunRequest::new(vec![pid_arg]);
            let result = run_mise_tracked(&script, &req, Some(run_id), |_| {});
            let _ = tx.send(result.map(|o| o.exit_code));
        });

        let grandchild = wait_for_pid(&pid_file, Duration::from_secs(5))
            .expect("fixture never reported its grandchild pid");
        assert!(
            alive(grandchild),
            "grandchild {grandchild} must be running before the cancel"
        );

        request_cancel(run_id);

        // Hard bound: an implementation that ignores the cancel waits for
        // `sleep 300`, so this fails the test instead of hanging CI.
        let result = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("runner did not return after cancel — the process tree was not killed");
        // The runner reports the cancel as an error (the panel has already
        // marked the run cancelled and discards this outcome); a killed
        // process must never look like a clean exit.
        let err = result.expect_err("a cancelled run is not a success");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(
            err.message.contains("cancelled"),
            "message = {:?}",
            err.message
        );
        assert!(
            dead_within(grandchild, Duration::from_secs(5)),
            "grandchild {grandchild} survived the cancel — only the direct child was killed"
        );
    }

    /// Timeout is the same guarantee with a deadline: the 30-minute
    /// ceiling must tear down the tree, not just mise.
    #[test]
    fn timeout_kills_the_grandchild_too() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pid_file = dir.path().join("grandchild.pid");

        let (tx, rx) = std_channel();
        let script = tree_fixture();
        let pid_arg = pid_file.to_string_lossy().to_string();
        std::thread::spawn(move || {
            let req = RunRequest::new(vec![pid_arg]);
            let result = run_mise_with_timeout(&script, &req, Duration::from_secs(2), |_| {});
            let _ = tx.send(result.map(|o| o.exit_code));
        });

        let grandchild = wait_for_pid(&pid_file, Duration::from_secs(5))
            .expect("fixture never reported its grandchild pid");
        assert!(alive(grandchild), "grandchild {grandchild} must be running");

        let result = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("runner did not return after the timeout — the process tree was not killed");
        let err = result.expect_err("a timed-out run is an error");
        assert_eq!(err.code, code::TIMEOUT);
        assert!(
            dead_within(grandchild, Duration::from_secs(5)),
            "grandchild {grandchild} survived the timeout — only the direct child was killed"
        );
    }
}
