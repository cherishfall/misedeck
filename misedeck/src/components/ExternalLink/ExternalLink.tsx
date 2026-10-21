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

import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { inAppShell, openExternalUrl } from "../../api/externalLink";

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
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // A plain browser tab has a browser of its own; let it navigate.
    if (!inAppShell()) return;
    // Suppress the webview's own attempt at `target="_blank"`: it is the
    // dead path this component exists to avoid, and on a platform that
    // honours it the app would end up loading someone else's page.
    event.preventDefault();
    void openExternalUrl(href).catch(() => {
      // Nothing left to try inside the webview — `window.open` is the one
      // call a desktop webview may still honour, and on a plain browser
      // tab it is the correct path anyway. A machine with no default
      // browser stays silent; a global failure notice is the missing
      // piece, tracked in #249.
      window.open(href, "_blank", "noopener,noreferrer");
    });
  };

  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
