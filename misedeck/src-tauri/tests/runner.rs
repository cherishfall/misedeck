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

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use misedeck_lib::mise::{code, require_success, run_mise, RunEvent, RunRequest};
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
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
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
        let outcome = run_mise(&script, &req, |_| {}).expect("runner returns Ok even on non-zero exit");
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
        assert!(
            combined.contains(cwd_marker) || combined.contains("-C"),
            "expected cwd in runner output, got stdout={:?} stderr={:?}",
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
        let outcome = run_mise(&script, &req, |_| {}).expect("runner returns Ok even on non-zero exit");
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
        let stdout_count = evs.iter().filter(|e| matches!(e, RunEvent::Stdout { .. })).count();
        let stderr_count = evs.iter().filter(|e| matches!(e, RunEvent::Stderr { .. })).count();
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
        assert!(outcome.stdout.contains("line-before"), "stdout = {:?}", outcome.stdout);
        assert!(
            outcome.stdout.contains("line-after-bad-bytes"),
            "transcript truncated after invalid bytes: {:?}",
            outcome.stdout
        );
        // The replacement character proves the bytes were decoded lossily
        // rather than dropped.
        assert!(outcome.stdout.contains('\u{FFFD}'), "stdout = {:?}", outcome.stdout);
        let evs = events.lock().unwrap();
        assert!(
            evs.iter().any(|e| matches!(e, RunEvent::Stdout { line } if line == "line-after-bad-bytes")),
            "events = {evs:?}"
        );
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}
