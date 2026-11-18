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
//
// The parse-failure detail (issue #310) is the one place where a
// MiseDeck-authored detail used to cross the boundary as raw English
// text. It is key-shaped now — one message for the whole class, with the
// command that ran and the expected shape as parameters — so a zh-CN UI
// resolves it like every other message.

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
  // Not a Rust emission: `useTrustAction` (trustContext.tsx) authors it
  // at runtime for the trust run's exit-code note (issue #304).
  I18N_KEYS.errors.exitCode,
  // Rust emission (`run_mise_capture`, issue #301's registry guard): the
  // aggregate-cap truncation detail, keyed so zh never renders English
  // MiseDeck-authored copy.
  I18N_KEYS.errors.captureCap,
  // Both sides emit it (issue #310): the frontend's shape checks
  // (`api/miseTools.ts`, `api/mise.ts`) and the Rust boundary
  // (`src-tauri/src/mise.rs`) author the parse-failure detail as
  // `errors.parseFailed|cmd=…|shape=…`, so the detail resolves through
  // the catalog instead of rendering as MiseDeck's English prose.
  I18N_KEYS.errors.parseFailed,
  // Also the defensive fallback inside `toTrustState` for a malformed
  // `TrustResult` payload — it emits the key, the hook resolves it.
  I18N_KEYS.errors.unknown,
]);

/**
 * The expected-shape vocabulary of the parse-failure message
 * (issue #310). The wire format carries a locale-neutral token
 * (`shape=objectByTool`) and the catalog holds the phrase for each
 * token in both locales, so the detail is translated on the reader's
 * side and the token can cross the Rust↔TS boundary. The Rust side
 * emits the same tokens — see `docs/agents/i18n.md`.
 */
const SHAPE_KEYS = {
  array: I18N_KEYS.errors.shape.array,
  configFilesResult: I18N_KEYS.errors.shape.configFilesResult,
  objectBySetting: I18N_KEYS.errors.shape.objectBySetting,
  objectByTool: I18N_KEYS.errors.shape.objectByTool,
  objectByVariable: I18N_KEYS.errors.shape.objectByVariable,
  report: I18N_KEYS.errors.shape.report,
  rowsWithPath: I18N_KEYS.errors.shape.rowsWithPath,
  validJson: I18N_KEYS.errors.shape.validJson,
  versionDate: I18N_KEYS.errors.shape.versionDate,
  versionString: I18N_KEYS.errors.shape.versionString,
} as const;

/** One expected shape the parse-failure message can name. */
export type ParseShape = keyof typeof SHAPE_KEYS;

/**
 * Build the key-shaped parse-failure message (issue #310): one
 * catalog message for every payload MiseDeck could not read, with the
 * command that ran and the expected shape as parameters. `cmd` is
 * mise's own command line — the data-honesty rule asks the detail to
 * name what was run and what was expected back.
 */
export function parseFailedMessage(cmd: string, shape: ParseShape): string {
  return `${I18N_KEYS.errors.parseFailed}|cmd=${cmd}|shape=${shape}`;
}

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
 * Resolve the parameters of a key-shaped message before it is
 * translated. The parse-failure message's `shape` parameter is a
 * token, not copy: the catalog's phrase for it is resolved here, in
 * the reader's locale (issue #310). An unknown token keeps its raw
 * text — the message still names the command that ran.
 */
function resolveMessageParams(
  key: string,
  params: Record<string, string>,
  t: TFunction,
): Record<string, string> {
  if (key !== I18N_KEYS.errors.parseFailed) return params;
  const token = params.shape;
  // A parse failure that names no shape still names the command that
  // ran — the generic phrase keeps the sentence whole.
  if (!token) {
    return { ...params, shape: t(I18N_KEYS.errors.shape.documented) };
  }
  const shapeKey = SHAPE_KEYS[token as ParseShape];
  // An unknown token keeps its raw text: the message still says what
  // arrived, which is what a reader can act on.
  if (!shapeKey || !i18n.exists(shapeKey)) return params;
  return { ...params, shape: t(shapeKey) };
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
      return t(key, resolveMessageParams(key, params, t));
    }
    return t(I18N_KEYS.errors.unknown);
  }
  return message;
}
