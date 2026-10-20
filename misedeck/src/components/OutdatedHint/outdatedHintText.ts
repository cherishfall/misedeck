// Copy dispatch for the shared outdated hint (issue #217).
//
// Lives outside the component module so the mapping stays testable in
// node:test (no CSS-module import). The pending state has its own copy:
// the tools table can already be populated while `mise outdated` is
// still running, so a bare "Loading…" there reads as if the table
// itself were loading.

import { I18N_KEYS } from "../../i18n/keys";

/** The upstream query state, dispatched explicitly by the consumer —
 *  a `null` count must never double as "loading" (issue #199). */
export type OutdatedHintStatus = "loading" | "ok" | "error";

/** Which copy a given state renders. */
export function outdatedHintKey(status: OutdatedHintStatus, count: number): string {
  if (status === "loading") return I18N_KEYS.common.outdatedChecking;
  if (status === "error") return I18N_KEYS.common.outdatedError;
  return count > 0 ? I18N_KEYS.common.outdatedCount : I18N_KEYS.common.allUpToDate;
}
