// Empty-state copy dispatch for the settings table (issue #218).
//
// Pure so it can be tested without a DOM: react-query needs a provider
// and the page module imports CSS. The rule is a precedence chain —
// a filter with no matches explains the filter, the `--all` view that is
// still empty means "nothing configured", and the default (explicit
// settings only) view must point at the `--all` switch instead of
// claiming mise has no settings at all.

import { I18N_KEYS } from "../../i18n/keys";

export interface SettingsEmptyCopy {
  titleKey: string;
  bodyKey: string;
}

export function settingsEmptyCopy(input: {
  filterActive: boolean;
  showAll: boolean;
}): SettingsEmptyCopy {
  if (input.filterActive) {
    return {
      titleKey: I18N_KEYS.common.filter.noMatchTitle,
      bodyKey: I18N_KEYS.common.filter.noMatchBody,
    };
  }
  if (input.showAll) {
    return {
      titleKey: I18N_KEYS.settings.empty.title,
      bodyKey: I18N_KEYS.settings.empty.body,
    };
  }
  return {
    titleKey: I18N_KEYS.settings.empty.titleShowAll,
    bodyKey: I18N_KEYS.settings.empty.bodyShowAll,
  };
}
