// Integration tests for `mise self-update` (issue #125).
//
// `self-update` is the only mise command that reads stdin (its `[Y/n]`
// confirmation prompt); the runner never wires stdin, so the argv must
// carry `--yes` or every run aborts with exit 1. These tests pin the
// argv and run it against the fixture-mise script (slug
// `self-update---yes`). The post-update probe runs `version --json`
// under the default `version---json` slug, so that fixture exists too.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use misedeck_lib::install::{mise_self_update_argv, run_self_update};
use misedeck_lib::mise::RunEvent;

// The install streaming loop below drives `run_install_command` through a
// local `sh` stand-in, so it is unix-only. Its imports must be gated the
// same way: an unused import is a clippy error, and clippy runs with
// `-D warnings`.
#[cfg(not(target_os = "windows"))]
use misedeck_lib::install::run_install_command;
#[cfg(not(target_os = "windows"))]
use misedeck_lib::mise::code;
#[cfg(not(target_os = "windows"))]
use std::process::Command;
#[cfg(not(target_os = "windows"))]
use std::time::Duration;
mod common;

fn fixture_script() -> PathBuf {
    common::fixture_script()
}

#[test]
fn mise_self_update_argv_includes_yes() {
    assert_eq!(
        mise_self_update_argv(),
        vec!["self-update".to_string(), "--yes".to_string()]
    );
}

// Serialized because it rewrites the process environment
// (`FIXTURE_MISE_ENV_LOG`) and `set_var` is only sound while no other
// thread reads the environment. Every test in this binary that spawns a
// child carries the same attribute: a spawn copies the environment, so
// it must not overlap the window this test opens. The pure argv case
// below spawns nothing and stays ungated. Same convention as the
// `with_slug` tests in `tests/tools.rs` and friends.
#[test]
#[serial_test::serial]
fn run_self_update_streams_to_exit_and_probes_version() {
    let script = fixture_script();
    // Record what each mise call saw, to prove the post-update probe
    // took the read path while the mutation stayed on the streaming one
    // (issue #254).
    let env_log = std::env::temp_dir().join(format!(
        "misedeck-self-update-env-{}.log",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&env_log);
    // SAFETY: `set_var` is unsound while another thread reads or writes
    // the environment, so every test in this binary that spawns a child
    // is `#[serial]` — a child inherits this variable, and one that ran
    // inside this window would append to `env_log` and break the
    // assertions below. The serial attribute is the exclusion, not the
    // restore call at the end.
    unsafe {
        std::env::set_var("FIXTURE_MISE_ENV_LOG", &env_log);
    }
    let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let events_for_cb = events.clone();
    let outcome = run_self_update(&script, None, move |e| {
        events_for_cb.lock().unwrap().push(e)
    })
    .expect("self-update fixture should yield Ok");
    unsafe {
        std::env::remove_var("FIXTURE_MISE_ENV_LOG");
    }
    let calls = std::fs::read_to_string(&env_log).unwrap_or_default();
    let _ = std::fs::remove_file(&env_log);

    let events = events.lock().unwrap();
    assert_eq!(outcome.outcome.exit_code, 0);
    assert!(outcome.outcome.stdout.contains("self-update"));
    // Post-update probe: the fixture's `version---json` slug reports
    // 2026.8.14, so `new_version` is populated.
    assert_eq!(
        outcome.new_version.as_deref(),
        Some("2026.8.14 macos-arm64 (2026-08-26)")
    );
    assert!(matches!(events.last(), Some(RunEvent::Exit { .. })));

    let version_call = calls
        .lines()
        .find(|line| line.contains("version --json"))
        .expect("the probe must run mise version --json");
    assert!(
        version_call.ends_with("MISE_SAFE=1"),
        "the post-update version read must take the safe read path: {version_call:?}"
    );
    let update_call = calls
        .lines()
        .find(|line| line.contains("self-update --yes"))
        .expect("the mutation must run mise self-update");
    assert!(
        update_call.ends_with("MISE_SAFE=<unset>"),
        "a mutation must not run under MISE_SAFE: {update_call:?}"
    );
}

// ---------- The install streaming loop (issue #255) ----------
//
// `run_install` spawns the network install script, so the loop itself is
// driven through `run_install_command` with a local `sh` stand-in: the
// audit found the path a user without mise hits on day one had no test
// at all (R-17). Unix-only because the stand-in is `sh` (same gate as the
// unit test in `src/install.rs`).

#[cfg(not(target_os = "windows"))]
fn sh(script: &str) -> Command {
    let mut cmd = Command::new("sh");
    cmd.args(["-c", script]);
    cmd
}

#[cfg(not(target_os = "windows"))]
#[test]
#[serial_test::serial]
fn run_install_command_streams_and_aggregates_a_clean_exit() {
    let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let events_for_cb = events.clone();
    let outcome = run_install_command(
        sh("printf 'downloading\\ninstalled mise\\n'"),
        Duration::from_secs(5),
        None,
        move |e| events_for_cb.lock().unwrap().push(e),
    )
    .expect("exit 0 is a successful install");

    assert_eq!(outcome.exit_code, 0);
    assert!(!outcome.timed_out);
    assert_eq!(outcome.stdout, "downloading\ninstalled mise\n");
    assert!(outcome.stderr.is_empty());
    assert!(
        outcome.duration_ms < 5_000,
        "duration = {}",
        outcome.duration_ms
    );

    let events = events.lock().unwrap();
    let lines: Vec<&str> = events
        .iter()
        .filter_map(|e| match e {
            RunEvent::Stdout { line } => Some(line.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(lines, vec!["downloading", "installed mise"]);
    assert!(matches!(
        events.last(),
        Some(RunEvent::Exit {
            exit_code: 0,
            timed_out: false,
            ..
        })
    ));
}

#[cfg(not(target_os = "windows"))]
#[test]
#[serial_test::serial]
fn run_install_command_nonzero_exit_keeps_stderr_and_fails() {
    let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let events_for_cb = events.clone();
    let err = run_install_command(
        sh("printf 'partial\\n'; printf 'installer: download failed\\n' >&2; exit 7"),
        Duration::from_secs(5),
        None,
        move |e| events_for_cb.lock().unwrap().push(e),
    )
    .expect_err("a non-zero installer exit must fail the command");

    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.stderr.contains("installer: download failed"),
        "stderr must be preserved verbatim, got {:?}",
        err.stderr
    );
    let events = events.lock().unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e, RunEvent::Stdout { line } if line == "partial")),
        "the streamed transcript must survive the failure: {events:?}"
    );
    // The exit event carries the real code before the Err is built, so
    // the execution panel does not report a successful run.
    assert!(matches!(
        events.last(),
        Some(RunEvent::Exit {
            exit_code: 7,
            timed_out: false,
            ..
        })
    ));
}

#[cfg(not(target_os = "windows"))]
#[test]
#[serial_test::serial]
fn run_install_command_times_out_and_reports_the_ceiling() {
    let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let events_for_cb = events.clone();
    let err = run_install_command(
        sh("printf 'started\\n'; sleep 5"),
        Duration::from_millis(150),
        None,
        move |e| events_for_cb.lock().unwrap().push(e),
    )
    .expect_err("a command past the deadline must be killed");

    assert_eq!(err.code, code::TIMEOUT);
    let events = events.lock().unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e, RunEvent::Stdout { line } if line == "started")),
        "the lines delivered before the deadline must survive: {events:?}"
    );
    assert!(matches!(
        events.last(),
        Some(RunEvent::Exit {
            exit_code: -1,
            timed_out: true,
            ..
        })
    ));
}
