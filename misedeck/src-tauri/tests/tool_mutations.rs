// Integration tests for the global tool mutation argv builders (issue #22).
//
// The tools page routes all global mutations through the existing
// `run_mise_command` Tauri command — no new IPC surface is needed.
// What is new is a small set of pure helpers on the Rust side:
//
//   * `mise_install_argv(tool, version)`  → argv for `mise install <tool>@<version>`
//   * `mise_uninstall_argv(tool, version)` → argv for `mise uninstall <tool>@<version>`
//   * `mise_upgrade_argv(tool)`            → argv for `mise upgrade [<tool>]`
//
// These helpers exist so the JS side has a typed builder for the
// write commands. The argv shape is documented here and asserted
// against the recorded `mise install --help` / `mise uninstall --help`
// / `mise upgrade --help` output:
//
//   `mise install <tool>@<version>`      → ["install", "<tool>@<version>"]
//   `mise uninstall <tool>@<version>`     → ["uninstall", "<tool>@<version>"]
//   `mise upgrade --bump`                 → ["upgrade", "--bump"]
//   `mise upgrade --bump <tool>`          → ["upgrade", "--bump", "<tool>"]
//
// The fixture-mise script serves the same recorded stdout/stderr
// for every argv, so the streaming-surface tests are the same
// shape as the existing tools/trust suites — they just use new
// fixture slugs for the new argv shapes.

use std::path::PathBuf;

use misedeck_lib::mise::{
    mise_install_argv, mise_link_argv, mise_uninstall_argv, mise_upgrade_argv, run_mise, RunEvent,
    RunRequest,
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
fn mise_install_argv_builds_install_command() {
    let argv = mise_install_argv("node", "22.11.0");
    assert_eq!(
        argv,
        vec!["install".to_string(), "node@22.11.0".to_string()]
    );
}

#[test]
fn mise_install_argv_preserves_backend_prefix() {
    let argv = mise_install_argv("cargo:ripgrep", "14");
    assert_eq!(
        argv,
        vec!["install".to_string(), "cargo:ripgrep@14".to_string()]
    );
}

#[test]
fn mise_uninstall_argv_builds_uninstall_command() {
    let argv = mise_uninstall_argv("node", "22.11.0");
    assert_eq!(
        argv,
        vec!["uninstall".to_string(), "node@22.11.0".to_string()]
    );
}

#[test]
fn mise_link_argv_builds_link_command() {
    let argv = mise_link_argv("node", "22.11.0", "/usr/local/nvm/versions/node/v20.0.0");
    assert_eq!(
        argv,
        vec![
            "link".to_string(),
            "node@22.11.0".to_string(),
            "/usr/local/nvm/versions/node/v20.0.0".to_string(),
        ]
    );
}

#[test]
fn mise_link_argv_puts_tool_version_before_path() {
    // `mise link <TOOL@VERSION> <PATH>` — the tool@version comes first,
    // the local path second (issue #71). A reversed order would point
    // mise at the wrong argument and fail the link.
    let argv = mise_link_argv("cargo:ripgrep", "14", "/opt/ripgrep/14");
    assert_eq!(argv[0], "link");
    assert_eq!(argv[1], "cargo:ripgrep@14");
    assert_eq!(argv[2], "/opt/ripgrep/14");
}

#[test]
fn mise_link_argv_omits_force_flag() {
    // `--force` is deliberately NOT emitted: on a conflict the frontend
    // shows a hint instead of force-overwriting (issue #71).
    let argv = mise_link_argv("node", "22.11.0", "/opt/node/22");
    assert!(!argv.contains(&"--force".to_string()));
}

#[test]
fn mise_upgrade_argv_builds_upgrade_all_command() {
    let argv = mise_upgrade_argv(None);
    assert_eq!(
        argv,
        vec!["upgrade".to_string(), "--bump".to_string()]
    );
}

#[test]
fn mise_upgrade_argv_builds_upgrade_single_command() {
    let argv = mise_upgrade_argv(Some("go"));
    assert_eq!(
        argv,
        vec![
            "upgrade".to_string(),
            "--bump".to_string(),
            "go".to_string(),
        ]
    );
}

// ---------- Streaming surface (fixture-backed) ----------

#[test]
#[serial]
fn run_mise_with_install_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("install---node@22.11.0", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_install_argv("node", "22.11.0"));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("install fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

#[test]
#[serial]
fn run_mise_with_uninstall_argv_streams_to_exit() {
  let script = fixture_script();
  with_slug("uninstall---node@22.11.0", || {
    let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
      std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let events2 = std::sync::Arc::clone(&events);
    let req = RunRequest::new(mise_uninstall_argv("node", "22.11.0"));
    let outcome = run_mise(&script, &req, move |e| {
      events2.lock().unwrap().push(e);
    })
    .expect("uninstall fixture should yield Ok");
    assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
    let evs = events.lock().unwrap();
    assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
    assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
  });
}

#[test]
#[serial]
fn run_mise_with_link_argv_streams_to_exit() {
  let script = fixture_script();
  // The path is a fixture slug token (`localdir`); the fixture script
  // echoes recorded output regardless of whether the path exists — the
  // streaming surface is what this test exercises, not real linking.
  with_slug("link---node@22.11.0---localdir", || {
    let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
      std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let events2 = std::sync::Arc::clone(&events);
    let req = RunRequest::new(mise_link_argv("node", "22.11.0", "localdir"));
    let outcome = run_mise(&script, &req, move |e| {
      events2.lock().unwrap().push(e);
    })
    .expect("link fixture should yield Ok");
    assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
    let evs = events.lock().unwrap();
    assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
    assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
  });
}

#[test]
#[serial]
fn run_mise_with_upgrade_all_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("upgrade---bump", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_upgrade_argv(None));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("upgrade all fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}

#[test]
#[serial]
fn run_mise_with_upgrade_single_argv_streams_to_exit() {
    let script = fixture_script();
    with_slug("upgrade---bump---go", || {
        let events: std::sync::Arc<std::sync::Mutex<Vec<RunEvent>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events2 = std::sync::Arc::clone(&events);
        let req = RunRequest::new(mise_upgrade_argv(Some("go")));
        let outcome = run_mise(&script, &req, move |e| {
            events2.lock().unwrap().push(e);
        })
        .expect("upgrade single fixture should yield Ok");
        assert_eq!(outcome.exit_code, 0, "outcome = {outcome:?}");
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| matches!(e, RunEvent::Stdout { .. })));
        assert!(matches!(evs.last(), Some(RunEvent::Exit { exit_code: 0, .. })));
    });
}
