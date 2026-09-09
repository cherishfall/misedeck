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

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mise/fixture-mise")
}

#[test]
fn mise_self_update_argv_includes_yes() {
    assert_eq!(
        mise_self_update_argv(),
        vec!["self-update".to_string(), "--yes".to_string()]
    );
}

#[test]
fn run_self_update_streams_to_exit_and_probes_version() {
    let script = fixture_script();
    let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let events_for_cb = events.clone();
    let outcome = run_self_update(&script, move |e| events_for_cb.lock().unwrap().push(e))
        .expect("self-update fixture should yield Ok");
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
}
