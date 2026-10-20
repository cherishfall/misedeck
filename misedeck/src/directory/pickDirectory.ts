// Shared directory-pick handler.
//
// The DirectoryIndicator strip, the DirectoryPreview page, the
// unavailable-directory banner, and the Tools page's Link form all open
// the same native directory dialog. This is the single implementation so
// the call sites cannot drift (the Link form used to re-implement it
// verbatim).
//
// Cancel and failure are different outcomes (issue #228). The dialog
// plugin *resolves* `null` when the user cancels and only *rejects* when
// the dialog itself failed — plugin missing, window blocked, desktop
// portal refused. Collapsing both into one silent `catch` made a real
// failure indistinguishable from a deliberate cancel: the button looked
// dead and no copy ever appeared. A cancel stays silent (there is nothing
// to explain), while a failure reaches the caller through `onError`,
// already translated, so each call site renders it in the feedback
// channel it already owns.

import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import type { TFunction } from "i18next";

import { I18N_KEYS } from "../i18n/keys";

/** The native dialog: resolves the picked path, or null on cancel. */
export type OpenDirectoryDialog = (title: string) => Promise<string | string[] | null>;

export type DirectoryPickOutcome = "picked" | "cancelled" | "failed";

export interface PickDirectoryOptions {
  /** Called with the translated failure copy when the dialog itself
   *  failed. Cancel never calls it. A caller with no surface to render
   *  into may omit it — the outcome is still returned. */
  onError?: (message: string) => void;
  /** Test seam: substitutes the native dialog. */
  openDialog?: OpenDirectoryDialog;
}

/** Open the native directory picker and hand a confirmed selection to
 *  `onPick`. Returns how the dialog ended. */
export async function pickDirectory(
  t: TFunction,
  onPick: (path: string) => void,
  options: PickDirectoryOptions = {},
): Promise<DirectoryPickOutcome> {
  const open = options.openDialog ?? picker;
  try {
    const picked = await open(t(I18N_KEYS.directory.pickerTitle));
    if (typeof picked === "string" && picked.length > 0) {
      onPick(picked);
      return "picked";
    }
    return "cancelled";
  } catch {
    options.onError?.(t(I18N_KEYS.directory.pickerFailed));
    return "failed";
  }
}

async function picker(title: string): Promise<string | string[] | null> {
  return await openNativeDialog({
    directory: true,
    multiple: false,
    title,
  });
}
