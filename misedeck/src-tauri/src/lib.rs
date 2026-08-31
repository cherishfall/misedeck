// Tauri command surface for MiseDeck.
//
// Layering (see docs/agents/architecture.md):
//   React UI (src/)  →  Tauri commands (this file)  →  mise runner (mise.rs)  →  mise CLI
//
// Commands are thin: validate input, resolve the mise binary, call the
// runner, shape the result. Everything reusable sits in `mise::`.

use std::path::PathBuf;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::Serialize;

pub mod mise;

use mise::{detect_mise as run_mise_probe, locate_mise, run_mise, AppError, DetectMiseOk, RunEvent, RunOutcome, RunRequest};

/// Cached path to the mise binary, resolved once on first call to `detect_mise`.
/// Holding it lets subsequent commands skip the filesystem probe and keeps
/// the call cheap for the UI's polling needs.
static MISE_BINARY: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Discriminated union for the mise-detection result. Returning a single
/// structured value (rather than `Result<T, AppError>`) keeps the Tauri
/// IPC contract on the happy path — the JS side always receives a
/// `{kind: "ok" | "err", ...}` object and never has to recover the
/// payload from a thrown error.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DetectMiseResult {
    Ok { ok: DetectMiseOk },
    Err { err: AppError },
}

/// Result of a streaming mise command, structured for the IPC boundary.
/// On success, the final `outcome` is returned (the streaming events
/// have already been delivered via the channel). On failure, the
/// structured `AppError` is returned so the JS side can render the
/// correct branch.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunCommandResult {
    Ok { outcome: RunOutcome },
    Err { err: AppError },
}

/// Probe for the mise binary, run `mise version --json`, and return the
/// typed result as a structured enum (never throws on the JS side).
#[tauri::command]
fn detect_mise() -> DetectMiseResult {
    let path = {
        let cached = MISE_BINARY.lock().expect("mise path mutex poisoned");
        cached.clone()
    };
    let path = match path {
        Some(p) => p,
        None => match locate_mise() {
            Ok(p) => {
                *MISE_BINARY.lock().expect("mise path mutex poisoned") = Some(p.clone());
                p
            }
            Err(e) => return DetectMiseResult::Err { err: e },
        },
    };
    match run_mise_probe(&path) {
        Ok(ok) => DetectMiseResult::Ok { ok },
        Err(e) => DetectMiseResult::Err { err: e },
    }
}

/// Run an arbitrary mise command, streaming each line to the UI via the
/// `on_event` channel. The final result is returned as a structured
/// `RunCommandResult`.
#[tauri::command]
fn run_mise_command(
    cwd: Option<String>,
    args: Vec<String>,
    on_event: tauri::ipc::Channel<RunEvent>,
) -> RunCommandResult {
    // Validate args: must be non-empty, no shell metacharacters.
    if args.is_empty() {
        return RunCommandResult::Err {
            err: AppError::command_failed(
                "run_mise_command called with empty args",
                String::new(),
            ),
        };
    }
    for a in &args {
        if a.contains(';') || a.contains('|') || a.contains('&') || a.contains('`')
            || a.contains('$') || a.contains('\n') || a.contains('\r') {
            return RunCommandResult::Err {
                err: AppError::command_failed(
                    format!("run_mise_command: arg contains shell metacharacter: {a:?}"),
                    String::new(),
                ),
            };
        }
    }

    // Resolve the mise binary path.
    let path = {
        let cached = MISE_BINARY.lock().expect("mise path mutex poisoned");
        cached.clone()
    };
    let path = match path {
        Some(p) => p,
        None => match locate_mise() {
            Ok(p) => {
                *MISE_BINARY.lock().expect("mise path mutex poisoned") = Some(p.clone());
                p
            }
            Err(e) => return RunCommandResult::Err { err: e },
        },
    };

    let req = RunRequest {
        cwd: cwd.map(PathBuf::from),
        args,
    };

    match run_mise(&path, &req, move |evt| {
        // Channel::send is fallible only if the receiver is dropped;
        // swallow the error rather than panicking in the runner thread.
        let _ = on_event.send(evt);
    }) {
        Ok(outcome) => RunCommandResult::Ok { outcome },
        Err(e) => RunCommandResult::Err { err: e },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![detect_mise, run_mise_command])
        .setup(|_app| {
            let mut guard = MISE_BINARY.lock().expect("mise path mutex poisoned");
            if guard.is_none() {
                if let Ok(p) = locate_mise() {
                    *guard = Some(p);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    // The Tauri commands depend on the Tauri runtime; covered indirectly
    // through the integration tests in `tests/mise.rs` and `tests/runner.rs`.
}
