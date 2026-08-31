// Integration tests for the tasks surface (issue #27).
//
//   * `tasks_ls`           → `mise tasks ls --json`
//   * `tasks_edit_path`    → `mise tasks edit --path <name>`
//   * `mise_tasks_add_argv` (pure helper)  → argv shape for
//                              `mise tasks add <name> [--…]… -- <run>…`
//   * `mise_run_task_argv` (pure helper)   → argv for `mise run <name>`
//
// The fixture-mise script serves recorded stdout / stderr / exit
// code per argv joined by `-`. These tests assert the boundary
// contract: the raw JSON array is shipped as `value` on success, the
// structured AppError is shipped as `err` on failure, and the
// `tasks_edit_path` path is shipped as `path` (or `None` when mise
// printed an empty line). The typed `MiseTask` shape in `mise.rs`
// is documentation for the TS side; the parser there is tolerant
// and is not asserted here.

use std::path::PathBuf;

use misedeck_lib::mise::{
    code, mise_run_task_argv, mise_tasks_add_argv, mise_tasks_edit_path, mise_tasks_ls,
    run_mise, RunEvent, RunRequest,
};
use misedeck_lib::JsonResult;
use misedeck_lib::TasksEditPathResult;
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

// ---------- Argv builders (pure) ----------

#[test]
fn mise_run_task_argv_builds_run_command() {
    // `mise run <name>` is the documented "run a task" surface.
    // The argv must be the two tokens exactly — anything else would
    // be a runner bug because the shell-metacharacter check operates
    // on individual tokens.
    let argv = mise_run_task_argv("build");
    assert_eq!(argv, vec!["run".to_string(), "build".to_string()]);
}

#[test]
fn mise_tasks_add_argv_minimal_name_only() {
    // No description, no depends, no run. Used when the user only
    // wants to register a placeholder task (or to delete the run
    // by omission — see the warning in the helper's docs).
    let argv = mise_tasks_add_argv("build", None, &[], None);
    assert_eq!(
        argv,
        vec!["tasks".to_string(), "add".to_string(), "build".to_string()]
    );
}

#[test]
fn mise_tasks_add_argv_with_run_only() {
    // The common create path: name + run command. The `--` separator
    // is required by mise so the run command survives flag parsing.
    let run: Vec<String> = vec!["echo".to_string(), "hi".to_string()];
    let argv = mise_tasks_add_argv("build", None, &[], Some(&run));
    assert_eq!(
        argv,
        vec![
            "tasks".to_string(),
            "add".to_string(),
            "build".to_string(),
            "--".to_string(),
            "echo".to_string(),
            "hi".to_string(),
        ]
    );
}

#[test]
fn mise_tasks_add_argv_with_description_and_depends() {
    let depends = vec!["lint".to_string(), "test".to_string()];
    let run: Vec<String> = vec!["npm".to_string(), "run".to_string(), "build".to_string()];
    let argv = mise_tasks_add_argv("build", Some("Build the project"), &depends, Some(&run));
    assert_eq!(
        argv,
        vec![
            "tasks".to_string(),
            "add".to_string(),
            "--description".to_string(),
            "Build the project".to_string(),
            "--depends".to_string(),
            "lint".to_string(),
            "--depends".to_string(),
            "test".to_string(),
            "build".to_string(),
            "--".to_string(),
            "npm".to_string(),
            "run".to_string(),
            "build".to_string(),
        ]
    );
}

#[test]
fn mise_tasks_add_argv_skips_empty_depends() {
    // An empty entry in the depends list (e.g. from a trailing
    // comma in user input) must NOT produce a `--depends ""` pair,
    // which mise would reject as a missing argument.
    let depends = vec!["lint".to_string(), "".to_string()];
    let argv = mise_tasks_add_argv("build", None, &depends, None);
    let has_empty = argv
        .windows(2)
        .any(|w| w[0] == "--depends" && w[1].is_empty());
    assert!(
        !has_empty,
        "argv should not include an empty `--depends` pair, got {argv:?}"
    );
    // The non-empty dep survives.
    assert!(argv.contains(&"lint".to_string()));
}

#[test]
fn mise_tasks_add_argv_skips_empty_description() {
    // A blank description is equivalent to "no description" — the
    // helper must omit the `--description ""` pair so mise does not
    // write an empty string to the TOML.
    let argv = mise_tasks_add_argv("build", Some(""), &[], None);
    assert!(
        !argv.contains(&"--description".to_string()),
        "argv should not include an empty `--description` flag, got {argv:?}"
    );
}

// ---------- tasks_ls (mise tasks ls --json) ----------

#[test]
#[serial]
fn tasks_ls_returns_array_with_three_tasks() {
    let script = fixture_script();
    with_slug("tasks---ls---json", || {
        let v = mise_tasks_ls(&script, Some(std::path::Path::new("/Users/example/project")))
            .expect("tasks ls --json should yield Ok");
        let arr = v.as_array().expect("tasks ls payload must be a JSON array");
        assert_eq!(arr.len(), 3, "expected 3 tasks, got {v:?}");
        let names: Vec<String> = arr
            .iter()
            .map(|t| t["name"].as_str().unwrap_or("").to_string())
            .collect();
        assert!(names.contains(&"build".to_string()));
        assert!(names.contains(&"lint".to_string()));
        assert!(names.contains(&"test".to_string()));
    });
}

#[test]
#[serial]
fn tasks_ls_command_failed_keeps_stderr() {
    let script = fixture_script();
    with_slug("tasks---ls---json-command-failed", || {
        let err = mise_tasks_ls(&script, Some(std::path::Path::new("/tmp/no-config")))
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
#[serial]
fn tasks_ls_garbage_stdout_returns_parse_failed() {
    let script = fixture_script();
    with_slug("tasks---ls---json-parse-failed", || {
        let err = mise_tasks_ls(&script, Some(std::path::Path::new("/tmp/somewhere")))
            .expect_err("non-JSON stdout should yield Err");
        assert_eq!(err.code, code::PARSE_FAILED);
    });
}

#[test]
fn tasks_ls_returns_not_found_when_mise_missing() {
    let bogus = PathBuf::from("/this/path/does/not/exist/mise-xyz");
    let err = mise_tasks_ls(&bogus, Some(std::path::Path::new("/tmp")))
        .expect_err("missing binary should yield Err");
    assert_eq!(err.code, code::MISE_NOT_FOUND);
}

// ---------- tasks_edit_path (mise tasks edit --path <name>) ----------

#[test]
#[serial]
fn tasks_edit_path_returns_file_path() {
    let script = fixture_script();
    with_slug("tasks---edit---path---test", || {
        let path = mise_tasks_edit_path(
            &script,
            Some(std::path::Path::new("/Users/example/project")),
            "test",
        )
        .expect("tasks edit --path should yield Ok")
        .expect("mise printed a path");
        assert!(
            path.contains("mise.toml"),
            "path should point at the mise.toml, got {path:?}"
        );
    });
}

#[test]
fn tasks_edit_path_rejects_empty_name() {
    let script = fixture_script();
    let err = mise_tasks_edit_path(&script, Some(std::path::Path::new("/tmp")), "")
        .expect_err("empty name should yield Err before spawning");
    assert_eq!(err.code, code::COMMAND_FAILED);
}

// ---------- Streaming surface (fixture-backed) ----------
//
// The argv builders exist so the JS side can dispatch the right
// command. The runner's streaming surface is the same as every
// other mise command — `run_mise` accepts the argv verbatim and
// ships stdout/stderr to the panel. This test confirms the
// fixture-mise harness covers the `mise run <name>` argv shape so
// a future regression in the runner would surface here.

#[test]
#[serial]
fn run_mise_with_run_task_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("run---build", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_run_task_argv("build"));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("run fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

// ---------- Tauri command IPC contracts ----------

#[test]
fn tasks_ls_json_result_serializes_with_kind_tag() {
    // The Tauri command returns a `JsonResult` enum with a `kind`
    // discriminator. Verify the on-the-wire shape so the TS side can
    // pattern-match on it the same way it does for the tools
    // commands.
    let ok = JsonResult::Ok {
        value: serde_json::json!([]),
    };
    let v = serde_json::to_value(&ok).unwrap();
    assert_eq!(v["kind"], "ok");
    assert!(v.get("value").is_some(), "must have `value` payload, got {v:?}");

    let err = JsonResult::Err {
        err: misedeck_lib::mise::AppError::not_found(),
    };
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["kind"], "err");
    assert_eq!(v["err"]["code"], "MISE_NOT_FOUND");
}

#[test]
fn tasks_edit_path_result_serializes_with_kind_tag() {
    // The Tauri command returns a `TasksEditPathResult` with a
    // `kind` discriminator. The success variant carries `path`
    // (Option<String>); the error variant carries `err`. The
    // Option shape lets the JS side distinguish "mise printed an
    // empty path" from "the command failed", which is the same
    // distinction Rust's `Option<String>` makes.
    let ok_some = TasksEditPathResult::Ok {
        path: Some("/tmp/mise.toml".to_string()),
    };
    let v = serde_json::to_value(&ok_some).unwrap();
    assert_eq!(v["kind"], "ok");
    assert_eq!(v["path"], "/tmp/mise.toml");

    let ok_none = TasksEditPathResult::Ok { path: None };
    let v = serde_json::to_value(&ok_none).unwrap();
    assert_eq!(v["kind"], "ok");
    assert!(
        v["path"].is_null(),
        "missing path should serialize as null, got {v:?}"
    );

    let err = TasksEditPathResult::Err {
        err: misedeck_lib::mise::AppError::command_failed("boom", "stderr"),
    };
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["kind"], "err");
    assert_eq!(v["err"]["code"], "COMMAND_FAILED");
}
