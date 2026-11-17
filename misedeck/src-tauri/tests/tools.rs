// Integration tests for the read-only tools runners in `mise.rs`
// (issue #21):
//
//   * mise_ls        → mise ls --json
//   * mise_ls_tool   → mise ls --json <tool>
//   * mise_outdated  → mise outdated --json
//   * mise_ls_remote → mise ls-remote --json <tool>
//
// The fixture-mise script serves recorded JSON / stderr / exit code
// per argv joined by `-`. New slugs live under tests/fixtures/mise/.
// These tests assert the boundary contract: that the raw JSON mise
// returns is shipped as `value` on success and that the structured
// AppError is shipped as `err` on failure — the typed shapes
// (MiseLsItem, MiseOutdatedItem, MiseLsRemoteItem) are documentation
// for the TS side and are not asserted here.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use misedeck_lib::mise::{
    code, mise_ls, mise_ls_remote, mise_ls_tool, mise_outdated, run_mise_tracked_read_only,
    OutputStream, RunEvent, RunRequest,
};
use misedeck_lib::JsonResult;
use serial_test::serial;
mod common;

fn fixture_script() -> PathBuf {
    common::fixture_script()
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
        assert!(
            obj.contains_key("go"),
            "expected `go` in payload, got {v:?}"
        );
        assert!(
            obj.contains_key("node"),
            "expected `node` in payload, got {v:?}"
        );
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
        let arr = v
            .as_array()
            .expect("single-tool ls payload must be a JSON array");
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
    let err =
        mise_ls_tool(&script, None, "").expect_err("empty tool should yield Err before spawning");
    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.message.contains("tool"),
        "message should mention the tool arg, got {:?}",
        err.message
    );
}

#[test]
#[serial]
fn tools_outdated_reports_only_in_range_targets() {
    // No `--bump` (issue #259): with it, mise also reported a pinned
    // tool whose newer release sits outside the configured range
    // (`go 1.27.1 → 1.27.3`), so the Tools page advertised an upgrade
    // `mise upgrade go` cannot perform. Without it the payload lists
    // only tools with an in-range target — here `rust`, whose
    // `latest` equals `current`.
    let script = fixture_script();
    with_slug("outdated---json", || {
        let v = mise_outdated(&script, None).expect("outdated --json should yield Ok");
        let obj = v
            .as_object()
            .expect("outdated payload must be a JSON object");
        assert!(
            obj.contains_key("rust"),
            "expected `rust` in payload, got {v:?}"
        );
        assert_eq!(obj["rust"]["latest"], "stable");
        assert!(
            !obj.contains_key("go"),
            "a tool whose newer version is out of range must not appear: {v:?}"
        );
    });
}

#[test]
#[serial]
fn tools_outdated_empty_returns_empty_object() {
    let script = fixture_script();
    with_slug("outdated---json-empty", || {
        let v = mise_outdated(&script, None).expect("empty outdated should yield Ok");
        let obj = v
            .as_object()
            .expect("outdated payload must be a JSON object");
        assert!(obj.is_empty(), "expected empty map, got {v:?}");
    });
}

#[test]
#[serial]
fn tools_outdated_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("outdated---json-command-failed", || {
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
        let arr = v
            .as_array()
            .expect("ls-remote payload must be a JSON array");
        assert!(
            !arr.is_empty(),
            "expected at least one go version, got {v:?}"
        );
        let first = &arr[0];
        assert!(
            first["version"].is_string(),
            "expected string version, got {first:?}"
        );
    });
}

/// Issue #282: real mise emits `ls-remote --json` as ONE compact JSON
/// line — the recorded go payload below is 17 KB on a single line — so
/// the reader's 8 KiB per-line cap cut it in half and every real tool's
/// version list failed with `PARSE_FAILED`. A captured read now takes
/// the payload as raw bytes to EOF, so the whole array arrives.
///
/// The assertion compares the runner's value to the fixture parsed
/// independently: a prefix would not be equal, so nothing can be
/// silently dropped and still pass.
#[test]
#[serial]
fn tools_ls_remote_parses_a_single_line_payload_past_the_per_line_cap() {
    let payload = std::fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/mise/ls-remote---json-go/stdout"),
    )
    .expect("the recorded go payload");
    // The premise of the regression. `MAX_LINE_BYTES` is crate-private,
    // so the old cap is restated here as the literal it is.
    assert_eq!(payload.lines().count(), 1, "the payload must be one line");
    assert!(
        payload.len() > 8 * 1024,
        "the payload must exceed the old 8 KiB per-line cap, got {} bytes",
        payload.len()
    );
    let recorded: serde_json::Value =
        serde_json::from_str(&payload).expect("the fixture must be valid JSON");
    let recorded_len = recorded.as_array().expect("an array").len();

    let script = fixture_script();
    with_slug("ls-remote---json-go", || {
        let v = mise_ls_remote(&script, None, "go")
            .expect("a single-line payload past the per-line cap must parse whole");
        assert_eq!(
            v.as_array().map(Vec::len),
            Some(recorded_len),
            "every recorded version must survive the read"
        );
        assert_eq!(v, recorded, "the captured payload must arrive unaltered");
    });
}

/// Issue #292: the panel path — `run_mise_command(read_only: true)` →
/// `run_mise_tracked_read_only` — still took `PipeMode::Lines` after #282
/// wired `Raw` into the captured reads, so this same 17 KB single-line
/// payload was cut to the 8 KiB per-line cap at that boundary too:
/// `RunOutcome.stdout` was a prefix, the frontend's `toJsonResult`
/// threw `PARSE_FAILED`, and the not-installed version list failed for
/// every tool whose remote payload exceeds 8 KiB (go/node/python). A
/// tracked read now takes its outcome stdout from a raw capture to EOF
/// while the transcript keeps streaming lines.
///
/// The assertion compares the tracked run's stdout to the fixture parsed
/// independently — a prefix would not be equal, so nothing can be
/// silently dropped and still pass.
#[test]
#[serial]
fn tracked_read_only_returns_the_whole_single_line_payload() {
    let payload = std::fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/mise/ls-remote---json-go/stdout"),
    )
    .expect("the recorded go payload");
    let recorded: serde_json::Value =
        serde_json::from_str(&payload).expect("the fixture must be valid JSON");
    let recorded_len = recorded.as_array().expect("an array").len();

    let script = fixture_script();
    with_slug("ls-remote---json-go", || {
        let events: Arc<Mutex<Vec<RunEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let events2 = Arc::clone(&events);
        let req = RunRequest::new(vec![
            "ls-remote".to_string(),
            "--json".to_string(),
            "go".to_string(),
        ]);
        let outcome = run_mise_tracked_read_only(&script, &req, None, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("the panel read must succeed past the per-line cap");

        // The read itself: exit 0 and the whole payload in the outcome.
        assert_eq!(outcome.exit_code, 0);
        assert_eq!(
            outcome.stdout.len(),
            payload.len(),
            "the outcome must carry every byte of the payload, got {}",
            outcome.stdout.len()
        );
        let parsed: serde_json::Value = serde_json::from_str(&outcome.stdout)
            .expect("the panel read's stdout must parse as JSON");
        assert_eq!(parsed, recorded, "the payload must arrive unaltered");
        assert_eq!(
            parsed.as_array().map(Vec::len),
            Some(recorded_len),
            "every recorded version must survive the panel read"
        );

        // The transcript is still the streaming view: the capped line was
        // forwarded, the typed truncation notice was raised, and the run
        // ended with a clean Exit event.
        let evs = events.lock().unwrap();
        assert!(
            evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })),
            "the transcript must still stream stdout lines, got {evs:?}"
        );
        assert!(
            evs.iter().any(|e| matches!(
                e,
                RunEvent::OutputTruncated {
                    stream: OutputStream::Stdout
                }
            )),
            "the per-line cap must still raise the typed notice, got {evs:?}"
        );
        assert!(matches!(
            evs.last(),
            Some(RunEvent::Exit { exit_code: 0, .. })
        ));
    });
}

#[test]
#[serial]
fn tools_ls_remote_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("ls-remote---json-go-command-failed", || {
        let err = mise_ls_remote(&script, None, "go").expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(err.stderr.contains("ERROR"));
    });
}

#[test]
fn tools_ls_remote_rejects_empty_tool() {
    // The Rust boundary rejects an empty tool before invoking mise so
    // the runner never sees a half-formed argv.
    let script = fixture_script();
    let err =
        mise_ls_remote(&script, None, "").expect_err("empty tool should yield Err before spawning");
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
    assert!(
        v.get("value").is_some(),
        "must have `value` payload, got {v:?}"
    );
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
