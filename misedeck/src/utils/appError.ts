// Shared resolution path for `AppError.message` (issue #118).
//
// The Rust↔TS contract (docs/agents/conventions.md) says `message` is an
// i18n key plus pipe-delimited params — "errors.miseTooOld|found=…|minimum=…" —
// resolved in the UI, never pre-rendered copy. Some codes legitimately carry
// raw text instead (raw detail strings), so a message reaches the UI in one of
// two shapes:
//
//   * key-shaped: "errors.<name>[|param=value …]" → resolve via the catalog
//   * raw text:   anything else → render verbatim
//
// Every UI site that displays `err.message` goes through
// `resolveAppErrorMessage` so a key-shaped message can never render as the
// raw key string: when the key is unknown to the catalog, the fallback is
// `errors.unknown`, not the key.
//
// The parse-failure detail (issue #310) and the command-failure class
// (issue #311) are key-shaped — one message per class, with the data as
// parameters — so a zh-CN UI resolves them like every other message. What
// stays raw is *data*: mise's own stderr (the CLI's output), the OS error
// text, the runtime's own rejection text. MiseDeck's words are always in
// the catalog.

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
  // The command-failure class (issue #311): every MiseDeck-authored
  // COMMAND_FAILED detail — the Rust boundary's and the frontend's own
  // runtime failures — is key-shaped, so a zh-CN UI never renders
  // MiseDeck's English prose. mise's own stderr stays in the `stderr`
  // field, verbatim.
  I18N_KEYS.errors.commandFailed,
  I18N_KEYS.errors.installFailed,
  I18N_KEYS.errors.spawnFailed,
  I18N_KEYS.errors.waitFailed,
  I18N_KEYS.errors.backgroundTaskFailed,
  I18N_KEYS.errors.cancelled,
  I18N_KEYS.errors.emptyArg,
  I18N_KEYS.errors.invalidArg,
  I18N_KEYS.errors.notADirectory,
  I18N_KEYS.errors.readFailed,
  I18N_KEYS.errors.homeNotFound,
  I18N_KEYS.errors.unparsableOutput,
  I18N_KEYS.errors.terminalLaunchFailed,
  I18N_KEYS.errors.terminalLaunchExited,
  I18N_KEYS.errors.terminalLaunchTimeout,
  I18N_KEYS.errors.linkRejected,
  I18N_KEYS.errors.browserRefused,
  I18N_KEYS.errors.updateFeedInvalid,
  I18N_KEYS.errors.updateCurlFailed,
  I18N_KEYS.errors.updateFeedTooLarge,
  I18N_KEYS.errors.updateRequestFailed,
  I18N_KEYS.errors.ipcFailed,
  I18N_KEYS.errors.unexpectedIpcResponse,
  I18N_KEYS.errors.shellRcUnreadable,
  I18N_KEYS.errors.windowChromeFailed,
  // Also the defensive fallback inside `toTrustState` for a malformed
  // `TrustResult` payload — it emits the key, the hook resolves it.
  I18N_KEYS.errors.unknown,
]);

/**
 * The locale-neutral tokens of the key-shaped messages. A parameter that
 * names a *kind* rather than data carries one of these tokens; the catalog
 * holds the token's phrase in both locales, so the detail is translated on
 * the reader's side and the token can cross the Rust↔TS boundary. The Rust
 * side emits the same tokens — see `docs/agents/i18n.md`.
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

/** `errors.task.*` — the operation a task belongs to (issue #311). */
const TASK_KEYS = {
  mise: I18N_KEYS.errors.task.mise,
  install: I18N_KEYS.errors.task.install,
  selfUpdate: I18N_KEYS.errors.task.selfUpdate,
  trust: I18N_KEYS.errors.task.trust,
  cwd: I18N_KEYS.errors.task.cwd,
} as const;

/** `errors.arg.*` — the argument a rule is about (issue #311). */
const ARG_KEYS = {
  command: I18N_KEYS.errors.arg.command,
  tool: I18N_KEYS.errors.arg.tool,
  task: I18N_KEYS.errors.arg.task,
  cwd: I18N_KEYS.errors.arg.cwd,
  flag: I18N_KEYS.errors.arg.flag,
  theme: I18N_KEYS.errors.arg.theme,
} as const;

/** `errors.linkReason.*` — why a link was refused (issue #311). */
const LINK_REASON_KEYS = {
  empty: I18N_KEYS.errors.linkReason.empty,
  tooLong: I18N_KEYS.errors.linkReason.tooLong,
  whitespace: I18N_KEYS.errors.linkReason.whitespace,
  scheme: I18N_KEYS.errors.linkReason.scheme,
  host: I18N_KEYS.errors.linkReason.host,
  credentials: I18N_KEYS.errors.linkReason.credentials,
} as const;

/** `errors.feedReason.*` — why the release feed was unreadable (issue #311). */
const FEED_REASON_KEYS = {
  notAtom: I18N_KEYS.errors.feedReason.notAtom,
  noEntry: I18N_KEYS.errors.feedReason.noEntry,
} as const;

/**
 * One token vocabulary: the catalog key per token, plus the phrase used
 * when the token is missing (the message still has to read as a sentence).
 */
interface TokenGroup {
  readonly keys: Readonly<Record<string, string>>;
  readonly fallback: string;
}

/** The token vocabularies the key-shaped messages draw on. */
type TokenGroupName = "shape" | "task" | "arg" | "linkReason" | "feedReason";

const TOKEN_GROUPS: Readonly<Record<TokenGroupName, TokenGroup>> = {
  shape: { keys: SHAPE_KEYS, fallback: I18N_KEYS.errors.shape.documented },
  task: { keys: TASK_KEYS, fallback: I18N_KEYS.errors.task.other },
  arg: { keys: ARG_KEYS, fallback: I18N_KEYS.errors.arg.other },
  linkReason: {
    keys: LINK_REASON_KEYS,
    fallback: I18N_KEYS.errors.linkReason.other,
  },
  feedReason: {
    keys: FEED_REASON_KEYS,
    fallback: I18N_KEYS.errors.feedReason.other,
  },
};

/**
 * Which parameters of which message carry a token rather than data.
 * A message without an entry here has no token parameter.
 */
const MESSAGE_TOKEN_PARAMS: Readonly<
  Record<string, Readonly<Record<string, TokenGroupName>>>
> = {
  [I18N_KEYS.errors.parseFailed]: { shape: "shape" },
  [I18N_KEYS.errors.spawnFailed]: { task: "task" },
  [I18N_KEYS.errors.waitFailed]: { task: "task" },
  [I18N_KEYS.errors.backgroundTaskFailed]: { task: "task" },
  [I18N_KEYS.errors.cancelled]: { task: "task" },
  [I18N_KEYS.errors.emptyArg]: { arg: "arg" },
  [I18N_KEYS.errors.invalidArg]: { arg: "arg" },
  [I18N_KEYS.errors.linkRejected]: { reason: "linkReason" },
  [I18N_KEYS.errors.updateFeedInvalid]: { reason: "feedReason" },
};

/**
 * The locale-neutral tokens the Rust side emits (issue #311). They mirror
 * the `token` module in `src-tauri/src/mise.rs` — see
 * `docs/agents/i18n.md`. A token crosses the boundary unchanged; the
 * catalog turns it into the reader's language.
 */
export const MESSAGE_TOKEN = {
  /** `errors.task.*` — the operation a task belongs to. */
  task: {
    mise: "mise",
    install: "install",
    selfUpdate: "selfUpdate",
    trust: "trust",
    cwd: "cwd",
  },
} as const;

/**
 * Percent-encode a parameter value for the `key|param=value|…` wire
 * format. The `|` delimiter is the one character the format cannot carry
 * raw: a value that contains one would split the message into bogus
 * parameters, and the reader would then see a truncated path or a
 * half-quoted command. `%` is encoded first so the escape itself
 * round-trips (`%7C` is never mistaken for a literal `%`).
 */
export function encodeParamValue(value: string): string {
  return value.replace(/%/g, "%25").replace(/\|/g, "%7C");
}

/** Decode a parameter value encoded by `encodeParamValue`. */
export function decodeParamValue(value: string): string {
  return value.replace(/%7C/g, "|").replace(/%25/g, "%");
}

/**
 * Build a key-shaped `AppError.message` (issue #311): the i18n key first,
 * then one `|name=value` segment per parameter. The values are the *data*
 * — the command that ran, the exit status, the path — so the localized
 * sentence never has to invent them.
 */
export function keyedMessage(
  key: string,
  params: Readonly<Record<string, string>> = {},
): string {
  const parts = [key];
  for (const [name, value] of Object.entries(params)) {
    parts.push(`${name}=${encodeParamValue(value)}`);
  }
  return parts.join("|");
}

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
  return keyedMessage(I18N_KEYS.errors.parseFailed, { cmd, shape });
}

/**
 * Build the key-shaped IPC-failure message (issue #311): the frontend's
 * own runtime failure — an `invoke` that rejected with something that is
 * not an `AppError`. MiseDeck's words are the catalog's sentence; the
 * runtime's own text is the data it carries.
 */
export function ipcFailedMessage(detail: string): string {
  return keyedMessage(I18N_KEYS.errors.ipcFailed, { detail });
}

/**
 * The raw text of a thrown value (issue #311). The runtime's own message
 * is *data* — it is not MiseDeck's copy, so it is never translated and
 * never reformatted; it is carried as a parameter of the key-shaped
 * message. A value that cannot be stringified contributes no text.
 */
export function runtimeErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return String(error);
  } catch {
    return "";
  }
}

/**
 * The runner's cancellation signature (issue #311): the Rust side emits
 * exactly this key-shaped message for a cancelled run, and the execution
 * panel matches it to settle a cancel-racing rejection as *cancelled*,
 * not failed (issue #301). It is a cross-language contract — change both
 * sides together.
 */
export const RUN_CANCELLED_MESSAGE = keyedMessage(I18N_KEYS.errors.cancelled, {
  task: MESSAGE_TOKEN.task.mise,
});

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
    params[parts[i].slice(0, eq)] = decodeParamValue(parts[i].slice(eq + 1));
  }
  return { key: parts[0], params };
}

/**
 * Resolve the parameters of a key-shaped message before it is
 * translated. A token parameter (the `shape` of issue #310, the `task`
 * / `arg` / `reason` of issue #311) names a *kind*, not copy: the
 * catalog's phrase for it is resolved here, in the reader's locale. An
 * unknown token keeps its raw text — the message still names what
 * arrived, which is what a reader can act on.
 */
function resolveMessageParams(
  key: string,
  params: Record<string, string>,
  t: TFunction,
): Record<string, string> {
  const groups = MESSAGE_TOKEN_PARAMS[key];
  if (!groups) return params;
  const resolved = { ...params };
  for (const [name, groupName] of Object.entries(groups)) {
    const group = TOKEN_GROUPS[groupName];
    const token = resolved[name];
    // A failure that names no kind still reads as a sentence: the
    // generic phrase of the group stands in for the missing token.
    if (!token) {
      resolved[name] = t(group.fallback);
      continue;
    }
    const tokenKey = group.keys[token];
    if (!tokenKey || !i18n.exists(tokenKey)) continue;
    resolved[name] = t(tokenKey);
  }
  return resolved;
}

/**
 * Resolve an `AppError.message` to display copy. Key-shaped messages from
 * the known set resolve through the catalog (a catalog miss falls back to
 * `errors.unknown` — the raw key never renders); anything else is raw
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
