// ExternalLink — the only way a link may leave the app (#248).
//
// A bare anchor with `target="_blank"` is inert inside the webview: the
// platform refuses to create a window the app never asked for, so the
// click is dropped and the user sees nothing. Every external link in the
// app (the Release page, the mise docs, the download link) went through
// that dead path while the markup was correct.
//
// The element stays a real anchor (`href`, `target`): hover shows the
// URL, the context menu can copy it, Enter activates it, and a
// frontend-only `npm run dev` tab still navigates on its own. Only the
// activation inside the app shell is rerouted, to the one destination
// that actually exists — the OS browser. `src/api/externalLink.ts` holds
// the call, and `src-tauri/src/external_link.rs` holds the scheme check.
//
// When the OS opener rejects, the click must not stay silent (issue
// #262): the component keeps the `window.open` fallback, then renders an
// inline failure that names what happened and keeps the URL copyable.

import { useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { inAppShell, openExternalUrl } from "../../api/externalLink";
import { CopyButton } from "../CopyButton/CopyButton";

import styles from "./ExternalLink.module.css";

export type ExternalLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "target" | "rel"
> & {
  /** Absolute `http(s)` URL. Relative hrefs belong to in-app navigation,
   *  which never uses this component. */
  href: string;
};

export function ExternalLink({
  href,
  onClick,
  children,
  ...rest
}: ExternalLinkProps) {
  const { t } = useTranslation();
  // Storing the failed href (not a boolean) means a changed link starts
  // clean without an effect that would clear state after render.
  const [failedHref, setFailedHref] = useState<string | null>(null);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // A plain browser tab has a browser of its own; let it navigate.
    if (!inAppShell()) return;
    // Suppress the webview's own attempt at `target="_blank"`: it is the
    // dead path this component exists to avoid, and on a platform that
    // honours it the app would end up loading someone else's page.
    event.preventDefault();
    setFailedHref(null);
    void openExternalUrl(href).catch(() => {
      // `window.open` is the one call a desktop webview may still honour
      // (#248); keep it as the last automatic attempt. Whatever it does,
      // the visible failure below is the recoverable path: the URL can
      // still be copied and opened by hand.
      try {
        window.open(href, "_blank", "noopener,noreferrer");
      } finally {
        setFailedHref(href);
      }
    });
  };

  const failed = failedHref === href;

  return (
    <>
      <a href={href} target="_blank" rel="noreferrer" onClick={handleClick} {...rest}>
        {children}
      </a>
      {failed && (
        <span
          className={styles.failure}
          role="alert"
          data-testid="external-link-failure"
        >
          <span>{t(I18N_KEYS.common.externalLinkFailed)}</span>
          <CopyButton text={href} />
        </span>
      )}
    </>
  );
}
