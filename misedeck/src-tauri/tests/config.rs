// Integration tests for the config-editor argv builders (issue #26).
//
// The config editor routes all writes through the existing
// `run_mise_command` Tauri command — no new IPC surface is needed.
// What is new is a small set of pure helpers on the Rust side:
//
//   * `mise_use_argv(tool, version)`   — argv for `mise use <tool>@<version>`
//   * `mise_use_remove_argv(tool)`     — argv for `mise use --remove <tool>`
//   * `mise_env_set_argv(key, value)`  — argv for `mise set <KEY>=<VALUE>`
//   * `mise_env_unset_argv(key)`       — argv for `mise unset <KEY>`
//
// These helpers exist so the JS side has a typed builder for the
// write commands. The argv shape is documented here and asserted
// against the recorded `mise use --help` / `mise set --help` /
// `mise unset --help` output:
//
//   `mise use <tool>@<version>`     → ["use", "<tool>@<version>"]
//   `mise use --remove <tool>`      → ["use", "--remove", "<tool>"]
//   `mise set <KEY>=<VALUE>`        → ["set", "<KEY>=<VALUE>"]
//   `mise unset <KEY>`              → ["unset", "<KEY>"]
//
// The fixture-mise script serves the same recorded stdout/stderr
// for every argv, so the streaming-surface tests are the same
// shape as the existing tools/trust suites — they just use new
// fixture slugs for the new argv shapes.

use std::path::PathBuf;

use misedeck_lib::mise::{
    mise_env_set_argv, mise_env_unset_argv, mise_use_argv, mise_use_remove_argv, run_mise,
    RunEvent, RunRequest,
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

// ---------- Argv builders (pure) ----------

#[test]
fn mise_use_argv_builds_add_command() {
    let argv = mise_use_argv("node", "22.11.0");
    assert_eq!(argv, vec!["use".to_string(), "node@22.11.0".to_string()]);
}

#[test]
fn mise_use_argv_preserves_short_tool_aliases() {
    // mise accepts short forms like `cargo:ripgrep@14` (the
    // `backend:tool` syntax). The helper must NOT rewrite the
    // tool name; it's purely a string builder.
    let argv = mise_use_argv("cargo:ripgrep", "14");
    assert_eq!(
        argv,
        vec!["use".to_string(), "cargo:ripgrep@14".to_string()]
    );
}

#[test]
fn mise_use_remove_argv_builds_remove_command() {
    let argv = mise_use_remove_argv("node");
    assert_eq!(
        argv,
        vec!["use".to_string(), "--remove".to_string(), "node".to_string()]
    );
}

#[test]
fn mise_env_set_argv_builds_set_command() {
    // The KEY=VALUE form is what mise's `set` subcommand documents.
    let argv = mise_env_set_argv("MY_VAR", "hello");
    assert_eq!(argv, vec!["set".to_string(), "MY_VAR=hello".to_string()]);
}

#[test]
fn mise_env_set_argv_preserves_dotted_key() {
    // mise's `set` accepts the bare name; the `[env]` table is
    // implicit. The helper must NOT prefix the key with `env.`.
    let argv = mise_env_set_argv("MY_VAR", "hello");
    let key_val = argv[1].clone();
    assert!(
        !key_val.starts_with("env."),
        "set argv should not prefix `env.`, got {key_val:?}"
    );
}

#[test]
fn mise_env_unset_argv_builds_unset_command() {
    let argv = mise_env_unset_argv("MY_VAR");
    assert_eq!(argv, vec!["unset".to_string(), "MY_VAR".to_string()]);
}

// ---------- Streaming surface (fixture-backed) ----------
//
// The argv builders exist so the JS side can dispatch the right
// command. The runner's streaming surface is the same as every other
// mise command — the existing `run_mise` accepts the argv verbatim
// and ships stdout/stderr to the panel. These tests confirm the
// fixture-mise harness covers the new argv shapes too, so a future
// `mise use` regression in the runner would surface here.

#[test]
#[serial]
fn run_mise_with_use_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("use---node@22.11.0", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_use_argv("node", "22.11.0"));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("use fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

#[test]
#[serial]
fn run_mise_with_env_set_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("set---MY_VAR=hello", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_env_set_argv("MY_VAR", "hello"));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("env set fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

#[test]
#[serial]
fn run_mise_with_env_unset_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("unset---MY_VAR", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_env_unset_argv("MY_VAR"));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("env unset fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

// ---------- Config-file hierarchy (issue #42) ----------

#[test]
#[serial]
fn config_files_preserve_mise_precedence_order() {
    let script = fixture_script();
    with_slug("config-ls---json", || {
        let files = misedeck_lib::mise::mise_config_files(&script, None)
            .expect("config ls --json fixture should yield Ok");
        // mise emits the array highest-precedence-first; the runner
        // must preserve that order verbatim.
        assert_eq!(files.len(), 2, "files = {files:?}");
        assert_eq!(files[0].path, "/nonexistent/misedeck-test/src/app/mise.toml");
        assert_eq!(files[1].path, "/nonexistent/misedeck-test/.config/mise/config.toml");
        assert_eq!(files[0].tools, vec!["node".to_string(), "python".to_string()]);
        assert_eq!(files[1].tools, vec!["go".to_string()]);
        // The fixture paths do not exist on disk, so the content view
        // falls back to None rather than failing the whole section.
        assert_eq!(files[0].content, None);
        assert_eq!(files[1].content, None);
    });
}
