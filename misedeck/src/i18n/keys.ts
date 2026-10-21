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
    /** Pending copy for the outdated check specifically (issue #217):
        the tools table can already be populated while `mise outdated`
        is still running, so a bare "Loading…" there reads as if the
        table itself were loading. */
    outdatedChecking: "common.outdatedChecking",
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
    /** Why ConfirmDialog's confirm button is disabled: the same command
        is still running (issue #227). Rendered as in-dialog copy and
        referenced by the button's aria-describedby, so the disabled
        state always carries its reason. */
    confirmBusy: "common.confirmBusy",
    /** Open-in-browser failure (issue #262): the OS opener rejected, so
        the link did nothing. The failure renders with the URL still
        copyable instead of leaving the click silent. */
    externalLinkFailed: "common.externalLinkFailed",
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
    /** Readable failure copy when the native dialog itself failed
        (issue #228): a cancel is silent, a failure is not. Shared by
        every picker call site, including the Tools page's Link form. */
    pickerFailed: "directory.pickerFailed",
    chooseAnother: "directory.chooseAnother",
    removeRecentLabel: "directory.removeRecentLabel",
    unavailableLabel: "directory.unavailableLabel",
    unavailableBody: "directory.unavailableBody",
    unavailableShort: "directory.unavailableShort",
    unavailableDismiss: "directory.unavailableDismiss",
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
    /** `cancel_run` itself failed, so the run is still going (issue
        #262) — the panel never claims "cancelled" on a failed request. */
    cancelFailed: "execution.cancelFailed",
    dismiss: "execution.dismiss",
    emptyHint: "execution.emptyHint",
    reopen: "execution.reopen",
    reopenRunning: "execution.reopenRunning",
    runsRunning: "execution.runsRunning",
    runsRecent: "execution.runsRecent",
    /** Close one finished run entry from the switcher (issue #180). */
    closeRun: "execution.closeRun",
    /** Accessible name for the panel's top-edge resize handle, a
        focusable separator with ArrowUp / ArrowDown support (issue #257). */
    resizeHandle: "execution.resizeHandle",
    /**
     * Working-directory context line paired with the terminal-perspective
     * echo in Global mode, where the echo omits `-C $HOME` (issue #191).
     */
    workingDirHome: "execution.workingDirHome",
  },
  /** The global failure surface (issue #249). The body is the generic
      sentence used when a rejected command carries no displayable
      detail; an AppError's resolved message takes its place. */
  failureNotice: {
    label: "failureNotice.label",
    body: "failureNotice.body",
    dismiss: "failureNotice.dismiss",
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
    /** `activated: null` gets its own banner (issue #262): the probe
        could not decide, which is not the same claim as "not
        activated". */
    bannerLabelUnverified: "activation.bannerLabelUnverified",
    bannerBodyUnverified: "activation.bannerBodyUnverified",
    /** Probe error banner (issue #262): the check itself failed; the
        action retries it instead of silently claiming a state. */
    errorLabel: "activation.errorLabel",
    errorBody: "activation.errorBody",
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
          action — distinct wording from the `untrusted` banner. The
          banner retries the probe in place (issue #262). */
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
      /** Zero installed versions (issue #213): the version cell still
          names the requested-but-not-installed version, so the tooltip
          must not claim "only one version installed". */
      noVersion: "tools.tooltip.noVersion",
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
      /** Body used when mise wrote no stderr, so the card does not
          promise a block below (V-7, issue #262). */
      bodyNoStderr: "tools.error.bodyNoStderr",
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
        /** Write-target disclosure split per mode (issue #213): the
            command writes the global config in Global mode and the
            current directory's config otherwise. */
        bodyGlobal: "tools.confirm.use.bodyGlobal",
        bodyDirectory: "tools.confirm.use.bodyDirectory",
      },
      install: {
        title: "tools.confirm.install.title",
        body: "tools.confirm.install.body",
      },
      uninstall: {
        title: "tools.confirm.uninstall.title",
        body: "tools.confirm.uninstall.body",
        /** The version being uninstalled is the active one (issue
            #213): the config request survives, so name what breaks. */
        bodyActive: "tools.confirm.uninstall.bodyActive",
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
      /** The `latest` alias row's tooltip: mise's alias resolved to the
          concrete version it selects (item 3 of #258). */
      latestAlias: "tools.addTool.latestAlias",
      /** Why the in-use row's Uninstall is disabled: the requested
          version has no files on disk yet (beta13). */
      notInstalledUninstallTooltip: "tools.addTool.notInstalledUninstallTooltip",
      /** Directory mode's in-use header note (issue #213): the tool is
          also active through the global config, so the two requests
          coexist after a directory-level Use. */
      globalAlsoActive: "tools.addTool.globalAlsoActive",
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
    /** Page-head title split per mode (#201 decision 2): the nav
     *  label is the stable spatial anchor, the page head describes
     *  the content, so the head follows `cwd === null`. */
    titleGlobal: "preview.titleGlobal",
    titleDirectory: "preview.titleDirectory",
    hint: "preview.hint",
    hintGlobal: "preview.hintGlobal",
    commandHint: "preview.commandHint",
    /** Mode-neutral nav label (#201 decision 3): a navigation entry
     *  is a spatial anchor and must not rename per mode — and this
     *  retires the app's only Title Case multi-word heading. */
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
      /** Empty-state copy split per mode (#201): which config files
          `mise config ls` reports depends on `cwd === null`. */
      emptyGlobal: "preview.config.emptyGlobal",
      emptyDirectory: "preview.config.emptyDirectory",
      view: "preview.config.view",
      hide: "preview.config.hide",
      unreadable: "preview.config.unreadable",
      overrideBadge: "preview.config.overrideBadge",
      errorTitle: "preview.config.errorTitle",
      errorBody: "preview.config.errorBody",
      /** No-stderr variant (V-7, issue #262). */
      errorBodyNoStderr: "preview.config.errorBodyNoStderr",
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
      /** No-stderr variant (V-7, issue #262). */
      errorBodyNoStderr: "preview.env.errorBodyNoStderr",
    },
    toolsError: {
      title: "preview.toolsError.title",
      body: "preview.toolsError.body",
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "preview.toolsError.bodyNoStderr",
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
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "env.error.bodyNoStderr",
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
      /** Out-of-scope warning split per mode (#201): a confirm is a
          write-target sentence, so it names the actual target config
          instead of the neutral「写入范围」wording (ADR-0008 term
          stays reserved for informative copy). */
      outOfScopeWarningGlobal: "env.confirm.outOfScopeWarningGlobal",
      outOfScopeWarningDirectory: "env.confirm.outOfScopeWarningDirectory",
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
    /** Transient row-level failure marker after `mise run` fails
     *  (issue #213) — reuses the run chip's fail tone. */
    runFailedBadge: "tasks.runFailedBadge",
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
      /** Help copy split per mode (#201): the config file the task
          names live in is the global one in Global mode, the current
          directory's otherwise. */
      dependsHelpGlobal: "tasks.editForm.dependsHelpGlobal",
      dependsHelpDirectory: "tasks.editForm.dependsHelpDirectory",
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
      /** The run affordance's optional arguments field (issue #260):
          words are split client-side and passed after `--` verbatim. */
      run: {
        title: "tasks.confirm.run.title",
        body: "tasks.confirm.run.body",
        argsLabel: "tasks.confirm.run.argsLabel",
        argsPlaceholder: "tasks.confirm.run.argsPlaceholder",
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
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "tasks.readError.bodyNoStderr",
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
      /** The `--all` view's next step, offered inside the empty card
          (issue #226): focus the add form below. */
      action: "settings.empty.action",
      /** Default (`--all` off) view with nothing explicitly configured:
          mise's defaults still apply, so the copy points at the switch
          instead of claiming there are no settings (issue #218). */
      titleShowAll: "settings.empty.titleShowAll",
      bodyShowAll: "settings.empty.bodyShowAll",
      /** The default view's next step, inside the card: the switch's own
          action, reachable without hunting for it above (issue #226). */
      showAllAction: "settings.empty.showAllAction",
    },
    error: {
      title: "settings.error.title",
      body: "settings.error.body",
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "settings.error.bodyNoStderr",
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
      /** `activated: null` from the probe — its own claim (issue #262),
          never rendered as "not activated". */
      activationUnknown: "doctor.summary.activationUnknown",
      /** The probe itself failed; the row offers a retry (issue #262). */
      activationFailed: "doctor.summary.activationFailed",
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
    errors: {
      title: "doctor.errors.title",
    },
    configFiles: {
      title: "doctor.configFiles.title",
      none: "doctor.configFiles.none",
    },
    toolset: {
      title: "doctor.toolset.title",
      emptyTitle: "doctor.toolset.emptyTitle",
      /** Empty-state copy split per mode (#201): doctor resolves the
          global toolset in Global mode, the directory's otherwise. */
      emptyBodyGlobal: "doctor.toolset.emptyBodyGlobal",
      emptyBodyDirectory: "doctor.toolset.emptyBodyDirectory",
    },
    rawTitle: "doctor.rawTitle",
    /** The copyable whole report (#238): a header naming the running
        MiseDeck build, then the mise doctor content verbatim. */
    report: {
      copy: "doctor.report.copy",
      header: "doctor.report.header",
    },
    error: {
      title: "doctor.error.title",
      body: "doctor.error.body",
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "doctor.error.bodyNoStderr",
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
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "plugins.installedError.bodyNoStderr",
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
      /** Package-manager installs cannot self-update (issue #213): the
          fallback points at the package manager, the guided installer,
          or the manual install guide. */
      packageManagerHint: "states.tooOld.packageManagerHint",
    },
    commandFailed: {
      title: "states.commandFailed.title",
      body: "states.commandFailed.body",
      /** No-stderr variant (V-7, issue #262). */
      bodyNoStderr: "states.commandFailed.bodyNoStderr",
    },
    /** The detection query was rejected at the IPC layer — there is no
        AppError union to classify, so the page renders its own failure
        card with a retry instead of spinning forever (issue #262). */
    probeFailed: {
      title: "states.probeFailed.title",
      body: "states.probeFailed.body",
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
  errorBoundary: {
    title: "errorBoundary.title",
    label: "errorBoundary.label",
    body: "errorBoundary.body",
    homeButton: "errorBoundary.homeButton",
    detailsLabel: "errorBoundary.detailsLabel",
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
    /** The native title bar could not follow the page theme (issue
        #262). The page theme still changes; this only says the window
        chrome may diverge. */
    chromeFailedLabel: "theme.chromeFailedLabel",
    chromeFailedBody: "theme.chromeFailedBody",
    chromeFailedDismiss: "theme.chromeFailedDismiss",
  },
  /** The app's own identity (#234/#235). Every string names MiseDeck as
      the subject on purpose: `update`, `upgrade`, `release` and
      `new version` already mean mise / a Tool elsewhere in this catalog,
      so a bare verb here would be ambiguous. The version string itself is
      data — it is never translated and never captioned "Version". */
  about: {
    name: "about.name",
    triggerLabel: "about.triggerLabel",
    /** The version line while a newer build is known (#238): names the
        newer build, so the dot is never the only signal. */
    triggerLabelUpdate: "about.triggerLabelUpdate",
    panelLabel: "about.panelLabel",
    check: "about.check",
    checking: "about.checking",
    upToDate: "about.upToDate",
    available: "about.available",
    checkFailed: "about.checkFailed",
    download: "about.download",
    releasePage: "about.releasePage",
  },
} as const;

/** Union of every leaf key path the catalog declares. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type I18nKey = Leaves<typeof I18N_KEYS>;
