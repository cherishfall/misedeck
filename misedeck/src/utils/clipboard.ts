// Shared clipboard write — promoted from the execution panel (issue #89)
// so any surface (the Tooltip copy button, the panel's copy-command)
// lands text on the clipboard the same way.
//
// Issue #183: the primary write goes through the Tauri clipboard plugin
// (Rust side), because WKWebView refuses Web Clipboard API writes often
// enough that the old path read as "the button does nothing". The Web
// path is kept as a fallback only for when the plugin call itself fails
// (e.g. running outside Tauri) — a plugin refusal does not fall through,
// so a real failure still reports `false` and the caller can surface it.

import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/** Write text to the clipboard, falling back to a hidden textarea when
 *  the Tauri plugin is unavailable and the async Clipboard API is
 *  unavailable or refused. Returns whether the copy landed, so the
 *  caller only acknowledges real copies. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch {
    // Plugin unavailable (e.g. plain-browser dev) — try the Web path.
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
