// executionState — the pure state machine behind useExecution (the panel
// runner, ADR-0005). Split out of the hook so the reducer is unit-testable
// with node:test (conventions.md: new pure logic ships with a colocated
// *.test.ts); the hook wires it to React, the IPC channel, and persistence.
//
// Lifecycle rules (issue #180, beta12 feedback Issue 4):
// - At most MAX_FINISHED_RUNS finished runs are kept; the oldest are
//   pruned when a new command starts. Running runs never count toward the
//   cap, may exceed it, and are never pruned or removable — the panel is
//   the only presentation surface for an in-flight mise invocation.
// - A finished run may be closed individually (removeRun) or cleared with
//   the rest of the finished history (clearRuns); both leave running runs
//   untouched. Removing the active run falls back to the most recent
//   remaining run, or the idle empty state when none is left.

import type { AppError } from "../../types/tauri";

export interface RunRequest {
  cwd: string | null;
  args: string[];
}

export type LogLine = {
  stream: "stdout" | "stderr";
  text: string;
};

export type ExecutionStatus = "idle" | "running" | "ok" | "failed" | "cancelled";

/** What the panel is currently running. `mise` runs an arbitrary mise
 *  command; `install` runs the official install script; `selfUpdate`
 *  runs `mise self-update`. The reducer + state are the same — only
 *  the IPC command and the displayed echo differ. */
export type ExecutionKind = "mise" | "install" | "selfUpdate";

/** A single run, isolated from every other run (issue #138). A
 *  foreground run owns its own transcript; a background run never
 *  becomes a `RunEntry`. */
export interface RunEntry {
  id: string;
  kind: ExecutionKind;
  request: RunRequest;
  lines: LogLine[];
  status: ExecutionStatus;
  exitCode: number | null;
  durationMs: number;
  error: AppError | null;
  /** Post-update version string when `kind === "selfUpdate"`. */
  newVersion: string | null;
  /** Epoch ms when the run started, for history ordering. */
  startedAt: number;
}

export interface ExecState {
  runs: RunEntry[];
  activeRunId: string | null;
  isOpen: boolean;
}

/** Most finished runs to keep in history so an idle app does not grow
 *  logs forever (#138, capped at 3 by #180). Running runs are never
 *  pruned and never count toward the cap. */
export const MAX_FINISHED_RUNS = 3;

export function pruneRuns(runs: RunEntry[], maxFinished: number): RunEntry[] {
  const finished = runs.filter((r) => r.status !== "running");
  if (finished.length <= maxFinished) return runs;
  const drop = new Set(
    finished.slice(0, finished.length - maxFinished).map((r) => r.id),
  );
  return runs.filter((r) => !drop.has(r.id));
}

/** Most recently started run still in history, or null when history is
 *  empty — the fallback selection after the active run was removed
 *  (#180). `runs` is append-ordered by start, so the last entry is the
 *  most recent. */
function fallbackActiveId(runs: RunEntry[]): string | null {
  return runs.length === 0 ? null : runs[runs.length - 1].id;
}

export type Action =
  | { type: "start"; id: string; kind: ExecutionKind; request: RunRequest }
  | { type: "line"; id: string; stream: "stdout" | "stderr"; text: string }
  | { type: "exit"; id: string; exitCode: number; durationMs: number }
  | { type: "complete"; id: string; newVersion: string | null }
  | { type: "fail"; id: string; error: AppError }
  | { type: "cancel"; id: string }
  | { type: "select"; id: string }
  | { type: "removeRun"; id: string }
  | { type: "clearRuns" }
  | { type: "close" }
  | { type: "open" };

export function executionReducer(state: ExecState, action: Action): ExecState {
  switch (action.type) {
    case "start":
      return {
        ...state,
        runs: pruneRuns(
          [
            ...state.runs,
            {
              id: action.id,
              kind: action.kind,
              request: action.request,
              lines: [],
              status: "running",
              exitCode: null,
              durationMs: 0,
              error: null,
              newVersion: null,
              startedAt: Date.now(),
            },
          ],
          MAX_FINISHED_RUNS,
        ),
        // A new foreground run becomes the active one and claims the
        // panel's transcript; it never resets another entry's lines.
        activeRunId: action.id,
        // Preserve the current visibility rather than forcing the panel
        // open: a command starting must not yank the user's attention. A
        // closed panel stays closed (the reopen affordance surfaces the
        // activity); an open panel stays open so a user mid-read isn't
        // interrupted. Failure is the only thing that may open a closed
        // panel — see the `exit`/`fail` cases below.
        isOpen: state.isOpen,
      };
    case "line":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id === action.id
            ? { ...r, lines: [...r.lines, { stream: action.stream, text: action.text }] }
            : r,
        ),
      };
    case "exit":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id === action.id
            ? {
                ...r,
                status: action.exitCode === 0 ? "ok" : "failed",
                exitCode: action.exitCode,
                durationMs: action.durationMs,
              }
            : r,
        ),
        // Auto-open once on failure if the panel is closed, so the error
        // and its logs are immediately visible (failure exception to the
        // "no auto-open on start" rule). Success never auto-opens, so we
        // keep whatever visibility the panel already had. A run issues
        // exactly one `exit`, so this opens the panel at most once per
        // run; removing the run from history afterwards (#180) cannot
        // re-arm it, and there is no re-open loop.
        isOpen: action.exitCode === 0 ? state.isOpen : true,
      };
    case "complete":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id === action.id ? { ...r, newVersion: action.newVersion } : r,
        ),
      };
    case "fail":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id === action.id ? { ...r, status: "failed", error: action.error } : r,
        ),
        // A failed run whose panel is closed pops open so the error is
        // visible; an already-open panel (or one the user closed) is left
        // untouched. A run that fails via this path issues a single `fail`
        // action, so it can never fight the user with a loop.
        isOpen: true,
      };
    case "cancel":
      return {
        ...state,
        runs: state.runs.map((r) =>
          r.id === action.id ? { ...r, status: "cancelled" } : r,
        ),
      };
    case "select":
      return { ...state, activeRunId: action.id };
    case "removeRun": {
      const target = state.runs.find((r) => r.id === action.id);
      // Running runs are protected: the panel is the only surface for an
      // in-flight command (ADR-0005), and run visibility during execution
      // is a #138 acceptance criterion.
      if (!target || target.status === "running") return state;
      const runs = state.runs.filter((r) => r.id !== action.id);
      return {
        ...state,
        runs,
        activeRunId:
          state.activeRunId === action.id
            ? fallbackActiveId(runs)
            : state.activeRunId,
      };
    }
    case "clearRuns": {
      const runs = state.runs.filter((r) => r.status === "running");
      if (runs.length === state.runs.length) return state;
      return {
        ...state,
        runs,
        activeRunId:
          state.activeRunId !== null && runs.some((r) => r.id === state.activeRunId)
            ? state.activeRunId
            : fallbackActiveId(runs),
      };
    }
    case "close":
      return { ...state, isOpen: false };
    case "open":
      return { ...state, isOpen: true };
  }
}
