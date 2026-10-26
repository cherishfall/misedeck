// Integration tests for the settings, doctor, registry, and plugins
// surface (issues #29 + #51).
//
//   * settings ls      → `mise settings ls --json-extended` (the dedicated
//                        `settings_ls` Tauri command was removed in #162;
//                        the page now dispatches this read through the
//                        execution-panel runner — the runner function
//                        stays as the pinned argv contract)
//   * `doctor`         → `mise doctor --json` (with raw-text fallback)
//   * `registry`     → `mise registry --json` (with table fallback)
//   * `plugins_ls`   → `mise plugins ls --urls` (table parsing; no
//                      `--json` exists for this command)
//
// The fixture-mise script serves recorded stdout/stderr/exit_code per
// argv joined by `-`. These tests assert the boundary contract: the
// raw JSON (or structured fallback) is shipped as `value` on success
// and the structured `AppError` is shipped as `err` on failure.

use std::path::PathBuf;

use misedeck_lib::mise::{
    code, mise_doctor, mise_plugins_ls, mise_registry, mise_settings_ls, mise_settings_set_argv,
    mise_settings_unset_argv,
};
use serial_test::serial;
mod common;

fn fixture_script() -> PathBuf {
    common::fixture_script()
}

/// Set `FIXTURE_MISE_SLUG` for the duration of the closure so the
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

// ---------- Argv builders (pure) ----------

#[test]
fn mise_settings_set_argv_builds_global_command() {
    let argv = mise_settings_set_argv("jobs", "4", false);
    assert_eq!(
        argv,
        vec![
            "settings".to_string(),
            "set".to_string(),
            "jobs".to_string(),
            "4".to_string(),
        ]
    );
}

#[test]
fn mise_settings_set_argv_builds_local_command() {
    let argv = mise_settings_set_argv("jobs", "4", true);
    assert_eq!(
        argv,
        vec![
            "settings".to_string(),
            "set".to_string(),
            "--local".to_string(),
            "jobs".to_string(),
            "4".to_string(),
        ]
    );
}

#[test]
fn mise_settings_unset_argv_builds_command() {
    let argv = mise_settings_unset_argv("always_keep_download", false);
    assert_eq!(
        argv,
        vec![
            "settings".to_string(),
            "unset".to_string(),
            "always_keep_download".to_string(),
        ]
    );
}

// ---------- settings ls ----------

#[test]
#[serial]
fn settings_ls_returns_extended_json() {
    let script = fixture_script();
    with_slug("settings---ls---json-extended", || {
        let v = mise_settings_ls(&script, None, false).expect("settings ls should yield Ok");
        let obj = v.as_object().expect("settings payload must be an object");
        assert!(obj.contains_key("always_keep_download"));
        assert!(obj.contains_key("jobs"));
        let jobs = &obj["jobs"];
        assert_eq!(jobs["value"], 4);
        assert!(jobs["source"].as_str().unwrap().contains("mise.toml"));
    });
}

#[test]
#[serial]
fn settings_ls_all_lists_unset_keys_with_defaults() {
    let script = fixture_script();
    with_slug("settings---ls---json-extended---all", || {
        // The fixture slug proves `--all` reached the CLI; the payload
        // includes an unset key (no `source`) carrying its default.
        let v = mise_settings_ls(&script, None, true).expect("settings ls --all should yield Ok");
        let obj = v
            .as_object()
            .expect("settings --all payload must be an object");
        let legacy = &obj["legacy_version_file"];
        assert_eq!(legacy["value"], true);
        assert!(legacy.get("source").is_none());
    });
}

#[test]
#[serial]
fn settings_ls_adds_local_flag_for_project_context() {
    let script = fixture_script();
    with_slug("settings---ls---json-extended", || {
        // The fixture is the same; the test only verifies the call
        // completes when a cwd is supplied (the runner prepends `-C`).
        let v = mise_settings_ls(
            &script,
            Some(std::path::Path::new("/Users/example/project")),
            false,
        )
        .expect("project settings ls should yield Ok");
        assert!(v.as_object().unwrap().contains_key("jobs"));
    });
}

#[test]
#[serial]
fn settings_ls_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("settings---ls---json-extended-command-failed", || {
        let err =
            mise_settings_ls(&script, None, false).expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(err.stderr.contains("ERROR"));
    });
}

#[test]
#[serial]
fn settings_ls_garbage_stdout_returns_parse_failed() {
    let script = fixture_script();
    with_slug("settings---ls---json-extended-parse-failed", || {
        let err = mise_settings_ls(&script, None, false).expect_err("non-JSON should yield Err");
        assert_eq!(err.code, code::PARSE_FAILED);
    });
}

// ---------- doctor ----------

#[test]
#[serial]
fn doctor_returns_json_payload() {
    let script = fixture_script();
    with_slug("doctor---json", || {
        let v = mise_doctor(&script, None).expect("doctor --json should yield Ok");
        assert_eq!(v["version"], "2026.8.14 macos-arm64 (2026-08-26)");
        assert_eq!(v["activated"], true);
        let toolset = v["toolset"].as_object().expect("toolset object");
        assert!(toolset.contains_key("node"));
    });
}

#[test]
#[serial]
fn doctor_parses_a_nonzero_exit_as_the_structured_report() {
    // Issue #259: mise's doctor calls `exit(1)` as soon as it collected
    // errors, but still prints the complete JSON report. The old
    // exit-code-first read threw that payload away, fell back to raw
    // text, and ran `mise doctor` a second time — on exactly the broken
    // install the page exists for. Parse first, and prove one call.
    let script = fixture_script();
    let log =
        std::env::temp_dir().join(format!("misedeck-doctor-calls-{}.log", std::process::id()));
    let _ = std::fs::remove_file(&log);
    unsafe {
        std::env::set_var("FIXTURE_MISE_SLUG", "doctor---json-errors");
        std::env::set_var("FIXTURE_MISE_CALL_LOG", &log);
    }
    let result = mise_doctor(&script, None);
    unsafe {
        std::env::remove_var("FIXTURE_MISE_SLUG");
        std::env::remove_var("FIXTURE_MISE_CALL_LOG");
    }
    let calls = std::fs::read_to_string(&log).unwrap_or_default();
    let _ = std::fs::remove_file(&log);

    let v = result.expect("exit 1 with a JSON report is still Ok");
    assert_eq!(
        v["errors"].as_array().map(|a| a.len()),
        Some(1),
        "errors must survive parsing: {v:?}"
    );
    assert!(
        v["errors"][0].as_str().unwrap().contains("not trusted"),
        "error text must be verbatim: {v:?}"
    );
    assert_eq!(v["warnings"].as_array().map(|a| a.len()), Some(1));
    assert_eq!(
        calls.lines().count(),
        1,
        "doctor must not run twice, calls: {calls:?}"
    );
}

#[test]
#[serial]
fn doctor_falls_back_to_raw_text_lines() {
    let script = fixture_script();
    with_slug("doctor---json-parse-failed", || {
        let v = mise_doctor(&script, None).expect("doctor fallback should yield Ok");
        let lines = v["rawLines"].as_array().expect("rawLines array");
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0]["status"], "ok");
        assert_eq!(lines[2]["status"], "warn");
        assert!(lines[0]["text"].as_str().unwrap().contains("[OK]"));
    });
}

#[test]
#[serial]
fn doctor_fallback_with_no_output_fails_instead_of_faking_health() {
    // Issue #233: `doctor-fail` is exit 1 with stderr only and no stdout.
    // Swallowing that into `Ok({rawLines: []})` let the page fall through
    // its `rawLines.length > 0` guard into the structured view, where
    // `warnings ?? []` is empty and the status renders "OK" — a healthy
    // conclusion from no data. A zero-line report on a non-zero exit is
    // a broken mise, not a passing check.
    //
    // Issue #254: the empty output must not trigger a second text-only
    // `mise doctor`. Prove the one `--json` call is the only call.
    let script = fixture_script();
    let log = std::env::temp_dir().join(format!(
        "misedeck-doctor-fail-calls-{}.log",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&log);
    unsafe {
        std::env::set_var("FIXTURE_MISE_SLUG", "doctor-fail");
        std::env::set_var("FIXTURE_MISE_CALL_LOG", &log);
    }
    let result = mise_doctor(&script, None);
    unsafe {
        std::env::remove_var("FIXTURE_MISE_SLUG");
        std::env::remove_var("FIXTURE_MISE_CALL_LOG");
    }
    let calls = std::fs::read_to_string(&log).unwrap_or_default();
    let _ = std::fs::remove_file(&log);

    let err = result.expect_err("no output must fail");
    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(err.stderr.contains("ERROR"), "stderr = {:?}", err.stderr);
    assert_eq!(
        calls.lines().count(),
        1,
        "doctor must not rerun without --json, calls: {calls:?}"
    );
    assert!(
        calls.contains("--json"),
        "the single call must be the --json attempt, calls: {calls:?}"
    );
}

#[test]
#[serial]
fn doctor_fallback_keeps_output_lines_on_a_nonzero_exit() {
    // The other half of the #233 guard: a non-zero exit that still
    // produced report lines stays Ok — those lines are the diagnostic
    // output the fallback exists for. Pins the `lines.is_empty()`
    // condition so a future flat "non-zero → Err" reading of the
    // conventions cannot silently drop failing-check reports.
    let script = fixture_script();
    with_slug("doctor-fail-with-lines", || {
        let v = mise_doctor(&script, None).expect("lines on a non-zero exit stay Ok");
        let lines = v["rawLines"].as_array().expect("rawLines array");
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[2]["status"], "error");
        assert!(lines[2]["text"].as_str().unwrap().contains("plugin failed"));
    });
}

// ---------- registry ----------

#[test]
#[serial]
fn registry_returns_json_array() {
    let script = fixture_script();
    with_slug("registry---json", || {
        let v = mise_registry(&script, None).expect("registry --json should yield Ok");
        let arr = v.as_array().expect("registry payload must be an array");
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["short"], "node");
        assert!(arr[0]["backends"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("core:node")));
    });
}

#[test]
#[serial]
fn registry_falls_back_to_table_parsing() {
    let script = fixture_script();
    with_slug("registry---json-parse-failed", || {
        let v = mise_registry(&script, None).expect("registry fallback should yield Ok");
        let arr = v.as_array().expect("fallback payload must be an array");
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["short"], "node");
        let backends = arr[0]["backends"].as_array().unwrap();
        assert!(backends.contains(&serde_json::json!("core:node")));
    });
}

/// Issue #289: a genuine failure is the answer, not a reason to retry.
/// The old condition retried every `COMMAND_FAILED` on the plain-text
/// path, adding a second 120 s read ceiling and potentially replacing
/// the original stderr with the fallback's own. Exit 1 here is a broken
/// config, the shape the audit named.
///
/// The exit-2 (unknown `--json`) half of the condition is covered by the
/// pure `registry_fallback_applies` unit test in `mise.rs`: the fixture
/// can serve only one payload per slug, so it cannot make the `--json`
/// call exit 2 and the fallback call exit 0 in the same run.
#[test]
#[serial]
fn registry_does_not_retry_a_real_failure() {
    let script = fixture_script();
    let log = std::env::temp_dir().join(format!(
        "misedeck-registry-calls-{}.log",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&log);
    unsafe {
        std::env::set_var("FIXTURE_MISE_SLUG", "registry---json-command-failed");
        std::env::set_var("FIXTURE_MISE_CALL_LOG", &log);
    }
    let result = mise_registry(&script, None);
    unsafe {
        std::env::remove_var("FIXTURE_MISE_SLUG");
        std::env::remove_var("FIXTURE_MISE_CALL_LOG");
    }
    let calls = std::fs::read_to_string(&log).unwrap_or_default();
    let _ = std::fs::remove_file(&log);

    let err = result.expect_err("a broken config must surface, not fall back");
    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.stderr.contains("failed to read mise config"),
        "the original stderr must survive, got {:?}",
        err.stderr
    );
    assert!(
        err.message.contains("status 1"),
        "the original exit must survive, got {:?}",
        err.message
    );
    assert_eq!(
        calls.lines().count(),
        1,
        "the table fallback must not run, calls: {calls:?}"
    );
    assert!(
        calls.contains("--json"),
        "the one call must be the --json attempt, calls: {calls:?}"
    );
}

// ---------- plugins ls (issue #51) ----------

#[test]
#[serial]
fn plugins_ls_parses_all_four_columns() {
    // Fixture is verbatim `mise plugins ls --urls` output from mise
    // 2026.10.15 (no header: mise suppresses it when stdout is not a
    // tty). Four columns are `Plugin Url Ref Sha`; a plugin with no
    // remote prints its name alone, so the URL must stay empty rather
    // than absorb a following column (issue #259).
    let script = fixture_script();
    with_slug("plugins---ls---urls", || {
        let v = mise_plugins_ls(&script, None).expect("plugins ls should yield Ok");
        let arr = v.as_array().expect("plugins payload must be an array");
        assert_eq!(arr.len(), 3);

        // No URL: every other column stays empty — the UI renders `—`
        // instead of inventing a source.
        assert_eq!(arr[0]["name"], "asdf-demo");
        assert_eq!(arr[0]["url"], "");
        assert_eq!(arr[0]["ref"], "");
        assert_eq!(arr[0]["sha"], "");

        assert_eq!(arr[1]["name"], "direnv");
        assert_eq!(
            arr[1]["url"],
            "https://github.com/asdf-community/asdf-direnv.git"
        );
        assert_eq!(arr[1]["ref"], "HEAD");
        assert_eq!(arr[1]["sha"], "0c76b16");

        assert_eq!(arr[2]["name"], "zig-plugin");
        assert_eq!(arr[2]["url"], "file:///private/tmp/mise-probe/plug-a");
        assert_eq!(arr[2]["ref"], "HEAD");
        assert_eq!(arr[2]["sha"], "a1b44bf");
    });
}

#[test]
#[serial]
fn plugins_ls_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("plugins---ls---urls-command-failed", || {
        let err = mise_plugins_ls(&script, None).expect_err("non-zero exit should yield Err");
        assert_eq!(err.code, code::COMMAND_FAILED);
        assert!(err.stderr.contains("plugin manager exploded"));
    });
}
