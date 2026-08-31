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
  execution: {
    title: "execution.title",
    commandLabel: "execution.commandLabel",
    statusRunning: "execution.statusRunning",
    statusOk: "execution.statusOk",
    statusFailed: "execution.statusFailed",
    statusCancelled: "execution.statusCancelled",
    copy: "execution.copy",
    copied: "execution.copied",
    cancel: "execution.cancel",
    dismiss: "execution.dismiss",
    emptyHint: "execution.emptyHint",
    demoRunDoctor: "execution.demoRunDoctor",
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
  styleguide: {
    eyebrow: "styleguide.eyebrow",
    title: "styleguide.title",
    styleguideLink: "styleguide.styleguideLink",
    backToStarter: "styleguide.backToStarter",
    sections: {
      color: "styleguide.sections.color",
      typography: "styleguide.sections.typography",
      motion: "styleguide.sections.motion",
      panel: "styleguide.sections.panel",
      button: "styleguide.sections.button",
      iconButton: "styleguide.sections.iconButton",
      badge: "styleguide.sections.badge",
      banner: "styleguide.sections.banner",
      table: "styleguide.sections.table",
      dataRow: "styleguide.sections.dataRow",
      emptyState: "styleguide.sections.emptyState",
      progressDot: "styleguide.sections.progressDot",
    },
    notes: {
      color: "styleguide.notes.color",
      typography: "styleguide.notes.typography",
      motion: "styleguide.notes.motion",
      panel: "styleguide.notes.panel",
      button: "styleguide.notes.button",
      iconButton: "styleguide.notes.iconButton",
      badge: "styleguide.notes.badge",
      banner: "styleguide.notes.banner",
      table: "styleguide.notes.table",
      dataRow: "styleguide.notes.dataRow",
      emptyState: "styleguide.notes.emptyState",
      progressDot: "styleguide.notes.progressDot",
    },
    samples: {
      panelDefault: "styleguide.samples.panelDefault",
      panelCorner: "styleguide.samples.panelCorner",
      panelInfo: "styleguide.samples.panelInfo",
      panelWarning: "styleguide.samples.panelWarning",
      panelDanger: "styleguide.samples.panelDanger",
      primary: "styleguide.samples.primary",
      secondary: "styleguide.samples.secondary",
      ghost: "styleguide.samples.ghost",
      danger: "styleguide.samples.danger",
      loading: "styleguide.samples.loading",
      disabled: "styleguide.samples.disabled",
      badgeDefault: "styleguide.samples.badgeDefault",
      badgeInfo: "styleguide.samples.badgeInfo",
      badgeSuccess: "styleguide.samples.badgeSuccess",
      badgeWarning: "styleguide.samples.badgeWarning",
      badgeDanger: "styleguide.samples.badgeDanger",
      bannerInfo: "styleguide.samples.bannerInfo",
      bannerWarning: "styleguide.samples.bannerWarning",
      bannerDanger: "styleguide.samples.bannerDanger",
      bannerSuccess: "styleguide.samples.bannerSuccess",
      tableTool: "styleguide.samples.tableTool",
      tableBackend: "styleguide.samples.tableBackend",
      tableCurrent: "styleguide.samples.tableCurrent",
      tableLatest: "styleguide.samples.tableLatest",
      tableSource: "styleguide.samples.tableSource",
      tableActions: "styleguide.samples.tableActions",
      emptyTitle: "styleguide.samples.emptyTitle",
      emptyBody: "styleguide.samples.emptyBody",
      emptyAction: "styleguide.samples.emptyAction",
      dotReady: "styleguide.samples.dotReady",
      dotAttention: "styleguide.samples.dotAttention",
      dotError: "styleguide.samples.dotError",
      dotIdle: "styleguide.samples.dotIdle",
      iconLabel: "styleguide.samples.iconLabel",
    },
  },
} as const;

/** Union of every leaf key path the catalog declares. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type I18nKey = Leaves<typeof I18N_KEYS>;
