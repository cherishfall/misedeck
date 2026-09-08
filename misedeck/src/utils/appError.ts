// Shared resolution path for `AppError.message` (issue #118).
//
// The Rust↔TS contract (docs/agents/conventions.md) says `message` is an
// i18n key plus pipe-delimited params — "errors.miseTooOld|found=…|minimum=…" —
// resolved in the UI, never pre-rendered copy. Some codes legitimately carry
// raw text instead (COMMAND_FAILED / PARSE_FAILED detail strings), so a
// message reaches the UI in one of two shapes:
//
//   * key-shaped: "errors.<name>[|param=value …]" → resolve via the catalog
//   * raw text:   anything else → render verbatim
//
// Every UI site that displays `err.message` goes through
// `resolveAppErrorMessage` so a key-shaped message can never render as the
// raw key string: when the key is unknown to the catalog, the fallback is
// `errors.unknown`, not the key.

import type { TFunction } from "i18next";

import i18n from "../i18n";
import { I18N_KEYS } from "../i18n/keys";

/**
 * The keys the Rust side can emit inside `AppError.message` (see
 * `src-tauri/src/mise.rs` / `shell.rs`). Referenced here deliberately:
 * resolution is dynamic, so static `t()` call-site scans and dead-key
 * sweeps cannot see these keys — this set is their call site.
 */
const KNOWN_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  I18N_KEYS.errors.miseNotFound,
  I18N_KEYS.errors.miseTooOld,
  I18N_KEYS.errors.terminalNotFound,
  I18N_KEYS.errors.timeout,
  // Also the defensive fallback inside `toTrustState` for a malformed
  // `TrustResult` payload — it emits the key, the hook resolves it.
  I18N_KEYS.errors.unknown,
]);

export interface ParsedAppErrorMessage {
  /** The first segment — the i18n key when the message is key-shaped. */
  key: string;
  /** Pipe-delimited `param=value` segments after the key. */
  params: Record<string, string>;
}

/** Split the `key|param=value|…` wire format into key + params. */
export function parseAppErrorMessage(message: string): ParsedAppErrorMessage {
  const parts = message.split("|");
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1);
  }
  return { key: parts[0], params };
}

/**
 * Resolve an `AppError.message` to display copy. Key-shaped messages from
 * the known set resolve through the catalog (a catalog miss falls back to
 * `errors.unknown` — the raw key never renders); anything else is raw Rust
 * detail text and renders verbatim.
 */
export function resolveAppErrorMessage(message: string, t: TFunction): string {
  const { key, params } = parseAppErrorMessage(message);
  if (KNOWN_MESSAGE_KEYS.has(key)) {
    if (i18n.exists(key)) {
      return t(key, params);
    }
    return t(I18N_KEYS.errors.unknown);
  }
  return message;
}
