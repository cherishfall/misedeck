// Integration tests for the mise runner.
//
// These tests use the fixture-mise script (a tiny bash stand-in for the
// real `mise` binary) instead of the user's actual mise. They cover every
// fixed AppError code plus the success path. See docs/agents/conventions.md
// ("Testing") and docs/agents/getting-started.md.
//
// The fixture-mise script reads the `FIXTURE_MISE_SLUG` env var so the
// same script + same argv can drive multiple scenarios. Env vars are
// process-wide, so the slug-mutating tests are marked `#[serial]` to
// avoid races with `cargo test`'s default parallel runner.

use std::path::{Path, PathBuf};

use misedeck_lib::mise::{code, detect_mise, extract_date, locate_mise, meets_minimum};
use serial_test::serial;

fn fixture_script() -> PathBuf {
    // CARGO_MANIFEST_DIR points at the crate root (src-tauri) at compile time.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest.join("tests/fixtures/mise/fixture-mise")
}

/// Set FIXTURE_MISE_SLUG for the duration of the closure so the fixture
/// script serves the right recorded response, then clear it. Always pair
/// with `#[serial]`.
fn with_slug<F: FnOnce()>(slug: &str, f: F) {
    // SAFETY: every call to this function is gated by `#[serial]`, so no
    // two tests can be inside this block concurrently.
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
fn success_path_returns_typed_result() {
    let script = fixture_script();
    with_slug("version---json-success", || {
        let ok = detect_mise(&script).expect("fixture success path should yield Ok");
        assert_eq!(ok.version_date, "2026.8.14");
        assert!(
            ok.version.contains("2026.8.14"),
            "version string should include date prefix, got {:?}",
            ok.version
        );
        assert_eq!(ok.binary_path, script);
        assert_eq!(ok.raw["os"], "macos");
        assert_eq!(ok.raw["arch"], "arm64");
    });
}

#[test]
fn missing_binary_returns_mise_not_found() {
    // Point at a path that does not exist. The runner must not touch the
    // user's real mise binary.
    let bogus = Path::new("/this/path/does/not/exist/mise-xyz");
    let err = detect_mise(bogus).expect_err("missing binary should yield Err");
    assert_eq!(err.code, code::MISE_NOT_FOUND);
    assert!(err.stderr.is_empty(), "stderr should be empty for not-found");
}

#[test]
#[serial]
fn too_old_version_returns_mise_too_old() {
    let script = fixture_script();
    with_slug("version---json-too-old", || {
        let err = detect_mise(&script).expect_err("2024.12.31 < 2025.1.0 should fail");
        assert_eq!(err.code, code::MISE_TOO_OLD);
        assert!(
            err.message.contains("2024.12.31"),
            "message should include the found version, got {:?}",
            err.message
        );
        assert!(
            err.message.contains("2025.1.0"),
            "message should include the minimum version, got {:?}",
            err.message
        );
    });
}

#[test]
#[serial]
fn non_zero_exit_returns_command_failed_with_stderr() {
    let script = fixture_script();
    with_slug("version---json-command-failed", || {
        let err = detect_mise(&script).expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(
            err.stderr.contains("ERROR"),
            "stderr should be preserved verbatim, got {:?}",
            err.stderr
        );
    });
}

#[test]
#[serial]
fn garbage_stdout_returns_parse_failed() {
    let script = fixture_script();
    with_slug("version---json-parse-failed", || {
        let err = detect_mise(&script).expect_err("non-JSON stdout should yield Err");
        assert_eq!(err.code, code::PARSE_FAILED);
    });
}

#[test]
fn app_error_serializes_with_camel_case_keys() {
    // The Rust↔TS boundary uses `#[serde(rename_all = "camelCase")]`.
    // Confirm the on-the-wire shape so the TS type mirrors this exactly.
    let err = misedeck_lib::mise::AppError::not_found();
    let v = serde_json::to_value(&err).unwrap();
    assert!(v.get("code").is_some(), "must have `code` key, got {v:?}");
    assert!(v.get("message").is_some(), "must have `message` key, got {v:?}");
    assert!(v.get("stderr").is_some(), "must have `stderr` key, got {v:?}");
    assert_eq!(v["code"], "MISE_NOT_FOUND");
    // Make sure no snake_case leaked through.
    assert!(v.get("binary_path").is_none());
}

#[test]
fn detect_mise_result_enum_serializes_with_kind_tag() {
    // The Tauri command returns a `DetectMiseResult` enum with a `kind`
    // discriminator (see `src-tauri/src/lib.rs`). Verify the on-the-wire
    // shape so the TS `DetectMiseResult` type mirrors it exactly.
    use misedeck_lib::DetectMiseResult;

    // Ok variant — struct variant, so the shape is {kind: "ok", ok: {...}}.
    let ok = DetectMiseResult::Ok {
        ok: misedeck_lib::mise::DetectMiseOk {
            version: "2026.8.14 macos-arm64 (2026-08-26)".to_string(),
            version_date: "2026.8.14".to_string(),
            binary_path: PathBuf::from("/usr/local/bin/mise"),
            raw: serde_json::json!({}),
        },
    };
    let v = serde_json::to_value(&ok).unwrap();
    assert_eq!(v["kind"], "ok");
    assert!(v.get("ok").is_some(), "must have `ok` payload, got {v:?}");
    assert!(v.get("err").is_none());

    // Err variant
    let err = DetectMiseResult::Err {
        err: misedeck_lib::mise::AppError::not_found(),
    };
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["kind"], "err");
    assert!(v.get("err").is_some(), "must have `err` payload, got {v:?}");
    assert!(v.get("ok").is_none());
    assert_eq!(v["err"]["code"], "MISE_NOT_FOUND");
}

#[test]
fn locate_mise_does_not_touch_fixture_script() {
    // `locate_mise` is a host-filesystem probe; it should return MISE_NOT_FOUND
    // in the test environment (the fixture is not at any of the well-known
    // host paths) — which is what we want. The assertion is just that it
    // doesn't accidentally find the fixture script.
    let res = locate_mise();
    match res {
        Ok(p) => assert!(
            !p.ends_with("fixture-mise"),
            "locate_mise must not find the test fixture"
        ),
        Err(e) => assert_eq!(e.code, code::MISE_NOT_FOUND),
    }
}

#[test]
fn version_date_parsing_is_strict() {
    assert!(meets_minimum("2025.1.0", "2025.1.0"));
    assert!(meets_minimum("2025.1.1", "2025.1.0"));
    assert!(meets_minimum("2026.12.31", "2025.1.0"));
    assert!(!meets_minimum("2024.12.31", "2025.1.0"));
    assert!(!meets_minimum("not-a-version", "2025.1.0"));
    let (head, _) = extract_date("2026.8.14 macos-arm64 (2026-08-26)").unwrap();
    assert_eq!(head, "2026.8.14");
}
