// Types that mirror the Rust `#[serde(rename_all = "camelCase")]` shapes
// defined in `src-tauri/src/mise.rs` and `src-tauri/src/lib.rs`. Keep this
// in sync with the Rust side; do not invent extra fields here.

export interface DetectMiseOk {
  /** Full version string, e.g. `"2026.8.14 macos-arm64 (2026-08-26)"`. */
  version: string;
  /** `YYYY.MM.DD` prefix of `version` — the part we compare to the floor. */
  versionDate: string;
  /** Absolute path to the located mise binary. */
  binaryPath: string;
  /** Raw JSON payload from `mise version --json` for the UI to display. */
  raw: Record<string, unknown>;
}

/**
 * Fixed set of error codes. See `src-tauri/src/mise.rs` (`code` module).
 * Adding a new code is a deliberate API change and must be mirrored
 * here and on the UI.
 */
export type AppErrorCode =
  | "MISE_NOT_FOUND"
  | "MISE_TOO_OLD"
  | "COMMAND_FAILED"
  | "PARSE_FAILED"
  | "TIMEOUT"
  | "UNTRUSTED";

export interface AppError {
  code: AppErrorCode;
  /** i18n key (optionally with `|key=value` params) — resolved in the UI. */
  message: string;
  /** Raw mise stderr preserved verbatim when a command failed. */
  stderr: string;
}

/**
 * The Tauri command always resolves to a discriminated union instead of
 * throwing. The `kind` tag is the on-the-wire discriminator. Mirrors
 * `DetectMiseResult` in `src-tauri/src/lib.rs`.
 */
export type DetectMiseResult =
  | { kind: "ok"; ok: DetectMiseOk }
  | { kind: "err"; err: AppError };
