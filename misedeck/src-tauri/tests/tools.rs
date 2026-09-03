// Integration tests for the read-only tools commands (issue #21).
//
//   * tools_ls        → mise ls --json
//   * tools_ls_tool   → mise ls --json <tool>
//   * tools_outdated  → mise outdated --json --bump
//   * tools_ls_remote → mise ls-remote --json <tool>
//
// The fixture-mise script serves recorded JSON / stderr / exit code
// per argv joined by `-`. New slugs live under tests/fixtures/mise/.
// These tests assert the boundary contract: that the raw JSON mise
// returns is shipped as `value` on success and that the structured
// AppError is shipped as `err` on failure — the typed shapes
// (MiseLsItem, MiseOutdatedItem, MiseLsRemoteItem) are documentation
// for the TS side and are not asserted here.

use std::path::PathBuf;

use misedeck_lib::mise::{code, mise_ls, mise_ls_remote, mise_ls_tool, mise_outdated};
use misedeck_lib::JsonResult;
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

#[test]
#[serial]
fn tools_ls_returns_raw_json_value() {
    let script = fixture_script();
    with_slug("ls---json", || {
        let v = mise_ls(&script, None).expect("ls --json should yield Ok");
        // Top-level is an object with one key per tool.
        let obj = v.as_object().expect("ls payload must be a JSON object");
        assert!(obj.contains_key("go"), "expected `go` in payload, got {v:?}");
        assert!(obj.contains_key("node"), "expected `node` in payload, got {v:?}");
        // Each tool has at least one installed item with an active flag.
        let go_items = obj["go"].as_array().expect("`go` must be an array");
        assert!(!go_items.is_empty(), "expected at least one go item");
        let first = &go_items[0];
        assert_eq!(first["version"], "1.26.7");
        assert_eq!(first["active"], true);
    });
}

#[test]
#[serial]
fn tools_ls_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("ls---json-command-failed", || {
        let err = mise_ls(&script, None).expect_err("non-zero exit should yield Err");
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
fn tools_ls_garbage_stdout_returns_parse_failed() {
    let script = fixture_script();
    with_slug("ls---json-parse-failed", || {
        let err = mise_ls(&script, None).expect_err("non-JSON stdout should yield Err");
        assert_eq!(err.code, code::PARSE_FAILED);
    });
}

#[test]
#[serial]
fn tools_ls_tool_returns_array_of_installed_versions() {
    // Unlike the whole-list `mise ls --json` (an object keyed by tool),
    // the single-tool query returns a bare array. The JS parser used to
    // reject that shape, so the page showed an empty state despite
    // installed versions (issue #69) — pin the array contract here.
    let script = fixture_script();
    with_slug("ls---json-java", || {
        let v = mise_ls_tool(&script, None, "java").expect("ls --json java should yield Ok");
        let arr = v.as_array().expect("single-tool ls payload must be a JSON array");
        assert_eq!(arr.len(), 11, "expected every installed version, got {v:?}");
        assert_eq!(arr[0]["version"], "oracle-8");
        assert_eq!(arr[0]["active"], false);
        // Non-active versions are part of the payload, and exactly one
        // version is active — the row list is not filtered down to it.
        let active = arr.iter().filter(|i| i["active"] == true).count();
        assert_eq!(active, 1, "expected one active version, got {active}");
    });
}

#[test]
fn tools_ls_tool_rejects_empty_tool() {
    // Same boundary guard as `mise ls-remote`: an empty tool is
    // rejected before invoking mise so the runner never sees a
    // half-formed argv.
    let script = fixture_script();
    let err = mise_ls_tool(&script, None, "")
        .expect_err("empty tool should yield Err before spawning");
    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.message.contains("tool"),
        "message should mention the tool arg, got {:?}",
        err.message
    );
}

#[test]
#[serial]
fn tools_outdated_returns_map_with_one_tool() {
    let script = fixture_script();
    with_slug("outdated---json---bump", || {
        let v = mise_outdated(&script, None).expect("outdated --json --bump should yield Ok");
        let obj = v.as_object().expect("outdated payload must be a JSON object");
        assert!(obj.contains_key("go"), "expected `go` outdated, got {v:?}");
        assert_eq!(obj["go"]["latest"], "1.27.0");
        assert_eq!(obj["go"]["bump"], "1.27.0");
    });
}

#[test]
#[serial]
fn tools_outdated_empty_returns_empty_object() {
    let script = fixture_script();
    with_slug("outdated---json---bump-empty", || {
        let v = mise_outdated(&script, None).expect("empty outdated should yield Ok");
        let obj = v.as_object().expect("outdated payload must be a JSON object");
        assert!(obj.is_empty(), "expected empty map, got {v:?}");
    });
}

#[test]
#[serial]
fn tools_outdated_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("outdated---json---bump-command-failed", || {
        let err = mise_outdated(&script, None).expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(err.stderr.contains("ERROR"));
    });
}

#[test]
#[serial]
fn tools_ls_remote_returns_array() {
    let script = fixture_script();
    with_slug("ls-remote---json-go", || {
        let v = mise_ls_remote(&script, None, "go").expect("ls-remote go should yield Ok");
        let arr = v.as_array().expect("ls-remote payload must be a JSON array");
        assert!(!arr.is_empty(), "expected at least one go version, got {v:?}");
        let first = &arr[0];
        assert!(first["version"].is_string(), "expected string version, got {first:?}");
    });
}

#[test]
#[serial]
fn tools_ls_remote_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("ls-remote---json-go-command-failed", || {
        let err = mise_ls_remote(&script, None, "go")
            .expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(err.stderr.contains("ERROR"));
    });
}

#[test]
fn tools_ls_remote_rejects_empty_tool() {
    // The Rust boundary rejects an empty tool before invoking mise so
    // the runner never sees a half-formed argv.
    let script = fixture_script();
    let err = mise_ls_remote(&script, None, "")
        .expect_err("empty tool should yield Err before spawning");
    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.message.contains("tool"),
        "message should mention the tool arg, got {:?}",
        err.message
    );
}

#[test]
fn json_result_serializes_with_kind_tag() {
    // The Tauri command returns a `JsonResult` enum with a `kind`
    // discriminator (see `src-tauri/src/lib.rs`). Verify the on-the-wire
    // shape so the TS side can pattern-match on it.
    let ok = JsonResult::Ok {
        value: serde_json::json!({ "go": [] }),
    };
    let v = serde_json::to_value(&ok).unwrap();
    assert_eq!(v["kind"], "ok");
    assert!(v.get("value").is_some(), "must have `value` payload, got {v:?}");
    assert!(v.get("err").is_none());

    let err = JsonResult::Err {
        err: misedeck_lib::mise::AppError::not_found(),
    };
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["kind"], "err");
    assert!(v.get("err").is_some(), "must have `err` payload, got {v:?}");
    assert!(v.get("value").is_none());
    assert_eq!(v["err"]["code"], "MISE_NOT_FOUND");
}
