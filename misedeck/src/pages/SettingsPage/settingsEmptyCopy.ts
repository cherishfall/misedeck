// Empty-state copy dispatch for the settings table (issue #218).
//
// Pure so it can be tested without a DOM: react-query needs a provider
// and the page module imports CSS. The rule is a precedence chain —
// a filter with no matches explains the filter, the `--all` view that is
// still empty means "nothing configured", and the default (explicit
// settings only) view must point at the `--all` switch instead of
// claiming mise has no settings at all.
//
// Every branch also names the card's own next step (issue #226): an
// empty state that names an action it does not offer leaves the user
// hunting for a control outside the card. The filter branch offers
// none — its body explains the filter and the filter box is in the
// toolbar.

import { I18N_KEYS, type I18nKey } from "../../i18n/keys";

/** The next step the empty card offers inside itself. */
export type SettingsEmptyAction =
  /** Turn on Show all (--all) — the toolbar switch's own action. */
  | { kind: "showAll"; labelKey: I18nKey }
  /** Move focus to the add-setting form below the card. */
  | { kind: "add"; labelKey: I18nKey };

export interface SettingsEmptyCopy {
  titleKey: I18nKey;
  bodyKey: I18nKey;
  /** `null` when the empty state needs no action of its own. */
  action: SettingsEmptyAction | null;
}

export function settingsEmptyCopy(input: {
  filterActive: boolean;
  showAll: boolean;
}): SettingsEmptyCopy {
  if (input.filterActive) {
    return {
      titleKey: I18N_KEYS.common.filter.noMatchTitle,
      bodyKey: I18N_KEYS.common.filter.noMatchBody,
      action: null,
    };
  }
  if (input.showAll) {
    return {
      titleKey: I18N_KEYS.settings.empty.title,
      bodyKey: I18N_KEYS.settings.empty.body,
      action: { kind: "add", labelKey: I18N_KEYS.settings.empty.action },
    };
  }
  return {
    titleKey: I18N_KEYS.settings.empty.titleShowAll,
    bodyKey: I18N_KEYS.settings.empty.bodyShowAll,
    action: { kind: "showAll", labelKey: I18N_KEYS.settings.empty.showAllAction },
  };
}
