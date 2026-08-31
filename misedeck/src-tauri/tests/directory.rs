// Integration tests for the directory-preview commands (issue #24).
//
//   * tools_env    → mise env --json (flat Map<String, String>)
//   * read_lockfile → read <cwd>/mise.lock, or None when absent
//
// The env command is exercised against the fixture-mise harness, the
// same pattern the tools page uses (#21). The lockfile is read with
// `std::fs` so its tests use `tempfile` to spin up a real
// directory — there is no fixture for the file's contents; the
// assertion is on the boundary contract (Some on present, None on
// missing, structured error on hard I/O failure).

use std::path::PathBuf;

use misedeck_lib::mise::{code, mise_env, read_mise_lockfile, AppError};
use serial_test::serial;
use tempfile::TempDir;

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

// ---------- tools_env ----------

#[test]
#[serial]
fn tools_env_returns_flat_map() {
    let script = fixture_script();
    with_slug("env---json", || {
        let v = mise_env(&script, None).expect("env --json should yield Ok");
        let obj = v.as_object().expect("env payload must be a JSON object");
        // The recorded fixture has the well-known env vars below.
        assert_eq!(
            obj.get("JAVA_HOME").and_then(|x| x.as_str()),
            Some("/Users/example/.local/share/mise/installs/java/oracle-17")
        );
        assert_eq!(
            obj.get("GOROOT").and_then(|x| x.as_str()),
            Some("/Users/example/.local/share/mise/installs/go/1.26.7")
        );
        // A project [env] table value passes through too.
        assert_eq!(obj.get("NODE_ENV").and_then(|x| x.as_str()), Some("preview"));
        // Every value is a string (mise env --json is a flat map).
        for (k, val) in obj {
            assert!(val.is_string(), "env value for {k:?} must be a string, got {val:?}");
        }
    });
}

#[test]
#[serial]
fn tools_env_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("env---json-command-failed", || {
        let err = mise_env(&script, None).expect_err("non-zero exit should yield Err");
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
fn tools_env_garbage_stdout_returns_parse_failed() {
    let script = fixture_script();
    with_slug("env---json-parse-failed", || {
        let err = mise_env(&script, None).expect_err("non-JSON stdout should yield Err");
        assert_eq!(err.code, code::PARSE_FAILED);
    });
}

#[test]
#[serial]
fn tools_env_passes_cwd_via_dash_c() {
    // The runner prepends `-C <dir>` to argv; the fixture serves the
    // same payload regardless of cwd, so we only assert the call
    // does not reject cwd and that the JSON parses.
    let script = fixture_script();
    with_slug("env---json", || {
        let v = mise_env(&script, Some(std::path::Path::new("/tmp/some-cwd")))
            .expect("env --json with cwd should yield Ok");
        let obj = v.as_object().expect("env payload must be a JSON object");
        assert!(obj.contains_key("JAVA_HOME"));
    });
}

// ---------- read_mise_lockfile ----------

#[test]
fn read_mise_lockfile_returns_none_when_no_cwd() {
    // The global context has no associated lockfile.
    let result = read_mise_lockfile(None).expect("read_mise_lockfile(None) should yield Ok");
    assert!(result.is_none(), "expected None for global context, got {result:?}");
}

#[test]
fn read_mise_lockfile_returns_none_when_file_absent() {
    let dir = TempDir::new().expect("tempdir");
    let result = read_mise_lockfile(Some(dir.path())).expect("missing file should yield Ok(None)");
    assert!(result.is_none(), "expected None for missing file, got {result:?}");
}

#[test]
fn read_mise_lockfile_returns_content_when_present() {
    let dir = TempDir::new().expect("tempdir");
    let body = "# @generated - test lockfile\nversion = \"1\"\n";
    std::fs::write(dir.path().join("mise.lock"), body).expect("write lockfile");
    let result = read_mise_lockfile(Some(dir.path())).expect("present file should yield Ok");
    let content = result.expect("expected Some for present file");
    assert_eq!(content, body);
}

#[test]
fn read_mise_lockfile_ignores_unrelated_files() {
    // The function only looks at `<cwd>/mise.lock`; a sibling file
    // with a similar name must not be picked up.
    let dir = TempDir::new().expect("tempdir");
    std::fs::write(dir.path().join("mise.lock.bak"), "noise").expect("write");
    let result = read_mise_lockfile(Some(dir.path())).expect("missing lockfile should yield Ok");
    assert!(result.is_none(), "expected None for sibling file, got {result:?}");
}

// ---------- AppError shape ----------

#[test]
fn app_error_serializes_with_camel_case_keys() {
    // The boundary contract requires camelCase fields on the JS
    // side; assert them so a stray rename does not silently break
    // the wire shape.
    let e = AppError::command_failed("boom", "stderr here");
    let v = serde_json::to_value(&e).expect("serialize");
    assert_eq!(v["code"], "COMMAND_FAILED");
    assert_eq!(v["message"], "boom");
    assert_eq!(v["stderr"], "stderr here");
}
