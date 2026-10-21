// The update check's presentation rules, as a pure function (#236).
//
// Kept out of the component so the four states' tone and verb can be
// tested without a DOM — the same seam `settingsEmptyCopy.ts` and
// `envSource.ts` use. Every string names MiseDeck as the subject: `update`
// and `upgrade` already mean mise / a Tool elsewhere in this app.

import { I18N_KEYS, type I18nKey } from "../../i18n/keys";

/** What the panel is currently showing. `version` and `url` only exist
 *  once the feed answered. */
export type UpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | { kind: "available"; version: string; url: string }
  | { kind: "error" };

/** Colour role for the status line — matches the ProgressDot tones. */
export type UpdateTone = "ice" | "grove" | "flare" | "breach";

/** What the panel's action affordance is. `download` renders as a link
 *  to the Release page; the other two as the same in-place button. */
export type UpdateAction = "check" | "retry" | "download";

export interface UpdateSummary {
  /** Status sentence key, or `null` when there is nothing to say yet. */
  statusKey: I18nKey | null;
  statusTone: UpdateTone;
  action: UpdateAction;
  /** The action is running: disable it, keep its label. */
  busy: boolean;
}

export function summarizeCheck(state: UpdateCheckState): UpdateSummary {
  switch (state.kind) {
    case "checking":
      return {
        statusKey: I18N_KEYS.about.checking,
        statusTone: "ice",
        action: "check",
        busy: true,
      };
    case "current":
      return {
        statusKey: I18N_KEYS.about.upToDate,
        statusTone: "grove",
        action: "check",
        busy: false,
      };
    case "available":
      return {
        statusKey: I18N_KEYS.about.available,
        statusTone: "flare",
        action: "download",
        busy: false,
      };
    case "error":
      return {
        statusKey: I18N_KEYS.about.checkFailed,
        statusTone: "breach",
        action: "retry",
        busy: false,
      };
    case "idle":
    default:
      return {
        statusKey: null,
        statusTone: "ice",
        action: "check",
        busy: false,
      };
  }
}
