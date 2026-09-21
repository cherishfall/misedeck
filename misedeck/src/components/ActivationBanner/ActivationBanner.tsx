// ActivationBanner — the shell-activation callout (issue #28).
//
// Surfaces three affordances:
//   1. A "Copy the line" button that copies the
//      `eval "$(mise activate <shell>)"` one-liner (or the
//      fish / pwsh equivalent) to the clipboard.
//   2. A "Dismiss" button that hides the banner for the
//      active shell. The dismissed flag is per-shell and
//      persisted in localStorage by the activation context.
//   3. The banner body itself names the shell and the rc
//      file so the user knows what to edit and where.
//
// The banner only renders when the activation probe reports
// `activated = false` (i.e. the rc file does NOT contain
// `mise activate`) and the user has not dismissed the
// current shell. When the probe is still loading or the
// shell is unknown, the banner shows a soft, message-only
// variant so the user is never blind to the configuration
// state.

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import {
  shellDisplayName,
  useActivation,
} from "../../state/activationContext";

import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";
import { writeClipboard } from "../../utils/clipboard";

import styles from "./ActivationBanner.module.css";

export function ActivationBanner() {
  const { t } = useTranslation();
  const {
    state,
    dismissed,
    dismissBanner,
    activationLine,
  } = useActivation();
  // The transient "copied" / "copy failed" hints that flash after the
  // copy button is pressed. Resets on its own after 1.5s. A failed copy
  // must not be silent (issue #183).
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // Only render when the probe has resolved. While loading or
  // on error we stay quiet — the page is otherwise usable,
  // and a banner that re-appears on every page refresh
  // becomes noise.
  if (state.kind !== "ok") return null;
  const status = state.status;

  // Already activated — the banner stays hidden forever.
  if (status.activated) return null;

  // Unknown shell — show a softer message that doesn't name
  // a specific rc file. We still surface the line; the
  // "Copy" button is the most useful action.
  if (status.shell.kind === "unknown") {
    if (dismissed) return null;
    const line = activationLine(status);
    return (
      <div className={styles.wrap}>
        <Banner
          tone="info"
          label={t(I18N_KEYS.activation.bannerLabel)}
          action={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(line, setCopied, setCopyFailed)}
                data-testid="activation-banner-copy-line"
              >
                {copyFailed
                  ? t(I18N_KEYS.common.copyFailed)
                  : copied
                    ? t(I18N_KEYS.common.copied)
                    : t(I18N_KEYS.activation.copyLineButton)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissBanner}
                data-testid="activation-banner-dismiss"
              >
                {t(I18N_KEYS.activation.dismissButton)}
              </Button>
            </>
          }
        >
          {t(I18N_KEYS.activation.bannerBodyUnknownShell, {
            name: status.shell.name,
          })}
          <div className={styles.linePreview}>{line}</div>
        </Banner>
      </div>
    );
  }

  // Known shell, not activated, not dismissed — the full
  // banner with the rc path and the line preview.
  if (dismissed) return null;
  const line = activationLine(status);
  const shellName = shellDisplayName(status.shell);
  return (
    <div className={styles.wrap}>
      <Banner
        tone="info"
        label={t(I18N_KEYS.activation.bannerLabel)}
        action={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copyToClipboard(line, setCopied, setCopyFailed)}
              data-testid="activation-banner-copy-line"
            >
              {copyFailed
                ? t(I18N_KEYS.common.copyFailed)
                : copied
                  ? t(I18N_KEYS.common.copied)
                  : t(I18N_KEYS.activation.copyLineButton)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissBanner}
              data-testid="activation-banner-dismiss"
            >
              {t(I18N_KEYS.activation.dismissButton)}
            </Button>
          </>
        }
      >
        {t(I18N_KEYS.activation.bannerBody, {
          shell: shellName,
          rcPath: status.rcPath || "—",
        })}
        <div className={styles.linePreview}>{line}</div>
      </Banner>
    </div>
  );
}

async function copyToClipboard(
  text: string,
  onCopied: (v: boolean) => void,
  onCopyFailed: (v: boolean) => void,
): Promise<void> {
  const ok = await writeClipboard(text);
  onCopied(ok);
  onCopyFailed(!ok);
  window.setTimeout(() => {
    onCopied(false);
    onCopyFailed(false);
  }, 1500);
}
