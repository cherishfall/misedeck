// Shared clipboard write — promoted from the execution panel (issue #89)
// so any surface (the Tooltip copy button, the panel's copy-command)
// lands text on the clipboard the same way.

/** Write text to the clipboard, falling back to a hidden textarea when
 *  the async Clipboard API is unavailable or refused. Returns whether
 *  the copy landed, so the caller only acknowledges real copies. */
export async function writeClipboard(text: string): Promise<boolean> {
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
