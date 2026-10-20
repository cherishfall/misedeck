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
  });
  assert.deepEqual(settingsEmptyCopy({ filterActive: true, showAll: true }), {
    titleKey: I18N_KEYS.common.filter.noMatchTitle,
    bodyKey: I18N_KEYS.common.filter.noMatchBody,
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
  });
});
