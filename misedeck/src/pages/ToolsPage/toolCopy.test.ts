import assert from "node:assert/strict";
import { test } from "node:test";

import { I18N_KEYS } from "../../i18n/keys";
import {
  confirmUseBodyKey,
  uninstallConfirmBodyKey,
  versionTooltipKey,
  versionTooltipKind,
} from "./toolCopy";

test("use confirmation names the global config in Global mode", () => {
  assert.equal(confirmUseBodyKey(null), I18N_KEYS.tools.confirm.use.bodyGlobal);
});

test("use confirmation names the directory config in Directory mode", () => {
  assert.equal(
    confirmUseBodyKey("/Users/me/project"),
    I18N_KEYS.tools.confirm.use.bodyDirectory,
  );
});

test("uninstall confirmation discloses an active version", () => {
  assert.equal(
    uninstallConfirmBodyKey(true),
    I18N_KEYS.tools.confirm.uninstall.bodyActive,
  );
  assert.equal(
    uninstallConfirmBodyKey(false),
    I18N_KEYS.tools.confirm.uninstall.body,
  );
});

test("version tooltip distinguishes zero, one, and many installed versions", () => {
  assert.equal(versionTooltipKind(0), "none");
  assert.equal(versionTooltipKey("none"), I18N_KEYS.tools.tooltip.noVersion);
  assert.equal(versionTooltipKind(1), "single");
  assert.equal(versionTooltipKey("single"), I18N_KEYS.tools.tooltip.singleVersion);
  assert.equal(versionTooltipKind(2), "switch");
  assert.equal(versionTooltipKey("switch"), I18N_KEYS.tools.tooltip.switchVersion);
});
