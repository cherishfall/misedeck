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
  common: {
    ok: "common.ok",
    cancel: "common.cancel",
    save: "common.save",
    refresh: "common.refresh",
    loading: "common.loading",
    back: "common.back",
    clear: "common.clear",
    outdatedCount: "common.outdatedCount",
    allUpToDate: "common.allUpToDate",
    filter: {
      noMatchTitle: "common.filter.noMatchTitle",
      noMatchBody: "common.filter.noMatchBody",
    },
  },
  directory: {
    eyebrow: "directory.eyebrow",
    regionLabel: "directory.regionLabel",
    globalButton: "directory.globalButton",
    globalMode: "directory.globalMode",
    recentsButton: "directory.recentsButton",
    recentsHeader: "directory.recentsHeader",
    pickerLabel: "directory.pickerLabel",
    pickerTitle: "directory.pickerTitle",
    chooseAnother: "directory.chooseAnother",
    removeRecentLabel: "directory.removeRecentLabel",
  },
  sidebar: {
    collapseLabel: "sidebar.collapseLabel",
    expandLabel: "sidebar.expandLabel",
  },
  miseManagement: {
    guidedInstallButton: "miseManagement.guidedInstallButton",
    selfUpdateButton: "miseManagement.selfUpdateButton",
    releaseNotesLink: "miseManagement.releaseNotesLink",
    confirmSelfUpdate: {
      title: "miseManagement.confirmSelfUpdate.title",
      bodyWithLatest: "miseManagement.confirmSelfUpdate.bodyWithLatest",
      bodyUnknownLatest: "miseManagement.confirmSelfUpdate.bodyUnknownLatest",
    },
  },
  execution: {
    title: "execution.title",
    statusRunning: "execution.statusRunning",
    statusOk: "execution.statusOk",
    statusFailed: "execution.statusFailed",
    statusFailedNoCode: "execution.statusFailedNoCode",
    statusCancelled: "execution.statusCancelled",
    copy: "execution.copy",
    copyHint: "execution.copyHint",
    copied: "execution.copied",
    cancel: "execution.cancel",
    dismiss: "execution.dismiss",
    emptyHint: "execution.emptyHint",
    reopen: "execution.reopen",
    reopenRunning: "execution.reopenRunning",
  },
  tooltip: {
    copy: "tooltip.copy",
    copied: "tooltip.copied",
  },
  activation: {
    openInTerminalLabel: "activation.openInTerminalLabel",
    openInTerminalError: "activation.openInTerminalError",
    openInTerminalSuccess: "activation.openInTerminalSuccess",
    copiedHint: "activation.copiedHint",
    bannerLabel: "activation.bannerLabel",
    bannerBody: "activation.bannerBody",
    bannerBodyUnknownShell: "activation.bannerBodyUnknownShell",
    copyLineButton: "activation.copyLineButton",
    dismissButton: "activation.dismissButton",
  },
  nav: {
    home: "nav.home",
    tools: "nav.tools",
    tasks: "nav.tasks",
    env: "nav.env",
    doctor: "nav.doctor",
    settings: "nav.settings",
    plugins: "nav.plugins",
    regionLabel: "nav.regionLabel",
    mainGroupLabel: "nav.mainGroupLabel",
    bottomGroupLabel: "nav.bottomGroupLabel",
  },
  home: {
    title: "home.title",
    hint: "home.hint",
    commandHint: "home.commandHint",
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
    title: "tools.title",
    hint: "tools.hint",
    commandHint: "tools.commandHint",
    columns: {
      tool: "tools.columns.tool",
      version: "tools.columns.version",
      requested: "tools.columns.requested",
      backend: "tools.columns.backend",
      source: "tools.columns.source",
      latest: "tools.columns.latest",
      use: "tools.columns.use",
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
    installHint: "tools.installHint",
    error: {
      title: "tools.error.title",
      body: "tools.error.body",
    },
    filterPlaceholder: "tools.filterPlaceholder",
    actions: {
      install: "tools.actions.install",
      uninstall: "tools.actions.uninstall",
      unuse: "tools.actions.unuse",
      upgrade: "tools.actions.upgrade",
      use: "tools.actions.use",
      link: "tools.actions.link",
    },
    confirm: {
      uninstall: {
        title: "tools.confirm.uninstall.title",
        body: "tools.confirm.uninstall.body",
      },
      unuse: {
        title: "tools.confirm.unuse.title",
        body: "tools.confirm.unuse.body",
      },
      link: {
        directoryNotFound: "tools.confirm.link.directoryNotFound",
      },
    },
    installForm: {
      title: "tools.installForm.title",
      toolPlaceholder: "tools.installForm.toolPlaceholder",
      versionPlaceholder: "tools.installForm.versionPlaceholder",
    },
    linkForm: {
      title: "tools.linkForm.title",
      explanation: "tools.linkForm.explanation",
      toolPlaceholder: "tools.linkForm.toolPlaceholder",
      versionPlaceholder: "tools.linkForm.versionPlaceholder",
      noPath: "tools.linkForm.noPath",
      duplicateVersion: "tools.linkForm.duplicateVersion",
    },
    queries: {
      installed: {
        title: "tools.queries.installed.title",
        toolPlaceholder: "tools.queries.installed.toolPlaceholder",
        run: "tools.queries.installed.run",
        clear: "tools.queries.installed.clear",
        active: "tools.queries.installed.active",
        inactive: "tools.queries.installed.inactive",
        activeColumn: "tools.queries.installed.activeColumn",
        emptyTitle: "tools.queries.installed.emptyTitle",
        emptyBody: "tools.queries.installed.emptyBody",
      },
      remote: {
        title: "tools.queries.remote.title",
        toolPlaceholder: "tools.queries.remote.toolPlaceholder",
        run: "tools.queries.remote.run",
        clear: "tools.queries.remote.clear",
        created: "tools.queries.remote.created",
        emptyTitle: "tools.queries.remote.emptyTitle",
        emptyBody: "tools.queries.remote.emptyBody",
      },
      pagination: {
        total: "tools.queries.pagination.total",
        pageOf: "tools.queries.pagination.pageOf",
        pageSize: "tools.queries.pagination.pageSize",
        pageSizeHelp: "tools.queries.pagination.pageSizeHelp",
        prev: "tools.queries.pagination.prev",
        next: "tools.queries.pagination.next",
        jumpTo: "tools.queries.pagination.jumpTo",
        jump: "tools.queries.pagination.jump",
      },
    },
  },
  preview: {
    title: "preview.title",
    hint: "preview.hint",
    commandHint: "preview.commandHint",
    nav: "preview.nav",
    empty: {
      body: "preview.empty.body",
      action: "preview.empty.action",
    },
    sections: {
      tools: "preview.sections.tools",
      env: "preview.sections.env",
      config: "preview.sections.config",
    },
    config: {
      orderNote: "preview.config.orderNote",
      empty: "preview.config.empty",
      view: "preview.config.view",
      hide: "preview.config.hide",
      unreadable: "preview.config.unreadable",
      errorTitle: "preview.config.errorTitle",
      errorBody: "preview.config.errorBody",
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
      toolDetail: "preview.source.toolDetail",
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
      title: "preview.lockfile.title",
      empty: "preview.lockfile.empty",
      errorTitle: "preview.lockfile.errorTitle",
      errorBody: "preview.lockfile.errorBody",
    },
  },
  env: {
    title: "env.title",
    hint: "env.hint",
    commandHint: "env.commandHint",
    listTitle: "env.listTitle",
    filterPlaceholder: "env.filterPlaceholder",
    scope: {
      global: "env.scope.global",
      project: "env.scope.project",
    },
    columns: {
      name: "env.columns.name",
      value: "env.columns.value",
      source: "env.columns.source",
      actions: "env.columns.actions",
    },
    source: {
      global: "env.source.global",
      project: "env.source.project",
      tool: "env.source.tool",
      toolDetail: "env.source.toolDetail",
      default: "env.source.default",
    },
    empty: {
      title: "env.empty.title",
      body: "env.empty.body",
    },
    error: {
      title: "env.error.title",
      body: "env.error.body",
    },
    addLabel: "env.addLabel",
    addButton: "env.addButton",
    editButton: "env.editButton",
    removeButton: "env.removeButton",
    namePlaceholder: "env.namePlaceholder",
    valuePlaceholder: "env.valuePlaceholder",
    guard: {
      untrustedBody: "env.guard.untrustedBody",
    },
    tooltip: {
      tool: "env.tooltip.tool",
      default: "env.tooltip.default",
    },
    confirm: {
      remove: {
        title: "env.confirm.remove.title",
        body: "env.confirm.remove.body",
      },
    },
  },
  tasks: {
    title: "tasks.title",
    subtitle: "tasks.subtitle",
    commandHint: "tasks.commandHint",
    filterPlaceholder: "tasks.filterPlaceholder",
    count: "tasks.count",
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
      openConfig: "tasks.empty.openConfig",
    },
    runButton: "tasks.runButton",
    editButton: "tasks.editButton",
    openInEditorButton: "tasks.openInEditorButton",
    hiddenBadge: "tasks.hiddenBadge",
    editForm: {
      title: "tasks.editForm.title",
      runLabel: "tasks.editForm.runLabel",
      runPlaceholder: "tasks.editForm.runPlaceholder",
      dependsLabel: "tasks.editForm.dependsLabel",
      dependsPlaceholder: "tasks.editForm.dependsPlaceholder",
      dependsHelp: "tasks.editForm.dependsHelp",
      saveButton: "tasks.editForm.saveButton",
      cancelButton: "tasks.editForm.cancelButton",
      runRequired: "tasks.editForm.runRequired",
    },
    guard: {
      untrustedBody: "tasks.guard.untrustedBody",
    },
    openEditorError: {
      title: "tasks.openEditorError.title",
      body: "tasks.openEditorError.body",
    },
    openConfigError: {
      body: "tasks.openConfigError.body",
    },
    readError: {
      title: "tasks.readError.title",
      body: "tasks.readError.body",
    },
  },
  settings: {
    title: "settings.title",
    hint: "settings.hint",
    commandHint: "settings.commandHint",
    columns: {
      key: "settings.columns.key",
      value: "settings.columns.value",
      type: "settings.columns.type",
      source: "settings.columns.source",
      actions: "settings.columns.actions",
    },
    empty: {
      title: "settings.empty.title",
      body: "settings.empty.body",
    },
    error: {
      title: "settings.error.title",
      body: "settings.error.body",
    },
    saveButton: "settings.saveButton",
    unsetButton: "settings.unsetButton",
    addButton: "settings.addButton",
    addSettingLabel: "settings.addSettingLabel",
    keyPlaceholder: "settings.keyPlaceholder",
    valuePlaceholder: "settings.valuePlaceholder",
    showAll: "settings.showAll",
    filterPlaceholder: "settings.filterPlaceholder",
    count: "settings.count",
    guard: {
      untrustedBody: "settings.guard.untrustedBody",
    },
  },
  doctor: {
    title: "doctor.title",
    hint: "doctor.hint",
    commandHint: "doctor.commandHint",
    statusLabel: "doctor.statusLabel",
    status: {
      ok: "doctor.status.ok",
      warn: "doctor.status.warn",
      error: "doctor.status.error",
    },
    summary: {
      status: "doctor.summary.status",
      shell: "doctor.summary.shell",
      activated: "doctor.summary.activated",
      notActivated: "doctor.summary.notActivated",
    },
    updateNotice: {
      title: "doctor.updateNotice.title",
      framing: "doctor.updateNotice.framing",
      copy: "doctor.updateNotice.copy",
      copied: "doctor.updateNotice.copied",
      updateOnHome: "doctor.updateNotice.updateOnHome",
    },
    warnings: {
      title: "doctor.warnings.title",
    },
    configFiles: {
      title: "doctor.configFiles.title",
      none: "doctor.configFiles.none",
    },
    toolset: {
      title: "doctor.toolset.title",
      emptyTitle: "doctor.toolset.emptyTitle",
      emptyBody: "doctor.toolset.emptyBody",
    },
    rawTitle: "doctor.rawTitle",
    error: {
      title: "doctor.error.title",
      body: "doctor.error.body",
    },
    columns: {
      tool: "doctor.columns.tool",
      version: "doctor.columns.version",
    },
  },
  plugins: {
    title: "plugins.title",
    hint: "plugins.hint",
    commandHint: "plugins.commandHint",
    searchPlaceholder: "plugins.searchPlaceholder",
    sections: {
      installed: "plugins.sections.installed",
      registry: "plugins.sections.registry",
    },
    columns: {
      tool: "plugins.columns.tool",
      backends: "plugins.columns.backends",
      description: "plugins.columns.description",
      aliases: "plugins.columns.aliases",
      name: "plugins.columns.name",
      source: "plugins.columns.source",
      actions: "plugins.columns.actions",
    },
    actions: {
      install: "plugins.actions.install",
      uninstall: "plugins.actions.uninstall",
    },
    confirm: {
      uninstall: {
        title: "plugins.confirm.uninstall.title",
        body: "plugins.confirm.uninstall.body",
      },
    },
    installedEmpty: {
      title: "plugins.installedEmpty.title",
      body: "plugins.installedEmpty.body",
    },
    installedError: {
      title: "plugins.installedError.title",
      body: "plugins.installedError.body",
    },
    empty: {
      title: "plugins.empty.title",
      body: "plugins.empty.body",
      searchTitle: "plugins.empty.searchTitle",
      searchBody: "plugins.empty.searchBody",
    },
    error: {
      title: "plugins.error.title",
      body: "plugins.error.body",
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
    latestVersion: "labels.latestVersion",
  },
  errors: {
    miseNotFound: "errors.miseNotFound",
    miseTooOld: "errors.miseTooOld",
    terminalNotFound: "errors.terminalNotFound",
    timeout: "errors.timeout",
    unknown: "errors.unknown",
  },
  languages: {
    english: "languages.english",
    simplifiedChinese: "languages.simplifiedChinese",
    switcherLabel: "languages.switcherLabel",
  },
  theme: {
    switcherLabel: "theme.switcherLabel",
    switcherCurrent: "theme.switcherCurrent",
    light: "theme.light",
    dark: "theme.dark",
  },
} as const;

/** Union of every leaf key path the catalog declares. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type I18nKey = Leaves<typeof I18N_KEYS>;
