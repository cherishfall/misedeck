// The token vocabulary of the key-shaped messages (issue #311, #313).
//
// A parameter that names a *kind* rather than data carries a
// locale-neutral token — "install", "flag", "rowsWithPath" — and the
// catalog holds the token's phrase in both locales, so the token crosses
// the Rust↔TS boundary unchanged and the reader gets the phrase in
// their own language.
//
// This module is the single home of that vocabulary:
//
//   * `TOKEN_GROUPS`         — the token → catalog-key map per group.
//   * `MESSAGE_TOKEN_PARAMS` — which parameter of which message carries
//     a token of which group.
//   * `MESSAGE_TOKEN`        — the tokens themselves, for the frontend
//     that authors a message.
//
// It is a pure module — no i18next, no browser APIs — so the zh-CN
// spacing guard (`scripts/check-i18n-zh-spacing.ts`) can read the very
// same mapping the resolver uses. The guard and the resolver must never
// disagree about which parameter holds a phrase: a phrase the guard
// cannot see is a phrase it cannot check.
//
// The Rust side emits the same tokens — see the `token` module in
// `src-tauri/src/mise.rs` and `docs/agents/i18n.md`.

import { I18N_KEYS } from "./keys";

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

/** `errors.shape.*` — the payload shape a parse failure expected. */
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
export interface TokenGroup {
  readonly keys: Readonly<Record<string, string>>;
  readonly fallback: string;
}

/** The token vocabularies the key-shaped messages draw on. */
export type TokenGroupName = "shape" | "task" | "arg" | "linkReason" | "feedReason";

/** The token vocabularies the key-shaped messages draw on. */
export const TOKEN_GROUPS: Readonly<Record<TokenGroupName, TokenGroup>> = {
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
export const MESSAGE_TOKEN_PARAMS: Readonly<
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
