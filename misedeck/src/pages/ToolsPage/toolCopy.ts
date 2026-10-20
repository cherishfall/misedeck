// Copy dispatch for the Tools page (issue #213).
//
// Pure so the branches are unit-tested without a DOM: the page module
// imports CSS and needs react-query providers, so the decisions live
// here instead.

import { I18N_KEYS, type I18nKey } from "../../i18n/keys";

/** Write-target disclosure for the Use confirmation: Global mode writes
 *  the global config, Directory mode the current directory's config. */
export function confirmUseBodyKey(cwd: string | null): I18nKey {
  return cwd === null
    ? I18N_KEYS.tools.confirm.use.bodyGlobal
    : I18N_KEYS.tools.confirm.use.bodyDirectory;
}

/** Uninstall confirmation body: an active version keeps its config
 *  request, so the dialog names the consequence instead of reusing the
 *  generic per-version copy. */
export function uninstallConfirmBodyKey(active: boolean): I18nKey {
  return active
    ? I18N_KEYS.tools.confirm.uninstall.bodyActive
    : I18N_KEYS.tools.confirm.uninstall.body;
}

/** Which Tooltip the version-switch cell carries. Zero installed
 *  versions is not "one version installed": the cell still shows the
 *  requested-but-not-installed version, and the tooltip must say there
 *  is nothing to switch between. */
export type VersionTooltipKind = "none" | "single" | "switch";

export function versionTooltipKind(installedCount: number): VersionTooltipKind {
  if (installedCount <= 0) return "none";
  if (installedCount === 1) return "single";
  return "switch";
}

export function versionTooltipKey(kind: VersionTooltipKind): I18nKey {
  switch (kind) {
    case "none":
      return I18N_KEYS.tools.tooltip.noVersion;
    case "single":
      return I18N_KEYS.tools.tooltip.singleVersion;
    case "switch":
      return I18N_KEYS.tools.tooltip.switchVersion;
  }
}
