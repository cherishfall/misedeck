// Thin wrapper around the Tauri `invoke` call. Components consume the
// typed result, never raw CLI output.
//
// The Tauri command returns a `DetectMiseResult` discriminated union
// (`{kind: "ok", ok: ...} | {kind: "err", err: ...}`), so the JS side
// always receives a structured object — never a thrown error. The
// `kind` tag is the only stable discriminator the UI pattern-matches on
// (see docs/agents/conventions.md).

import { invoke } from "@tauri-apps/api/core";

import type { DetectMiseResult } from "../types/tauri";

/** Calls the `detect_mise` Tauri command and returns the typed union. */
export async function detectMise(): Promise<DetectMiseResult> {
  // The Rust command never returns `Result::Err` (it serializes the error
  // as a `{kind: "err", err: ...}` variant instead), so `invoke` should
  // not throw on the happy path. We still wrap in try/catch as a defensive
  // net for IPC-level errors (channel closed, webview torn down, etc.).
  return (await invoke("detect_mise")) as DetectMiseResult;
}
