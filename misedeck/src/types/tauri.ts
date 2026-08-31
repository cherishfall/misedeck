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

/**
 * Discriminated union for the read-only tools commands
 * (`tools_ls`, `tools_outdated`, `tools_ls_remote`). The Rust
 * boundary returns the raw JSON mise produced as `value`; the JS
 * side parses it into the typed shapes below. Mirrors `JsonResult`
 * in `src-tauri/src/lib.rs`.
 */
export type JsonResult =
  | { kind: "ok"; value: Record<string, unknown> }
  | { kind: "err"; err: AppError };

/**
 * Source of an installed tool's version, as reported by
 * `mise ls --json`. The `type` is the discriminator (e.g. "mise.toml",
 * "environment", "idfk"); other fields may be absent.
 */
export interface MiseSource {
  type: string;
  path?: string;
}

/** One row of `mise ls --json` (a single installed version of a tool). */
export interface MiseLsItem {
  version: string;
  requestedVersion?: string;
  installPath?: string;
  symlinkedTo?: string;
  source?: MiseSource;
  installed: boolean;
  active: boolean;
}

/** One row of `mise outdated --json --bump`. */
export interface MiseOutdatedItem {
  name: string;
  requested?: string;
  current?: string;
  bump?: string;
  latest?: string;
  source?: MiseSource;
}

/** One row of `mise ls-remote --json <tool>`. */
export interface MiseLsRemoteItem {
  version: string;
  createdAt?: string;
}

/**
 * The `read_lockfile` Tauri command returns a discriminated union so
 * the JS side can tell "no lockfile" (None) apart from "the file
 * exists but is empty" (`Some("")`) apart from a hard I/O error
 * (the structured AppError). Mirrors the Tauri command in
 * `src-tauri/src/lib.rs`.
 */
export type LockfileResult =
  | { kind: "ok"; content: string | null }
  | { kind: "err"; err: AppError };

/**
 * Trust state for a directory's mise config (issue #25). Mirrors
 * `TrustSource` in `src-tauri/src/mise.rs` and the architecture
 * doc's "MISE_SAFE=1" semantics.
 *
 *   * `configTrusted`   — a `mise.toml` is in scope and is trusted.
 *   * `configUntrusted` — a `mise.toml` is in scope but the user
 *      has not trusted it yet; the directory preview banner
 *      surfaces this state and mutating actions must route to
 *      the banner.
 *   * `noConfig`        — no `mise.toml` is in scope; nothing to
 *      trust, the banner stays hidden.
 */
export type TrustSource = "configTrusted" | "configUntrusted" | "noConfig";

/**
 * The `trust_check` Tauri command returns this discriminated union.
 * On success, the `TrustStatus` is shipped as `ok`; on failure, the
 * structured `AppError` is shipped as `err`. Mirrors `TrustResult`
 * in `src-tauri/src/lib.rs`.
 */
export interface TrustStatus {
  source: TrustSource;
  /** Path of the config file the trust probe decided on (or the cwd when `source = "noConfig"`). */
  path: string;
}

export type TrustResult =
  | { kind: "ok"; ok: TrustStatus }
  | { kind: "err"; err: AppError };
