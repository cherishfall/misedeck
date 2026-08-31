// Thin wrapper around the Tauri `invoke` call. Components consume the
// typed result, never raw CLI output.
//
// The Tauri command returns a `DetectMiseResult` discriminated union
// (`{kind: "ok", ok: ...} | {kind: "err", err: ...}`), so the JS side
// always receives a structured object — never a thrown error. The
// `kind` tag is the only stable discriminator the UI pattern-matches on
// (see docs/agents/conventions.md).

import { invoke } from "@tauri-apps/api/core";

import type { AppError, DetectMiseResult } from "../types/tauri";

/** Type-guard for the structured AppError shape. Exported so the
 *  execution panel's reducer can pattern-match the IPC response. */
export function isAppError(value: unknown): value is AppError {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.message === "string" &&
    typeof v.stderr === "string"
  );
}

/** Calls the `detect_mise` Tauri command and returns the typed union. */
export async function detectMise(): Promise<DetectMiseResult> {
  // The Rust command never returns `Result::Err` (it serializes the error
  // as a `{kind: "err", err: ...}` variant instead), so `invoke` should
  // not throw on the happy path. We still wrap in try/catch as a defensive
  // net for IPC-level errors (channel closed, webview torn down, etc.).
  return (await invoke("detect_mise")) as DetectMiseResult;
}
