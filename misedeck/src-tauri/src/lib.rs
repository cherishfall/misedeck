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

use mise::{detect_mise as run_mise, locate_mise, AppError, DetectMiseOk};

/// Cached path to the mise binary, resolved once on first call to `detect_mise`.
/// Holding it lets subsequent commands skip the filesystem probe and keeps
/// the call cheap for the UI's polling needs.
static MISE_BINARY: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Discriminated union for the mise-detection result. Returning a single
/// structured value (rather than `Result<T, AppError>`) keeps the Tauri
/// IPC contract on the happy path — the JS side always receives a
/// `{kind: "ok" | "err", ...}` object and never has to recover the
/// payload from a thrown error. The `kind` tag is the only stable
/// discriminator the UI pattern-matches on (see conventions.md).
///
/// Uses struct variants so the serialized shape is
/// `{kind: "ok", ok: {...}}` / `{kind: "err", err: {...}}` instead of
/// flattening the inner struct's fields.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DetectMiseResult {
    Ok { ok: DetectMiseOk },
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
    match run_mise(&path) {
        Ok(ok) => DetectMiseResult::Ok { ok },
        Err(e) => DetectMiseResult::Err { err: e },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![detect_mise])
        .setup(|_app| {
            // Warm the cache so the first UI call is fast. Errors are
            // ignored here — the UI surfaces them through `detect_mise`.
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
    // The detect_mise Tauri command itself depends on the Tauri runtime,
    // so it is covered indirectly through the integration tests in
    // `tests/mise.rs` against the runner. This module exists so the file
    // is exercised under `cargo test` for the lib target.
}
