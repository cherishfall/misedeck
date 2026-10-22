import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { I18N_KEYS } from "../../i18n/keys";

import { settingsCountCopy } from "./settingsCountCopy";

describe("settingsCountCopy", () => {
  it("renders no hint when there are no rows at all", () => {
    assert.equal(
      settingsCountCopy({ total: 0, filtered: 0, filterActive: false }),
      null,
    );
    assert.equal(
      settingsCountCopy({ total: 0, filtered: 0, filterActive: true }),
      null,
    );
  });

  it("uses the total-only key when the filter is inactive", () => {
    const copy = settingsCountCopy({
      total: 117,
      filtered: 117,
      filterActive: false,
    });
    assert.deepEqual(copy, {
      key: "settings.count",
      params: { count: 117 },
    });
    assert.equal(copy?.key, I18N_KEYS.settings.count);
  });

  it("uses the filtered key with count 0 when nothing matches", () => {
    assert.deepEqual(
      settingsCountCopy({ total: 117, filtered: 0, filterActive: true }),
      {
        key: "settings.countFiltered",
        params: { count: 0, total: 117 },
      },
    );
  });

  it("uses the filtered key with the matching row count", () => {
    assert.deepEqual(
      settingsCountCopy({ total: 117, filtered: 7, filterActive: true }),
      {
        key: "settings.countFiltered",
        params: { count: 7, total: 117 },
      },
    );
  });
});
