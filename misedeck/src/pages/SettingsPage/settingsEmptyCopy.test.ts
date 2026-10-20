// Tests for the settings empty-state copy dispatch (issue #218).
// Pure mapping — no DOM, no react-query provider needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import { I18N_KEYS } from "../../i18n/keys";
import { settingsEmptyCopy } from "./settingsEmptyCopy";

test("settingsEmptyCopy: filter wins over everything else", () => {
  assert.deepEqual(settingsEmptyCopy({ filterActive: true, showAll: false }), {
    titleKey: I18N_KEYS.common.filter.noMatchTitle,
    bodyKey: I18N_KEYS.common.filter.noMatchBody,
    action: null,
  });
  assert.deepEqual(settingsEmptyCopy({ filterActive: true, showAll: true }), {
    titleKey: I18N_KEYS.common.filter.noMatchTitle,
    bodyKey: I18N_KEYS.common.filter.noMatchBody,
    action: null,
  });
});

test("settingsEmptyCopy: the default view points at the --all switch", () => {
  const copy = settingsEmptyCopy({ filterActive: false, showAll: false });
  assert.equal(copy.titleKey, I18N_KEYS.settings.empty.titleShowAll);
  assert.equal(copy.bodyKey, I18N_KEYS.settings.empty.bodyShowAll);
});

test("settingsEmptyCopy: an empty --all view means nothing is configured", () => {
  assert.deepEqual(settingsEmptyCopy({ filterActive: false, showAll: true }), {
    titleKey: I18N_KEYS.settings.empty.title,
    bodyKey: I18N_KEYS.settings.empty.body,
    action: { kind: "add", labelKey: I18N_KEYS.settings.empty.action },
  });
});

// Issue #226: the empty card carries the next step it names — the
// switch's own action in the default view, the add form in the --all
// view — instead of pointing at a control outside the card.
test("settingsEmptyCopy: every non-filter empty state offers an in-card action", () => {
  assert.deepEqual(settingsEmptyCopy({ filterActive: false, showAll: false }).action, {
    kind: "showAll",
    labelKey: I18N_KEYS.settings.empty.showAllAction,
  });
  assert.deepEqual(settingsEmptyCopy({ filterActive: false, showAll: true }).action, {
    kind: "add",
    labelKey: I18N_KEYS.settings.empty.action,
  });
});
