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
  contextBar: {
    eyebrow: "contextBar.eyebrow",
    regionLabel: "contextBar.regionLabel",
    globalButton: "contextBar.globalButton",
    recentsButton: "contextBar.recentsButton",
    recentsHeader: "contextBar.recentsHeader",
    pickerGlyph: "contextBar.pickerGlyph",
    pickerLabel: "contextBar.pickerLabel",
    pickerTitle: "contextBar.pickerTitle",
    removeRecentLabel: "contextBar.removeRecentLabel",
  },
  miseManagement: {
    guidedInstallButton: "miseManagement.guidedInstallButton",
    selfUpdateButton: "miseManagement.selfUpdateButton",
    releaseNotesLink: "miseManagement.releaseNotesLink",
    selfUpdateSuccessBody: "miseManagement.selfUpdateSuccessBody",
    selfUpdateNoProbeBody: "miseManagement.selfUpdateNoProbeBody",
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
  activation: {
    openInTerminalLabel: "activation.openInTerminalLabel",
    openInTerminalError: "activation.openInTerminalError",
    openInTerminalSuccess: "activation.openInTerminalSuccess",
    copyCommandLabel: "activation.copyCommandLabel",
    copyCommandHint: "activation.copyCommandHint",
    copiedHint: "activation.copiedHint",
    bannerLabel: "activation.bannerLabel",
    bannerBody: "activation.bannerBody",
    bannerBodyUnknownShell: "activation.bannerBodyUnknownShell",
    copyLineButton: "activation.copyLineButton",
    dismissButton: "activation.dismissButton",
    errorTitle: "activation.errorTitle",
    errorBody: "activation.errorBody",
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
  trust: {
    banner: {
      label: "trust.banner.label",
      body: "trust.banner.body",
      action: "trust.banner.action",
    },
    busy: "trust.busy",
    ok: "trust.ok",
    error: "trust.error",
  },
  tools: {
    eyebrow: "tools.eyebrow",
    title: "tools.title",
    hint: "tools.hint",
    columns: {
      tool: "tools.columns.tool",
      version: "tools.columns.version",
      requested: "tools.columns.requested",
      backend: "tools.columns.backend",
      source: "tools.columns.source",
      latest: "tools.columns.latest",
      actions: "tools.columns.actions",
    },
    empty: {
      title: "tools.empty.title",
      body: "tools.empty.body",
    },
    missing: {
      title: "tools.missing.title",
      body: "tools.missing.body",
    },
    outdatedBadge: "tools.outdatedBadge",
    refresh: "tools.refresh",
    installHint: "tools.installHint",
    error: {
      title: "tools.error.title",
      body: "tools.error.body",
    },
    noOutdated: "tools.noOutdated",
  },
  preview: {
    eyebrow: "preview.eyebrow",
    title: "preview.title",
    hint: "preview.hint",
    nav: "preview.nav",
    empty: {
      title: "preview.empty.title",
      body: "preview.empty.body",
    },
    sections: {
      tools: "preview.sections.tools",
      env: "preview.sections.env",
      lockfile: "preview.sections.lockfile",
    },
    columns: {
      tool: "preview.columns.tool",
      version: "preview.columns.version",
      source: "preview.columns.source",
      name: "preview.columns.name",
      value: "preview.columns.value",
    },
    source: {
      global: "preview.source.global",
      project: "preview.source.project",
      tool: "preview.source.tool",
      default: "preview.source.default",
    },
    toolSource: {
      global: "preview.toolSource.global",
      project: "preview.toolSource.project",
    },
    env: {
      emptyTitle: "preview.env.emptyTitle",
      emptyBody: "preview.env.emptyBody",
      errorTitle: "preview.env.errorTitle",
      errorBody: "preview.env.errorBody",
    },
    toolsError: {
      title: "preview.toolsError.title",
      body: "preview.toolsError.body",
    },
    lockfile: {
      eyebrow: "preview.lockfile.eyebrow",
      title: "preview.lockfile.title",
      missing: "preview.lockfile.missing",
      empty: "preview.lockfile.empty",
      errorTitle: "preview.lockfile.errorTitle",
      errorBody: "preview.lockfile.errorBody",
    },
    refresh: "preview.refresh",
  },
  config: {
    eyebrow: "config.eyebrow",
    title: "config.title",
    subtitle: "config.subtitle",
    nav: "config.nav",
    scope: {
      global: "config.scope.global",
      project: "config.scope.project",
    },
    toolsSection: {
      title: "config.toolsSection.title",
      addToolLabel: "config.toolsSection.addToolLabel",
      toolPlaceholder: "config.toolsSection.toolPlaceholder",
      versionPlaceholder: "config.toolsSection.versionPlaceholder",
      addButton: "config.toolsSection.addButton",
      saveButton: "config.toolsSection.saveButton",
      removeButton: "config.toolsSection.removeButton",
      emptyTitle: "config.toolsSection.emptyTitle",
      emptyBody: "config.toolsSection.emptyBody",
    },
    envSection: {
      title: "config.envSection.title",
      addEnvLabel: "config.envSection.addEnvLabel",
      namePlaceholder: "config.envSection.namePlaceholder",
      valuePlaceholder: "config.envSection.valuePlaceholder",
      addButton: "config.envSection.addButton",
      saveButton: "config.envSection.saveButton",
      removeButton: "config.envSection.removeButton",
      emptyTitle: "config.envSection.emptyTitle",
      emptyBody: "config.envSection.emptyBody",
    },
    guard: {
      untrustedBody: "config.guard.untrustedBody",
    },
  },
  tasks: {
    eyebrow: "tasks.eyebrow",
    title: "tasks.title",
    subtitle: "tasks.subtitle",
    nav: "tasks.nav",
    columns: {
      name: "tasks.columns.name",
      run: "tasks.columns.run",
      description: "tasks.columns.description",
      depends: "tasks.columns.depends",
      actions: "tasks.columns.actions",
    },
    empty: {
      title: "tasks.empty.title",
      body: "tasks.empty.body",
    },
    globalEmpty: {
      title: "tasks.globalEmpty.title",
      body: "tasks.globalEmpty.body",
    },
    runButton: "tasks.runButton",
    editButton: "tasks.editButton",
    openInEditorButton: "tasks.openInEditorButton",
    editForm: {
      title: "tasks.editForm.title",
      runLabel: "tasks.editForm.runLabel",
      runPlaceholder: "tasks.editForm.runPlaceholder",
      dependsLabel: "tasks.editForm.dependsLabel",
      dependsPlaceholder: "tasks.editForm.dependsPlaceholder",
      dependsHelp: "tasks.editForm.dependsHelp",
      saveButton: "tasks.editForm.saveButton",
      cancelButton: "tasks.editForm.cancelButton",
    },
    guard: {
      untrustedBody: "tasks.guard.untrustedBody",
    },
    openEditorError: {
      title: "tasks.openEditorError.title",
      body: "tasks.openEditorError.body",
    },
    readError: {
      title: "tasks.readError.title",
      body: "tasks.readError.body",
    },
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
