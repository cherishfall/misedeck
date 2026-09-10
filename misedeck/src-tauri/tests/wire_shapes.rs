// Wire-shape contract tests (issue #129).
//
// Every `*Result` enum crossing the Tauri IPC boundary is a
// `{kind: "ok" | "err", …}` discriminated union whose shape the TS
// side pattern-matches on. These tests assert the exact JSON of each
// variant so a Rust-side serialization change (a `#[serde(flatten)]`,
// a rename, a moved field) fails here instead of silently drifting
// from the frontend contract — see "Wire-shape drift guard" in
// docs/agents/architecture.md.

use std::path::PathBuf;

use misedeck_lib::install::InstallOutcome;
use misedeck_lib::mise::{
    AppError, ConfigFile, DetectMiseOk, RunOutcome, TrustSource, TrustStatus,
};
use misedeck_lib::shell::{ActivationStatus, ShellKind, TerminalOpenOutcome};
use misedeck_lib::{
    ConfigFilesResult, DetectMiseResult, InstallCommandResult, JsonResult, RunCommandResult,
    ShellActivationResult, TasksEditPathResult, TerminalOpenResult, TrustResult,
};
use serde_json::json;

fn sample_outcome() -> InstallOutcome {
    InstallOutcome {
        stdout: "line".to_string(),
        stderr: "warn".to_string(),
        exit_code: 0,
        duration_ms: 42,
        timed_out: false,
    }
}

fn outcome_json() -> serde_json::Value {
    json!({
        "stdout": "line",
        "stderr": "warn",
        "exitCode": 0,
        "durationMs": 42,
        "timedOut": false,
    })
}

fn sample_app_error() -> AppError {
    AppError::new("COMMAND_FAILED", "errors.unknown", "boom")
}

fn err_json() -> serde_json::Value {
    json!({
        "kind": "err",
        "err": { "code": "COMMAND_FAILED", "message": "errors.unknown", "stderr": "boom" },
    })
}

// ---------- run_mise_command / mise_trust ----------

#[test]
fn run_command_result_ok_nests_outcome() {
    let v = serde_json::to_value(RunCommandResult::Ok {
        outcome: RunOutcome {
            stdout: "line".to_string(),
            stderr: "warn".to_string(),
            exit_code: 0,
            duration_ms: 42,
            timed_out: false,
        },
    })
    .unwrap();
    assert_eq!(v, json!({ "kind": "ok", "outcome": outcome_json() }));
}

#[test]
fn run_command_result_err() {
    let v = serde_json::to_value(RunCommandResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

// ---------- install_mise / mise_self_update ----------

#[test]
fn install_command_result_ok_nests_outcome() {
    // The regression from issue #129: `outcome` must be a nested key,
    // never flattened to the top level — the TS validator requires it.
    let v = serde_json::to_value(InstallCommandResult::Ok {
        outcome: sample_outcome(),
        new_version: Some("2026.8.14 macos-arm64 (2026-08-26)".to_string()),
    })
    .unwrap();
    assert_eq!(
        v,
        json!({
            "kind": "ok",
            "outcome": outcome_json(),
            "newVersion": "2026.8.14 macos-arm64 (2026-08-26)",
        })
    );
    // No flattened leakage at the top level.
    assert!(v.get("exitCode").is_none(), "outcome must not flatten: {v:?}");
}

#[test]
fn install_command_result_ok_omits_absent_new_version() {
    let v = serde_json::to_value(InstallCommandResult::Ok {
        outcome: sample_outcome(),
        new_version: None,
    })
    .unwrap();
    assert_eq!(v, json!({ "kind": "ok", "outcome": outcome_json() }));
}

#[test]
fn install_command_result_err() {
    let v = serde_json::to_value(InstallCommandResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

// ---------- detect_mise ----------

#[test]
fn detect_mise_result_ok() {
    let v = serde_json::to_value(DetectMiseResult::Ok {
        ok: DetectMiseOk {
            version: "2026.8.14 macos-arm64 (2026-08-26)".to_string(),
            version_date: "2026.8.14".to_string(),
            binary_path: PathBuf::from("/usr/local/bin/mise"),
            raw: json!({}),
        },
    })
    .unwrap();
    assert_eq!(
        v,
        json!({
            "kind": "ok",
            "ok": {
                "version": "2026.8.14 macos-arm64 (2026-08-26)",
                "versionDate": "2026.8.14",
                "binaryPath": "/usr/local/bin/mise",
                "raw": {},
            },
        })
    );
}

#[test]
fn detect_mise_result_err() {
    let v = serde_json::to_value(DetectMiseResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

// ---------- read-only query commands ----------

#[test]
fn json_result_ok() {
    let v = serde_json::to_value(JsonResult::Ok {
        value: json!({ "node": ["20.0.0"] }),
    })
    .unwrap();
    assert_eq!(v, json!({ "kind": "ok", "value": { "node": ["20.0.0"] } }));
}

#[test]
fn json_result_err() {
    let v = serde_json::to_value(JsonResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

#[test]
fn trust_result_ok() {
    let v = serde_json::to_value(TrustResult::Ok {
        ok: TrustStatus {
            source: TrustSource::ConfigTrusted,
            path: "/tmp/example".to_string(),
        },
    })
    .unwrap();
    assert_eq!(
        v,
        json!({
            "kind": "ok",
            "ok": { "source": "configTrusted", "path": "/tmp/example" },
        })
    );
}

#[test]
fn trust_result_err() {
    let v = serde_json::to_value(TrustResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

#[test]
fn tasks_edit_path_result_variants() {
    let ok_some = serde_json::to_value(TasksEditPathResult::Ok {
        path: Some("/tmp/mise.toml".to_string()),
    })
    .unwrap();
    assert_eq!(ok_some, json!({ "kind": "ok", "path": "/tmp/mise.toml" }));
    let ok_none = serde_json::to_value(TasksEditPathResult::Ok { path: None }).unwrap();
    assert_eq!(ok_none, json!({ "kind": "ok", "path": null }));
    let err = serde_json::to_value(TasksEditPathResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(err, err_json());
}

#[test]
fn config_files_result_ok() {
    let v = serde_json::to_value(ConfigFilesResult::Ok {
        files: vec![ConfigFile {
            path: "/tmp/mise.toml".to_string(),
            tools: vec!["node".to_string()],
            content: Some("[tools]".to_string()),
        }],
    })
    .unwrap();
    assert_eq!(
        v,
        json!({
            "kind": "ok",
            "files": [{ "path": "/tmp/mise.toml", "tools": ["node"], "content": "[tools]" }],
        })
    );
}

#[test]
fn config_files_result_err() {
    let v = serde_json::to_value(ConfigFilesResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

#[test]
fn shell_activation_result_ok() {
    let v = serde_json::to_value(ShellActivationResult::Ok {
        ok: ActivationStatus {
            shell: ShellKind::Zsh,
            rc_path: "/home/u/.zshrc".to_string(),
            rc_contents: "eval \"$(mise activate zsh)\"".to_string(),
            activated: true,
        },
    })
    .unwrap();
    assert_eq!(
        v,
        json!({
            "kind": "ok",
            "ok": {
                "shell": { "kind": "zsh" },
                "rcPath": "/home/u/.zshrc",
                "rcContents": "eval \"$(mise activate zsh)\"",
                "activated": true,
            },
        })
    );
}

#[test]
fn shell_activation_result_err() {
    let v = serde_json::to_value(ShellActivationResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}

#[test]
fn terminal_open_result_ok() {
    let v = serde_json::to_value(TerminalOpenResult::Ok {
        ok: TerminalOpenOutcome {
            platform: "macos".to_string(),
            terminal_app: "Terminal.app".to_string(),
            path: "/tmp/example".to_string(),
            argv: vec!["open".to_string(), "-a".to_string(), "Terminal".to_string()],
        },
    })
    .unwrap();
    assert_eq!(
        v,
        json!({
            "kind": "ok",
            "ok": {
                "platform": "macos",
                "terminalApp": "Terminal.app",
                "path": "/tmp/example",
                "argv": ["open", "-a", "Terminal"],
            },
        })
    );
}

#[test]
fn terminal_open_result_err() {
    let v = serde_json::to_value(TerminalOpenResult::Err {
        err: sample_app_error(),
    })
    .unwrap();
    assert_eq!(v, err_json());
}
