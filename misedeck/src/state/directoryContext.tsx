// Directory context — the single app-level state that says "which directory
// does the user currently want MiseDeck to look at?" Per ADR-0004 the GUI
// surfaces mise's own `cwd` model: defaults to Global, points at any
// directory when the user wants to, and remembers the recent ones.
//
// The Rust side accepts `cwd` per runner call (issue #18), so pages just
// pass `useDirectory().cwd` to the Tauri command.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The directory context, as exposed to UI code and to the Tauri command
 * layer. Mirrors the architecture-doc prescription:
 *   enum DirContext { Global, Dir(PathBuf) }
 *   serialized to the frontend as { kind: "global" } | { kind: "dir", path: string }
 */
export type DirContext = { kind: "global" } | { kind: "dir"; path: string };

export function isDirContext(value: unknown): value is DirContext {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "global") return true;
  if (v.kind === "dir" && typeof v.path === "string") return true;
  return false;
}

export function dirContextToCwd(ctx: DirContext): string | null {
  return ctx.kind === "dir" ? ctx.path : null;
}

/** Display label for the context, used in the bar. */
export function dirContextLabel(ctx: DirContext): string {
  return ctx.kind === "dir" ? ctx.path : "Global";
}

const STORAGE_KEY = "misedeck.directoryContext.v1";
const RECENTS_KEY = "misedeck.directoryRecents.v1";
const MAX_RECENTS = 8;

function loadContext(): DirContext {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kind: "global" };
    const parsed = JSON.parse(raw) as unknown;
    if (isDirContext(parsed)) return parsed;
  } catch {
    // ignore — corrupt localStorage falls back to global
  }
  return { kind: "global" };
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
      return parsed.slice(0, MAX_RECENTS);
    }
  } catch {
    // ignore
  }
  return [];
}

function persistContext(ctx: DirContext) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // ignore
  }
}

function persistRecents(recents: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
  } catch {
    // ignore
  }
}

interface DirectoryContextValue {
  context: DirContext;
  cwd: string | null;
  recents: string[];
  setContext: (ctx: DirContext) => void;
  setDirectory: (path: string) => void;
  setGlobal: () => void;
  removeRecent: (path: string) => void;
}

const DirectoryContext = createContext<DirectoryContextValue | null>(null);

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<DirContext>(() => loadContext());
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  // Avoid writing to localStorage during render.
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    persistContext(context);
    if (context.kind === "dir") {
      setRecents((prev) => {
        const next = [context.path, ...prev.filter((p) => p !== context.path)].slice(0, MAX_RECENTS);
        persistRecents(next);
        return next;
      });
    }
  }, [context]);

  const setContext = useCallback((ctx: DirContext) => {
    setContextState(ctx);
  }, []);

  const setDirectory = useCallback((path: string) => {
    setContextState({ kind: "dir", path });
  }, []);

  const setGlobal = useCallback(() => {
    setContextState({ kind: "global" });
  }, []);

  const removeRecent = useCallback((path: string) => {
    setRecents((prev) => {
      const next = prev.filter((p) => p !== path);
      persistRecents(next);
      return next;
    });
  }, []);

  const value = useMemo<DirectoryContextValue>(
    () => ({
      context,
      cwd: dirContextToCwd(context),
      recents,
      setContext,
      setDirectory,
      setGlobal,
      removeRecent,
    }),
    [context, recents, setContext, setDirectory, setGlobal, removeRecent],
  );

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): DirectoryContextValue {
  const v = useContext(DirectoryContext);
  if (!v) {
    throw new Error("useDirectory must be used inside <DirectoryProvider>");
  }
  return v;
}
