// Trust context — the read-only side of the trust UX (issue #25).
//
//   * `useTrust()`           — the current trust state for the cwd
//   * `useTrustAction()`     — the one-click `mise trust` action,
//                              wired to the execution panel; on Ok
//                              it invalidates the trust query so
//                              the banner re-evaluates
//   * `useTrustGuard()`      — the gate future mutation buttons
//                              (#22, #26, #27) consult before running;
//                              returns `{ allowed, reason }` so the
//                              caller can scroll the user to the
//                              trust banner instead of executing
//
// The trust probe is read-only (`mise trust --show`) and the only
// signal is the body of stdout. The runner shapes it as
// `TrustSource` (configTrusted / configUntrusted / noConfig); the
// UI adds the `unknown` and `error` states on top so the page can
// render a "loading" dot and a real error block without having to
// pattern-match on TanStack Query's internal lifecycle.
//
//   * `unknown`     — the query hasn't resolved yet (initial
//                      load or a refetch in flight).
//   * `trusted`     — a `mise.toml` is in scope and is trusted;
//                      the banner stays hidden.
//   * `untrusted`   — a `mise.toml` is in scope but not trusted;
//                      the banner is rendered and mutations are
//                      gated by `useTrustGuard()`.
//   * `noConfig`    — no `mise.toml` is in scope; nothing to trust;
//                      the banner stays hidden and mutations are
//                      allowed.
//   * `error`       — the probe failed (mise missing, IPC error,
//                      etc.); the trust gate errs on the side of
//                      safety and reports `allowed: false`, but
//                      the banner is not shown because the page
//                      likely can't talk to mise anyway.

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
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { trustCheck } from "../api/mise";
import { useExecutionContext } from "../components/ExecutionPanel";
import { useDirectory } from "./directoryContext";
import type { TrustSource, TrustStatus } from "../types/tauri";

export type TrustState =
  | { kind: "unknown" }
  | { kind: "trusted"; source: TrustSource; path: string }
  | { kind: "untrusted"; source: TrustSource; path: string }
  | { kind: "noConfig"; source: TrustSource; path: string }
  | { kind: "error"; message: string };

interface TrustContextValue {
  state: TrustState;
}

const TrustContext = createContext<TrustContextValue | null>(null);

/** Map the Rust `TrustResult` (or thrown IPC error) into the UI's
 *  `TrustState`. Exported for unit tests / debugging. */
export function toTrustState(value: unknown): TrustState {
  if (value === null || value === undefined) return { kind: "unknown" };
  if (typeof value !== "object") return { kind: "error", message: "unexpected response" };
  const v = value as { kind?: string; ok?: TrustStatus; err?: { message?: string } };
  if (v.kind === "ok" && v.ok) {
    const source = v.ok.source;
    if (source === "configTrusted") {
      return { kind: "trusted", source, path: v.ok.path };
    }
    if (source === "configUntrusted") {
      return { kind: "untrusted", source, path: v.ok.path };
    }
    return { kind: "noConfig", source, path: v.ok.path };
  }
  if (v.kind === "err" && v.err) {
    return { kind: "error", message: v.err.message ?? "unknown" };
  }
  return { kind: "error", message: "unexpected response" };
}

/** Wrap a thrown IPC error as the structured `{kind: "err"}` shape
 *  the hook renders. The Tauri command itself should never throw on
 *  the happy path, so a thrown error always means a structural
 *  failure. */
function toErr(error: unknown): { kind: "err"; err: { message: string } } {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "err", err: { message } };
}

export function TrustProvider({ children }: { children: ReactNode }) {
  const { cwd } = useDirectory();
  // The trust query is keyed by cwd so switching the directory
  // refetches automatically. The query is disabled when there is
  // no cwd (the global context has no config to trust).
  const q = useQuery({
    queryKey: ["mise", "trust", cwd] as const,
    queryFn: async () => {
      try {
        return await trustCheck(cwd);
      } catch (e) {
        return toErr(e);
      }
    },
    enabled: cwd !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const state: TrustState = useMemo(() => {
    if (q.isPending) return { kind: "unknown" };
    if (q.error) return toTrustState(toErr(q.error));
    return toTrustState(q.data);
  }, [q.isPending, q.error, q.data]);

  const value = useMemo<TrustContextValue>(() => ({ state }), [state]);
  return <TrustContext.Provider value={value}>{children}</TrustContext.Provider>;
}

export function useTrust(): TrustContextValue {
  const v = useContext(TrustContext);
  if (!v) {
    throw new Error("useTrust must be used inside <TrustProvider>");
  }
  return v;
}

// ---------- useTrustAction ----------

interface TrustAction {
  /** True while `mise trust` is streaming through the panel. */
  running: boolean;
  /** Last terminal status. Cleared at the start of each run. */
  lastResult: "ok" | "error" | null;
  /** Last error message (i18n key or raw text) when `lastResult === "error"`. */
  lastError: string | null;
  /** Run `mise trust` for the cwd. The trust query is invalidated
   *  on success so the banner re-evaluates. */
  run: () => Promise<void>;
}

/**
 * One-click `mise trust` for the active directory. Reuses the
 * execution panel's streaming reducer (the trust attempt shows up
 * alongside any other panel activity) and invalidates the trust
 * cache on success so the banner disappears.
 *
 * The hook is intentionally dumb: it does not decide whether to
 * show the banner. The page renders the banner based on
 * `useTrust().state.kind === "untrusted"` and offers this hook's
 * `run()` as the action target.
 */
export function useTrustAction(): TrustAction {
  const { cwd } = useDirectory();
  const { state: execState, runTrust } = useExecutionContext();
  const queryClient = useQueryClient();
  // `lastResult` / `lastError` are React state (not refs) so the
  // banner re-renders when the streaming run terminates. Refs
  // would update the value but not schedule a re-render.
  const [lastResult, setLastResult] = useState<"ok" | "error" | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  // Track the most recent terminal status so we can detect the
  // running → terminal transition without owning the IPC promise.
  // A ref keeps the value out of the render path; the effect uses
  // it only as a marker.
  const wasRunningRef = useRef(false);

  const running =
    execState.status === "running" &&
    execState.kind === "mise" &&
    execState.request?.cwd === cwd &&
    execState.request?.args[0] === "trust";

  useEffect(() => {
    if (running) {
      wasRunningRef.current = true;
      // Clear stale terminal flags at the start of a new run.
      setLastResult(null);
      setLastError(null);
      return;
    }
    if (wasRunningRef.current && !running) {
      wasRunningRef.current = false;
      if (execState.status === "ok") {
        setLastResult("ok");
        setLastError(null);
        // Re-probe trust so the banner re-evaluates.
        void queryClient.invalidateQueries({ queryKey: ["mise", "trust", cwd] });
      } else if (execState.status === "failed") {
        setLastResult("error");
        setLastError(execState.error?.message ?? "unknown");
      }
    }
  }, [running, execState.status, execState.error, cwd, queryClient]);

  const run = useCallback(async () => {
    await runTrust(cwd);
  }, [runTrust, cwd]);

  return {
    running,
    lastResult,
    lastError,
    run,
  };
}

// ---------- useTrustGuard ----------

export type TrustGuardReason = "untrusted" | "error" | null;

interface TrustGuard {
  /** True when a mutating action is allowed to run. */
  allowed: boolean;
  /** Why the action is blocked; `null` when `allowed`. */
  reason: TrustGuardReason;
}

/**
 * The gate future mutation buttons (#22 install / uninstall,
 * #26 config writes, #27 task edits) consult before running. The
 * only signal that blocks is `untrusted` — a directory with a
 * `mise.toml` that the user has not yet trusted. `error` also
 * blocks (better safe than sorry: if we can't reach the trust
 * probe, we can't reach `mise trust` either). All other states
 * (`trusted`, `noConfig`, `unknown`) allow the action.
 *
 * Callers should:
 *   if (!guard.allowed) {
 *     focus the trust banner; return;
 *   }
 *   run the action.
 */
export function useTrustGuard(): TrustGuard {
  const { state } = useTrust();
  if (state.kind === "untrusted") {
    return { allowed: false, reason: "untrusted" };
  }
  if (state.kind === "error") {
    return { allowed: false, reason: "error" };
  }
  return { allowed: true, reason: null };
}
