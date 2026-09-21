// CopyButton — the shared copy affordance for copyable values (issue
// #107): table cells via Tooltip, the RAW block, paths. One component,
// one feedback pattern — the label flips to "Copied" briefly, and only
// after a real clipboard write (writeClipboard reports failure, so the
// acknowledgement never lies). A failed write flips to "Copy failed"
// instead — copy failure must never be silent (issue #183).

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { writeClipboard } from "../../utils/clipboard";
import styles from "./CopyButton.module.css";

/** How long the "Copied" / "Copy failed" acknowledgement lasts. */
const COPIED_MS = 1200;

export interface CopyButtonProps {
  /** The value placed on the clipboard. */
  text: string;
  /** Extra class for call-site positioning (e.g. overlaying a block). */
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const onCopy = async () => {
    const ok = await writeClipboard(text);
    setCopied(ok);
    setCopyFailed(!ok);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
      timerRef.current = null;
    }, COPIED_MS);
  };

  const label = copyFailed
    ? t(I18N_KEYS.common.copyFailed)
    : copied
      ? t(I18N_KEYS.common.copied)
      : t(I18N_KEYS.tooltip.copy);

  return (
    <button
      type="button"
      className={`${styles.copy}${className ? ` ${className}` : ""}`}
      onClick={() => void onCopy()}
      aria-label={label}
    >
      {label}
    </button>
  );
}
