// Count-hint dispatch for the settings table (issue #226, filter-aware
// in #280).
//
// Pure so the three branches are unit-tested without a DOM: react-query
// needs a provider and the page module imports CSS.
//
// A count of zero above the empty-state card says "there is nothing"
// twice — the card below already carries that fact and the next step,
// so a zero total renders no hint at all. The filtered count still
// renders: "0 of 12 settings" is information about the filter, not a
// second empty state.

import { I18N_KEYS, type I18nKey } from "../../i18n/keys";

export interface SettingsCountCopy {
  key: I18nKey;
  /** `count` is the number the phrase counts (filtered rows or the
   *  total); `total` is present only on the filtered phrase. */
  params: { count: number; total?: number };
}

export function settingsCountCopy(input: {
  total: number;
  filtered: number;
  filterActive: boolean;
}): SettingsCountCopy | null {
  if (input.total === 0) return null;
  if (input.filterActive) {
    return {
      key: I18N_KEYS.settings.countFiltered,
      params: { count: input.filtered, total: input.total },
    };
  }
  return {
    key: I18N_KEYS.settings.count,
    params: { count: input.total },
  };
}
