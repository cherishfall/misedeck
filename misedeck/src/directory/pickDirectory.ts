// Shared directory-pick handler.
//
// Both the DirectoryIndicator strip and the DirectoryPreview page open
// the same native directory dialog to choose the app-level directory
// context. This is the single implementation so the two call sites
// cannot drift (the page used to re-implement `onPick` verbatim).

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { TFunction } from "i18next";

import { I18N_KEYS } from "../i18n/keys";

/** Open the native directory picker and, on a confirmed selection, switch
 *  the app-level directory context to the chosen path. */
export async function pickDirectory(
  t: TFunction,
  setDirectory: (path: string) => void,
): Promise<void> {
  try {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t(I18N_KEYS.directory.pickerTitle),
    });
    if (typeof picked === "string" && picked.length > 0) {
      setDirectory(picked);
    }
  } catch {
    // User cancelled or dialog failed.
  }
}
