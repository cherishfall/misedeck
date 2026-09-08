// Page refresh registration (beta8, issue #98).
//
// Refresh is a page-level capability owned by the top toolbar
// (ui-ux-rules.md): one shared refresh button lives in the
// DirectoryIndicator strip, and each content page registers a callback
// that invalidates every query the page fetched (the plugins page's one
// callback refreshes both the Registry and the installed list). Pages
// and sections never place their own refresh buttons.
//
// PageShell owns the state; pages call `useRegisterPageRefresh` with a
// stable callback (wrap in `useCallback`). The registration clears on
// unmount so a stale page's callback can never fire.

import { createContext, useContext, useEffect } from "react";

export type PageRefreshCallback = () => void;

interface PageRefreshContextValue {
  refresh: PageRefreshCallback | null;
  setRefresh: (cb: PageRefreshCallback | null) => void;
}

export const PageRefreshContext = createContext<PageRefreshContextValue | null>(null);

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
