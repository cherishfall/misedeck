// Integration tests for the trust UX (issue #25).
//
//   * trust_check  → `mise trust --show`
//   * run_trust    → `mise trust`
//
// Both surfaces are exercised against the fixture-mise harness, the
// same pattern the tools / directory pages use. The fixture serves
// canned stdout per argv (joined by `-`), so the trust --show tests
// can assert each of the three documented TrustSource states
// (configTrusted, configUntrusted, noConfig) without touching the
// user's real mise. The `run_trust` tests assert the streaming
// surface: one stdout line plus a final Exit event.

use std::path::PathBuf;

use misedeck_lib::mise::{
    check_trust, code, run_trust, AppError, RunEvent, TrustSource,
};
use serial_test::serial;

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mise/fixture-mise")
}

/// Set FIXTURE_MISE_SLUG for the duration of the closure so the
/// fixture script serves the right recorded response, then clear it.
/// Always pair with `#[serial]`.
fn with_slug<F: FnOnce()>(slug: &str, f: F) {
    unsafe {
        std::env::set_var("FIXTURE_MISE_SLUG", slug);
    }
    f();
    unsafe {
        std::env::remove_var("FIXTURE_MISE_SLUG");
    }
}

// ---------- check_trust (mise trust --show) ----------

#[test]
#[serial]
fn check_trust_reports_config_trusted() {
    let script = fixture_script();
    with_slug("trust---show-trusted", || {
        let status = check_trust(&script, Some(std::path::Path::new("/tmp/mise-trust-test")))
            .expect("trusted fixture should yield Ok");
        assert_eq!(status.source, TrustSource::ConfigTrusted);
        assert!(
            status.path.contains("mise-trust-test"),
            "path should be the config path from the fixture, got {:?}",
            status.path
        );
    });
}

#[test]
#[serial]
fn check_trust_reports_config_untrusted() {
    let script = fixture_script();
    with_slug("trust---show-untrusted", || {
        let status = check_trust(&script, Some(std::path::Path::new("/tmp/mise-trust-test")))
            .expect("untrusted fixture should yield Ok");
        assert_eq!(status.source, TrustSource::ConfigUntrusted);
    });
}

#[test]
#[serial]
fn check_trust_reports_no_config_when_mise_says_so() {
    // mise prints `No trusted config files found.` when there is
    // no `mise.toml` in the cwd's ancestry. The runner treats that
    // (and an empty stdout) as `NoConfig`.
    let script = fixture_script();
    with_slug("trust---show-no-config", || {
        let status = check_trust(&script, Some(std::path::Path::new("/tmp/empty-dir")))
            .expect("no-config fixture should yield Ok");
        assert_eq!(status.source, TrustSource::NoConfig);
        // The fallback path is the cwd we asked about.
        assert!(status.path.contains("empty-dir"));
    });
}

#[test]
#[serial]
fn check_trust_propagates_command_failed() {
    // A non-zero exit on `trust --show` (e.g. mise missing) maps to
    // COMMAND_FAILED, not to a TrustSource.
    let script = fixture_script();
    with_slug("trust---show-command-failed", || {
        let err = check_trust(&script, Some(std::path::Path::new("/tmp/somewhere")))
            .expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(
            err.stderr.contains("ERROR"),
            "stderr should be preserved verbatim, got {:?}",
            err.stderr
        );
    });
}

#[test]
fn check_trust_returns_not_found_when_mise_missing() {
    // Point at a path that does not exist; the runner maps the
    // spawn failure to MISE_NOT_FOUND.
    let bogus = PathBuf::from("/this/path/does/not/exist/mise-xyz");
    let err = check_trust(&bogus, Some(std::path::Path::new("/tmp/somewhere")))
        .expect_err("missing binary should yield Err");
    assert_eq!(err.code, code::MISE_NOT_FOUND);
}

// ---------- run_trust (mise trust) ----------

#[test]
#[serial]
fn run_trust_streams_stdout_and_exit() {
    let script = fixture_script();
    with_slug("trust", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let outcome = run_trust(&script, Some(std::path::Path::new("/tmp/mise-trust-test")), move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("trust fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        assert!(
            outcome.stdout.contains("mise trusted"),
            "expected `mise trusted` in stdout, got {:?}",
            outcome.stdout
        );
        let evs = events.lock().unwrap();
        // At least one stdout line and the final Exit event.
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

#[test]
#[serial]
fn run_trust_propagates_command_failed() {
    // A non-zero exit on `mise trust` is the only error path the
    // panel sees; the runner surfaces the structured AppError so
    // the JS side can render the stderr in the panel.
    let script = fixture_script();
    with_slug("trust-command-failed", || {
        let err = run_trust(&script, Some(std::path::Path::new("/tmp/mise-trust-test")), |_| {})
            .expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(
            err.stderr.contains("ERROR"),
            "stderr should be preserved verbatim, got {:?}",
            err.stderr
        );
    });
}

#[test]
fn run_trust_returns_not_found_when_mise_missing() {
    let bogus = PathBuf::from("/this/path/does/not/exist/mise-xyz");
    let err = run_trust(&bogus, Some(std::path::Path::new("/tmp/somewhere")), |_| {})
        .expect_err("missing binary should yield Err");
    assert_eq!(err.code, code::MISE_NOT_FOUND);
}

// ---------- TrustResult enum shape (issue #25 IPC contract) ----------

#[test]
fn trust_result_enum_serializes_with_kind_tag() {
    // The Tauri command returns a `TrustResult` enum with a `kind`
    // discriminator; verify the on-the-wire shape so the TS side
    // can pattern-match on it.
    use misedeck_lib::TrustResult;

    let ok = TrustResult::Ok {
        ok: misedeck_lib::mise::TrustStatus {
            source: TrustSource::ConfigTrusted,
            path: "/tmp/example".to_string(),
        },
    };
    let v = serde_json::to_value(&ok).unwrap();
    assert_eq!(v["kind"], "ok");
    assert!(v.get("ok").is_some(), "must have `ok` payload, got {v:?}");
    assert_eq!(v["ok"]["source"], "configTrusted");
    assert!(v.get("err").is_none());

    let err = TrustResult::Err {
        err: AppError::not_found(),
    };
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["kind"], "err");
    assert!(v.get("err").is_some(), "must have `err` payload, got {v:?}");
    assert!(v.get("ok").is_none());
    assert_eq!(v["err"]["code"], "MISE_NOT_FOUND");
}
