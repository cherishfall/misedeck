// Page refresh registration (beta8, issue #98; provider lifted above the
// router in issue #130).
//
// Refresh is a page-level capability owned by the top toolbar
// (ui-ux-rules.md): one shared refresh button lives in the
// DirectoryIndicator strip, and each content page registers a callback
// that invalidates every query the page fetched (the plugins page's one
// callback refreshes both the Registry and the installed list). Pages
// and sections never place their own refresh buttons.
//
// PageRefreshProvider owns the state and is mounted in the app root
// above the router (issue #130): each page renders PageShell inside
// itself, so a provider owned by PageShell sits *below* the page that
// registers — context flows downward only, and the registration would
// silently no-op. Pages call `useRegisterPageRefresh` with a stable
// callback (wrap in `useCallback`). The registration clears on
// unmount so a stale page's callback can never fire.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type PageRefreshCallback = () => void;

interface PageRefreshContextValue {
  refresh: PageRefreshCallback | null;
  setRefresh: (cb: PageRefreshCallback | null) => void;
}

export const PageRefreshContext = createContext<PageRefreshContextValue | null>(null);

/** Owns the page-refresh state; mount once in the app root, inside the
 *  router and above every page (issue #130). */
export function PageRefreshProvider({ children }: { children: ReactNode }) {
  const [refresh, setRefresh] = useState<PageRefreshCallback | null>(null);
  const value = useMemo(() => ({ refresh, setRefresh }), [refresh]);
  return <PageRefreshContext.Provider value={value}>{children}</PageRefreshContext.Provider>;
}

/** Read the currently registered refresh — used by the toolbar button. */
export function usePageRefresh(): PageRefreshCallback | null {
  const ctx = useContext(PageRefreshContext);
  return ctx?.refresh ?? null;
}

/** Register (and on unmount, unregister) the page's refresh callback. */
export function useRegisterPageRefresh(refresh: PageRefreshCallback): void {
  const ctx = useContext(PageRefreshContext);
  const setRefresh = ctx?.setRefresh;
  useEffect(() => {
    if (!setRefresh) return;
    setRefresh(() => refresh);
    return () => setRefresh(null);
  }, [setRefresh, refresh]);
}
