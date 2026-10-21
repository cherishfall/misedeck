// Directory context — the single app-level state that says "which directory
// does the user currently want MiseDeck to look at?" Per ADR-0004 the GUI
// surfaces mise's own `cwd` model: defaults to Global, points at any
// directory when the user wants to, and remembers the recent ones.
//
// The Rust side accepts `cwd` per runner call (issue #18), so pages just
// pass `useDirectory().cwd` to the Tauri command.
//
// Validity (issue #214): the persisted context and the recents list both
// outlive the directories they name, so every incoming directory is
// probed once through `directory_exists` (Rust `is_dir`, never the
// process PATH). A missing directory reverts the context to Global and
// raises one banner with a reselect action — pages never each discover
// the problem through their own failed mise query. The first probe after
// a restore gates rendering, so a deleted directory cannot fire a round
// of failing queries before the banner appears.

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

import { probeDirectory } from "../api/directory";
import {
  resolveDirectoryAvailability,
  type DirectoryProbeRecord,
} from "../utils/directoryAvailability";

/**
 * The directory context, as exposed to UI code and to the Tauri command
 * layer. Mirrors the architecture-doc prescription:
 *   enum DirContext { Global, Dir(PathBuf) }
 *   serialized to the frontend as { kind: "global" } | { kind: "dir", path: string }
 */
export type DirContext = { kind: "global" } | { kind: "dir"; path: string };

function isDirContext(value: unknown): value is DirContext {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "global") return true;
  if (v.kind === "dir" && typeof v.path === "string") return true;
  return false;
}

function dirContextToCwd(ctx: DirContext): string | null {
  return ctx.kind === "dir" ? ctx.path : null;
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
  /** The path a probe found missing, surfaced once by the banner;
   *  cleared when the user picks a directory or dismisses the notice. */
  unavailablePath: string | null;
  setContext: (ctx: DirContext) => void;
  setDirectory: (path: string) => void;
  setGlobal: () => void;
  removeRecent: (path: string) => void;
  dismissUnavailable: () => void;
}

const DirectoryContext = createContext<DirectoryContextValue | null>(null);

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<DirContext>(() => loadContext());
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const [probe, setProbe] = useState<DirectoryProbeRecord | null>(null);
  const [unavailablePath, setUnavailablePath] = useState<string | null>(null);
  // Gating only applies to the first probe: a restored directory must
  // resolve before any page mounts, while later switches keep the shell
  // (and any draft state) mounted.
  const [restoring, setRestoring] = useState(() => context.kind === "dir");
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

  useEffect(() => {
    if (context.kind === "global") {
      setProbe(null);
      setRestoring(false);
      return;
    }
    const path = context.path;
    let cancelled = false;
    setProbe({ path, result: "probing" });
    void probeDirectory(path).then((result) => {
      if (cancelled) return;
      setProbe({ path, result });
      setRestoring(false);
      if (result === "missing") {
        setUnavailablePath(path);
        setContextState({ kind: "global" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [context]);

  const setContext = useCallback((ctx: DirContext) => {
    setUnavailablePath(null);
    setContextState(ctx);
  }, []);

  const setDirectory = useCallback((path: string) => {
    setUnavailablePath(null);
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

  const dismissUnavailable = useCallback(() => {
    setUnavailablePath(null);
  }, []);

  const availability = resolveDirectoryAvailability(context, probe);

  const value = useMemo<DirectoryContextValue>(
    () => ({
      context,
      cwd: dirContextToCwd(context),
      recents,
      unavailablePath,
      setContext,
      setDirectory,
      setGlobal,
      removeRecent,
      dismissUnavailable,
    }),
    [
      context,
      recents,
      unavailablePath,
      setContext,
      setDirectory,
      setGlobal,
      removeRecent,
      dismissUnavailable,
    ],
  );

  // A restored directory blocks the first paint only until its probe
  // answers; the probe reads one filesystem stat, so the wait is a frame.
  if (restoring && availability.kind === "probing") return null;

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): DirectoryContextValue {
  const v = useContext(DirectoryContext);
  if (!v) {
    throw new Error("useDirectory must be used inside <DirectoryProvider>");
  }
  return v;
}
