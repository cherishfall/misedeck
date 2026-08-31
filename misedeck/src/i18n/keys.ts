// Canonical catalog of every i18n key used by the app.
//
// Why this file exists
// --------------------
// `react-i18next` is typed against a generic `Resources`, so `t("nave.toolz")`
// would happily return the missing-key string at runtime. By routing every
// call through the constants below, the TypeScript compiler can catch typos
// like `t(I18N_KEYS.nav.toolz)` — `toolz` is not a member of `nav`.
//
// The values are dotted paths into `en.json` / `zh-CN.json` (see
// `docs/agents/i18n.md` for the naming convention). The `lint:i18n` script
// verifies that every key here is present in BOTH resource files, so adding
// a constant without adding both translations is a build-time error.
//
// Adding a new key:
//   1. Add the constant below (and a nested group if needed).
//   2. Add the same path to BOTH `en.json` and `zh-CN.json` in the same
//      commit — the lint script will fail otherwise.
//   3. Use `t(I18N_KEYS.foo.bar)` at the call site.

export const I18N_KEYS = {
  app: {
    wordmark: "app.wordmark",
    tagline: "app.tagline",
  },
  common: {
    ok: "common.ok",
    cancel: "common.cancel",
    save: "common.save",
    close: "common.close",
    copy: "common.copy",
    search: "common.search",
    refresh: "common.refresh",
    loading: "common.loading",
    error: "common.error",
    retry: "common.retry",
    back: "common.back",
    next: "common.next",
  },
  nav: {
    tools: "nav.tools",
    tasks: "nav.tasks",
    config: "nav.config",
    doctor: "nav.doctor",
    settings: "nav.settings",
    plugins: "nav.plugins",
    about: "nav.about",
  },
  starter: {
    eyebrow: "starter.eyebrow",
    title: "starter.title",
    hint: "starter.hint",
  },
  states: {
    detecting: "states.detecting",
    ready: "states.ready",
    notInstalled: {
      title: "states.notInstalled.title",
      body: "states.notInstalled.body",
      installHint: "states.notInstalled.installHint",
    },
    tooOld: {
      title: "states.tooOld.title",
      body: "states.tooOld.body",
    },
    commandFailed: {
      title: "states.commandFailed.title",
      body: "states.commandFailed.body",
    },
    parseFailed: {
      title: "states.parseFailed.title",
      body: "states.parseFailed.body",
    },
  },
  labels: {
    version: "labels.version",
    binary: "labels.binary",
    minimum: "labels.minimum",
    name: "labels.name",
    versionLabel: "labels.versionLabel",
    source: "labels.source",
    lastUsed: "labels.lastUsed",
  },
  errors: {
    miseNotFound: "errors.miseNotFound",
    miseTooOld: "errors.miseTooOld",
    timeout: "errors.timeout",
    generic: "errors.generic",
    network: "errors.network",
    untrusted: "errors.untrusted",
    unknown: "errors.unknown",
  },
  languages: {
    english: "languages.english",
    simplifiedChinese: "languages.simplifiedChinese",
    switcherLabel: "languages.switcherLabel",
  },
} as const;

/** Union of every leaf key path the catalog declares. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type I18nKey = Leaves<typeof I18N_KEYS>;
