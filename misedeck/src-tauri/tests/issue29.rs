// Integration tests for the settings, doctor, registry, and plugins
// surface (issues #29 + #51).
//
//   * `settings_ls`  → `mise settings ls --json-extended`
//   * `doctor`       → `mise doctor --json` (with raw-text fallback)
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

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mise/fixture-mise")
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

// ---------- settings_ls ----------

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
        let obj = v.as_object().expect("settings --all payload must be an object");
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
        let v = mise_settings_ls(&script, Some(std::path::Path::new("/Users/example/project")), false)
            .expect("project settings ls should yield Ok");
        assert!(v.as_object().unwrap().contains_key("jobs"));
    });
}

#[test]
#[serial]
fn settings_ls_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("settings---ls---json-extended-command-failed", || {
        let err = mise_settings_ls(&script, None, false).expect_err("non-zero exit should yield Err");
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
        assert!(arr[0]["backends"].as_array().unwrap().contains(&serde_json::json!("core:node")));
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

// ---------- plugins ls (issue #51) ----------

#[test]
#[serial]
fn plugins_ls_parses_table_into_name_and_source() {
    let script = fixture_script();
    with_slug("plugins---ls---urls", || {
        let v = mise_plugins_ls(&script, None).expect("plugins ls should yield Ok");
        let arr = v.as_array().expect("plugins payload must be an array");
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0]["name"], "1password");
        assert_eq!(
            arr[0]["source"],
            "https://github.com/mise-plugins/1password.git"
        );
        // Original case is preserved verbatim (ui-ux-rules: data honesty).
        assert_eq!(arr[2]["name"], "vfox-Zig");
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
