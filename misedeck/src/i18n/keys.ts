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
    cancel: "common.cancel",
    save: "common.save",
    refresh: "common.refresh",
    loading: "common.loading",
    back: "common.back",
    clear: "common.clear",
    /** The transient "Copied" confirmation shown by every copy
        affordance — one shared key (issue #171); was duplicated as
        `execution.copied` / `tooltip.copied` / `activation.copiedHint`. */
    copied: "common.copied",
    /** The transient "Copy failed" acknowledgement shown by every copy
        affordance when the clipboard write did not land — copy failure
        must never be silent (issue #183). */
    copyFailed: "common.copyFailed",
    outdatedCount: "common.outdatedCount",
    allUpToDate: "common.allUpToDate",
    /** Failure copy for the shared outdated hint: the query failed, so
        the hint must render failure + a retry entry, never a loading
        that never resolves (issue #199). */
    outdatedError: "common.outdatedError",
    /** Generic failure copy for any toolbar hint backed by a react-query
        read (issue #204): same four-state contract as the outdated hint —
        failure renders as failure + retry, never as a fake loading. */
    loadFailed: "common.loadFailed",
    retry: "common.retry",
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
    /** In-progress label for the guided-install button (issue #166). */
    guidedInstallInstalling: "miseManagement.guidedInstallInstalling",
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
    cancel: "execution.cancel",
    dismiss: "execution.dismiss",
    emptyHint: "execution.emptyHint",
    reopen: "execution.reopen",
    reopenRunning: "execution.reopenRunning",
    runsRunning: "execution.runsRunning",
    runsRecent: "execution.runsRecent",
    /** Close one finished run entry from the switcher (issue #180). */
    closeRun: "execution.closeRun",
    /**
     * Working-directory context line paired with the terminal-perspective
     * echo in Global mode, where the echo omits `-C $HOME` (issue #191).
     */
    workingDirHome: "execution.workingDirHome",
  },
  tooltip: {
    copy: "tooltip.copy",
  },
  activation: {
    openInTerminalLabel: "activation.openInTerminalLabel",
    openInTerminalError: "activation.openInTerminalError",
    openInTerminalSuccess: "activation.openInTerminalSuccess",
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
    /** The ready-state disclosure label for the raw `mise version
     *  --json` payload (beta11 Q3). */
    rawLabel: "home.rawLabel",
    success: {
      selfUpdated: "home.success.selfUpdated",
    },
  },
  trust: {
    banner: {
      label: "trust.banner.label",
      body: "trust.banner.body",
      action: "trust.banner.action",
      /** The muted error-state banner (issue #202): the trust probe
          itself failed, so writes are disabled without a Trust
          action — distinct wording from the `untrusted` banner. */
      errorLabel: "trust.banner.errorLabel",
      errorBody: "trust.banner.errorBody",
    },
    busy: "trust.busy",
    error: "trust.error",
    success: "trust.success",
  },
  tools: {
    title: "tools.title",
    hint: "tools.hint",
    hintGlobal: "tools.hintGlobal",
    commandHint: "tools.commandHint",
    columns: {
      tool: "tools.columns.tool",
      version: "tools.columns.version",
      requested: "tools.columns.requested",
      backend: "tools.columns.backend",
      source: "tools.columns.source",
      actions: "tools.columns.actions",
    },
    orphan: {
      badge: "tools.orphan.badge",
      tooltip: "tools.orphan.tooltip",
    },
    tooltip: {
      switchVersion: "tools.tooltip.switchVersion",
      singleVersion: "tools.tooltip.singleVersion",
    },
    /** The in-cell chip naming the newest version on an outdated row
     *  (#189): pure information, not a control. */
    upgradeChip: "tools.upgradeChip",
    empty: {
      title: "tools.empty.title",
      body: "tools.empty.body",
    },
    missing: {
      title: "tools.missing.title",
      body: "tools.missing.body",
    },
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
      /** The main-table action cell's single button (#189): navigates
       *  to the version-management region — distinct from the region's
       *  own title (`addTool.title`) even though the words match. */
      manageVersions: "tools.actions.manageVersions",
    },
    confirm: {
      use: {
        title: "tools.confirm.use.title",
        body: "tools.confirm.use.body",
      },
      install: {
        title: "tools.confirm.install.title",
        body: "tools.confirm.install.body",
      },
      uninstall: {
        title: "tools.confirm.uninstall.title",
        body: "tools.confirm.uninstall.body",
      },
      unuse: {
        title: "tools.confirm.unuse.title",
        body: "tools.confirm.unuse.body",
      },
      upgrade: {
        title: "tools.confirm.upgrade.title",
        body: "tools.confirm.upgrade.body",
      },
      link: {
        directoryNotFound: "tools.confirm.link.directoryNotFound",
      },
    },
    guard: {
      untrustedBody: "tools.guard.untrustedBody",
    },
    success: {
      used: "tools.success.used",
      installed: "tools.success.installed",
      upgraded: "tools.success.upgraded",
      uninstalled: "tools.success.uninstalled",
      unused: "tools.success.unused",
      linked: "tools.success.linked",
    },
    addTool: {
      title: "tools.addTool.title",
      searchPlaceholder: "tools.addTool.searchPlaceholder",
      noMatches: "tools.addTool.noMatches",
      moreMatches: "tools.addTool.moreMatches",
      inUseTitle: "tools.addTool.inUseTitle",
      installedTitle: "tools.addTool.installedTitle",
      notInstalledTitle: "tools.addTool.notInstalledTitle",
      activeBadge: "tools.addTool.activeBadge",
      created: "tools.addTool.created",
      filterPlaceholder: "tools.addTool.filterPlaceholder",
      /** Why the in-use row's Uninstall is disabled: the requested
          version has no files on disk yet (beta13). */
      notInstalledUninstallTooltip: "tools.addTool.notInstalledUninstallTooltip",
      /** The in-use section header hint naming the upgrade target
          version from `mise outdated` (beta13). */
      upgradeAvailable: "tools.addTool.upgradeAvailable",
      /** In-use empty state: explanatory copy only, no action
          buttons (beta13 batch-operation ban). */
      emptyInUse: "tools.addTool.emptyInUse",
      emptyInstalledTitle: "tools.addTool.emptyInstalledTitle",
      emptyInstalledBody: "tools.addTool.emptyInstalledBody",
      emptyAvailableTitle: "tools.addTool.emptyAvailableTitle",
      emptyAvailableBody: "tools.addTool.emptyAvailableBody",
    },
    linkForm: {
      title: "tools.linkForm.title",
      explanation: "tools.linkForm.explanation",
      toolPlaceholder: "tools.linkForm.toolPlaceholder",
      versionPlaceholder: "tools.linkForm.versionPlaceholder",
      noPath: "tools.linkForm.noPath",
      duplicateVersion: "tools.linkForm.duplicateVersion",
    },
    advanced: {
      title: "tools.advanced.title",
    },
    queries: {
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
    hintGlobal: "preview.hintGlobal",
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
    hintGlobal: "env.hintGlobal",
    commandHint: "env.commandHint",
    listTitle: "env.listTitle",
    filterPlaceholder: "env.filterPlaceholder",
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
      /** Write-target copy split per mode (#201): in Global mode the
          write lands in the global config (`mise set -g`), not the
          current directory's config file. */
      bodyGlobal: "env.empty.bodyGlobal",
      bodyDirectory: "env.empty.bodyDirectory",
    },
    error: {
      title: "env.error.title",
      body: "env.error.body",
    },
    addLabel: "env.addLabel",
    addButton: "env.addButton",
    editButton: "env.editButton",
    unsetButton: "env.unsetButton",
    namePlaceholder: "env.namePlaceholder",
    valuePlaceholder: "env.valuePlaceholder",
    guard: {
      untrustedBody: "env.guard.untrustedBody",
    },
    tooltip: {
      tool: "env.tooltip.tool",
      default: "env.tooltip.default",
      configTool: "env.tooltip.configTool",
    },
    confirm: {
      unset: {
        title: "env.confirm.unset.title",
        bodyGlobal: "env.confirm.unset.bodyGlobal",
        bodyDirectory: "env.confirm.unset.bodyDirectory",
      },
      overwrite: {
        title: "env.confirm.overwrite.title",
        body: "env.confirm.overwrite.body",
      },
      rename: {
        title: "env.confirm.rename.title",
        body: "env.confirm.rename.body",
      },
      renameOverwrite: {
        title: "env.confirm.renameOverwrite.title",
        body: "env.confirm.renameOverwrite.body",
      },
      update: {
        title: "env.confirm.update.title",
        body: "env.confirm.update.body",
      },
      outOfScopeWarning: "env.confirm.outOfScopeWarning",
    },
    success: {
      set: "env.success.set",
      /** Removal-source copy split per mode (#201), same split as
          `env.confirm.unset` (a1dd173): which config loses the key
          depends on `cwd === null`. */
      unsetGlobal: "env.success.unsetGlobal",
      unsetDirectory: "env.success.unsetDirectory",
    },
  },
  tasks: {
    title: "tasks.title",
    subtitle: "tasks.subtitle",
    subtitleGlobal: "tasks.subtitleGlobal",
    commandHint: "tasks.commandHint",
    filterPlaceholder: "tasks.filterPlaceholder",
    count: "tasks.count",
    countFiltered: "tasks.countFiltered",
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
      addTask: "tasks.empty.addTask",
    },
    runButton: "tasks.runButton",
    editButton: "tasks.editButton",
    openInEditorButton: "tasks.openInEditorButton",
    editForm: {
      title: "tasks.editForm.title",
      addTitle: "tasks.editForm.addTitle",
      namePlaceholder: "tasks.editForm.namePlaceholder",
      runLabel: "tasks.editForm.runLabel",
      runPlaceholder: "tasks.editForm.runPlaceholder",
      descriptionPlaceholder: "tasks.editForm.descriptionPlaceholder",
      dependsLabel: "tasks.editForm.dependsLabel",
      dependsPlaceholder: "tasks.editForm.dependsPlaceholder",
      dependsHelp: "tasks.editForm.dependsHelp",
      saveButton: "tasks.editForm.saveButton",
      cancelButton: "tasks.editForm.cancelButton",
      runRequired: "tasks.editForm.runRequired",
      nameRequired: "tasks.editForm.nameRequired",
      runReadonlyTooltip: "tasks.editForm.runReadonlyTooltip",
    },
    confirm: {
      flattenRun: {
        title: "tasks.confirm.flattenRun.title",
        body: "tasks.confirm.flattenRun.body",
      },
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
    success: {
      saved: "tasks.success.saved",
      added: "tasks.success.added",
    },
  },
  settings: {
    title: "settings.title",
    hint: "settings.hint",
    hintGlobal: "settings.hintGlobal",
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
    editButton: "settings.editButton",
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
    confirm: {
      overwrite: {
        title: "settings.confirm.overwrite.title",
        body: "settings.confirm.overwrite.body",
      },
      unset: {
        title: "settings.confirm.unset.title",
        bodyGlobal: "settings.confirm.unset.bodyGlobal",
        bodyDirectory: "settings.confirm.unset.bodyDirectory",
      },
    },
    tooltip: {
      objectReadOnly: "settings.tooltip.objectReadOnly",
      unsetOutOfScope: "settings.tooltip.unsetOutOfScope",
      unsetDefault: "settings.tooltip.unsetDefault",
    },
    success: {
      set: "settings.success.set",
      /** Removal-source copy split per mode (#201), same split as
          `settings.confirm.unset` (a1dd173): which config loses the
          key depends on `cwd === null`. */
      unsetGlobal: "settings.success.unsetGlobal",
      unsetDirectory: "settings.success.unsetDirectory",
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
    },
    /** The mise-missing empty state (issue #171): "health check"
        wording — `tools.missing.*` promises tool listing, which a
        doctor page never does. */
    missing: {
      title: "doctor.missing.title",
      body: "doctor.missing.body",
    },
    summary: {
      status: "doctor.summary.status",
      shell: "doctor.summary.shell",
      activated: "doctor.summary.activated",
      activatedValue: "doctor.summary.activatedValue",
      notActivated: "doctor.summary.notActivated",
      /** Label-colon format, locale-owned (issue #171) — zh uses the
          fullwidth colon, mirroring `theme.switcherCurrent`. */
      labelWithColon: "doctor.summary.labelWithColon",
    },
    updateNotice: {
      title: "doctor.updateNotice.title",
      framing: "doctor.updateNotice.framing",
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
    sections: {
      installed: "plugins.sections.installed",
    },
    columns: {
      name: "plugins.columns.name",
      source: "plugins.columns.source",
      actions: "plugins.columns.actions",
    },
    actions: {
      uninstall: "plugins.actions.uninstall",
      install: "plugins.actions.install",
    },
    installForm: {
      title: "plugins.installForm.title",
      explanation: "plugins.installForm.explanation",
      namePlaceholder: "plugins.installForm.namePlaceholder",
      urlPlaceholder: "plugins.installForm.urlPlaceholder",
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
      action: "plugins.installedEmpty.action",
    },
    installedError: {
      title: "plugins.installedError.title",
      body: "plugins.installedError.body",
    },
    success: {
      uninstalled: "plugins.success.uninstalled",
      installed: "plugins.success.installed",
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
