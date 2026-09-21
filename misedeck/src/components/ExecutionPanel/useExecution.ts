// useExecution — the hook that drives the execution panel.
// Holds the current request, streamed lines, status, and a cancel handle;
// the pure reducer behind it lives in executionState.ts.
//
// It is also the panel runner for the reads routed through it
// (ADR-0005: the `ls` family, `ls-remote`, and `settings ls` — outlier
// reads like `outdated`, `env`, tasks, plugins, doctor, and registry
// keep their own dedicated Tauri commands): those reads route through
// `run()` exactly like mutations do, and `run()` returns the
// structured result so a read's caller can feed the query cache without
// invoking mise a second time.
//
// Concurrent execution (issue #138): the panel runs more than one command
// at a time. Each foreground run gets its own `RunEntry` with an isolated
// transcript; the `Channel` callback closes over the run id so run B's
// stdout can never land in run A's log. There is no global single-flight
// guard — `run()` never rejects because another command is running. A
// background run (`RunOptions.background`) shares the runner but owns no
// transcript, no auto-open, and no switcher entry.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";

import type { AppError, JsonResult } from "../../types/tauri";
import { isAppError } from "../../api/mise";
import { loadPersistent, savePersistent } from "../../hooks/usePersistentState";
import { executionReducer } from "./executionState";
import type {
  Action,
  ExecutionKind,
  ExecutionStatus,
  LogLine,
  RunRequest,
} from "./executionState";

// The pure state machine (runs, history cap, remove/clear lifecycle) lives
// in `executionState.ts` next to this hook, colocated with its node:test
// suite; this file wires it to React, the IPC channel, and persistence.

/** localStorage key for the panel's persisted open state (issue #108). */
const PANEL_OPEN_KEY = "misedeck.panelOpen.v1";

/** Per-call modifiers for the runner (ADR-0005). */
export interface RunOptions {
  /**
   * Use the panel's runner without claiming its transcript: no echo
   * swap, no streamed lines, no auto-open, and no switcher entry.
   *
   * Reads the app issues on its own behalf (the tools table's initial
   * load, its post-mutation refresh) pass this so an automatic refresh
   * can never yank the transcript the user is reading. Everything the
   * user asked for — mutations and reads alike — runs in the foreground
   * and is transcribed in its own run entry.
   */
  background?: boolean;
}

/** Projected view of the active run, kept so existing consumers
 *  (ExecutionPanel, ExecutionPanelAffordance) keep compiling. A background
 *  run never becomes the active run, so this always reflects a foreground
 *  run or the idle empty state. */
export interface ExecutionState {
  status: ExecutionStatus;
  kind: ExecutionKind;
  request: RunRequest | null;
  lines: LogLine[];
  /** Exit code reported by this run's Exit stream event; `null` until the
   *  process actually exits, so a failure that never produced one (spawn
   *  error, IPC validation failure) cannot display a stale code (#129). */
  exitCode: number | null;
  durationMs: number;
  error: AppError | null;
  /** Post-update version string when `kind === "selfUpdate"`. */
  newVersion: string | null;
  /** Panel visibility. Hidden by default and stays closed when a command
   *  starts (so foreground runs no longer yank the user's attention) —
   *  the reopen affordance surfaces the activity instead. The one
   *  exception: when a run fails while the panel is closed, it opens
   *  once so the error and its logs are visible. The panel can be
   *  dismissed at any time without clearing its history. */
  isOpen: boolean;
}

const idleState: ExecutionState = {
  status: "idle",
  kind: "mise",
  request: null,
  lines: [],
  exitCode: null,
  durationMs: 0,
  error: null,
  newVersion: null,
  isOpen: false,
};

/** The captured result of a run, mirroring Rust's `RunOutcome`. */
export interface RunOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

/** Shape that the Rust `run_mise_command` / `install_mise` /
 *  `mise_self_update` IPC handlers return. Same shape on the wire
 *  for all three (success → `{kind:"ok", outcome, newVersion?}`,
 *  error → `{kind:"err", err}`). */
export interface RunCommandOk {
  kind: "ok";
  outcome: RunOutcome;
  newVersion?: string | null;
}
export interface RunCommandErr {
  kind: "err";
  err: AppError;
}
export type RunCommandResult = RunCommandOk | RunCommandErr;

function isRunCommandResult(v: unknown): v is RunCommandResult {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.kind === "ok") return typeof o.outcome === "object" && o.outcome !== null;
  if (o.kind === "err") return isAppError(o.err);
  return false;
}

/**
 * Reduce a completed run to the `JsonResult` union the read hooks cache
 * (ADR-0005). `mise <cmd> --json` writes its payload to stdout, so a
 * clean exit parses stdout; a timeout, a non-zero exit, or unparsable
 * output all become the structured `{kind:"err"}` branch with mise's
 * stderr preserved verbatim — the runner never invents a payload.
 */
export function toJsonResult(result: RunCommandResult): JsonResult {
  if (result.kind === "err") {
    return { kind: "err", err: result.err };
  }
  const { outcome } = result;
  if (outcome.timedOut) {
    return {
      kind: "err",
      err: { code: "TIMEOUT", message: "mise timed out", stderr: outcome.stderr },
    };
  }
  if (outcome.exitCode !== 0) {
    return {
      kind: "err",
      err: {
        code: "COMMAND_FAILED",
        message: `mise exited with code ${outcome.exitCode}`,
        stderr: outcome.stderr,
      },
    };
  }
  try {
    return { kind: "ok", value: JSON.parse(outcome.stdout) as Record<string, unknown> };
  } catch (e) {
    return {
      kind: "err",
      err: {
        code: "PARSE_FAILED",
        message: e instanceof Error ? e.message : String(e),
        stderr: outcome.stderr,
      },
    };
  }
}

function makeChannel(
  dispatch: React.Dispatch<Action>,
  id: string,
): Channel<unknown> {
  return new Channel<unknown>((msg) => {
    // The Rust side emits RunEvent with a `kind` tag. Each event is
    // dispatched into the run whose id this channel closed over, so a
    // run's stdout can never land in another run's transcript (#138).
    if (!msg || typeof msg !== "object") return;
    const m = msg as { kind?: string; line?: string; exitCode?: number; durationMs?: number };
    if (m.kind === "stdout" && typeof m.line === "string") {
      dispatch({ type: "line", id, stream: "stdout", text: m.line });
    } else if (m.kind === "stderr" && typeof m.line === "string") {
      dispatch({ type: "line", id, stream: "stderr", text: m.line });
    } else if (m.kind === "exit") {
      dispatch({
        type: "exit",
        id,
        exitCode: m.exitCode ?? -1,
        durationMs: m.durationMs ?? 0,
      });
    }
  });
}

function unexpectedIpcResponse(): AppError {
  return {
    code: "COMMAND_FAILED",
    message: "unexpected IPC response from execution panel",
    stderr: "",
  };
}

/** A background run still has to hand the IPC boundary a channel (the
 *  Rust signature requires one); this one drops every event. */
function discardingChannel(): Channel<unknown> {
  return new Channel<unknown>(() => {});
}

export function useExecution() {
  const [state, dispatch] = useReducer(executionReducer, undefined, () => ({
    runs: [],
    activeRunId: null,
    isOpen: loadPersistent(PANEL_OPEN_KEY, false),
  }));
  useEffect(() => {
    savePersistent(PANEL_OPEN_KEY, state.isOpen);
  }, [state.isOpen]);
  // Per-run cancel handles, keyed by run id (issue #138). The cancel
  // button always finds the active run's handle without re-rendering.
  const cancelRefs = useRef<Map<string, () => void>>(new Map());
  // Monotonic id source for runs; kept on a ref so `run*` callbacks stay
  // referentially stable (the read hooks close over `run` inside React
  // Query query functions and must not be re-created on every panel
  // state change).
  const idSeqRef = useRef(0);

  const runMiseInternal = useCallback(
    async (
      ipcCommand: "run_mise_command" | "install_mise" | "mise_self_update" | "mise_trust",
      kind: ExecutionKind,
      payload: Record<string, unknown>,
      request: RunRequest,
      options?: RunOptions,
    ): Promise<RunCommandResult> => {
      const background = options?.background === true;
      const id = `run-${++idSeqRef.current}`;
      // Foreground runs never reject: concurrency is allowed, so there is
      // no single-flight slot to claim. A new foreground run simply adds
      // its own entry and becomes the active one.
      if (!background) {
        dispatch({ type: "start", id, kind, request });
      }
      const channel = background ? discardingChannel() : makeChannel(dispatch, id);
      let cancelled = false;
      if (!background) {
        cancelRefs.current.set(id, () => {
          cancelled = true;
          // The Rust runner doesn't expose a kill handle from the JS side
          // yet (soft cancel, see runner.md); the run is marked cancelled
          // and its handle is released so the user can dispatch again.
          dispatch({ type: "cancel", id });
          cancelRefs.current.delete(id);
        });
      }
      /** Report a failure: the panel only hears about foreground runs it
       *  still owns; the caller always gets the structured error. */
      const fail = (err: AppError): RunCommandResult => {
        if (!background && !cancelled) dispatch({ type: "fail", id, error: err });
        return { kind: "err", err };
      };
      try {
        const result = (await invoke(ipcCommand, {
          ...payload,
          onEvent: channel,
        })) as unknown;
        if (!isRunCommandResult(result)) {
          return fail(unexpectedIpcResponse());
        }
        if (background || cancelled) return result;
        if (result.kind === "ok") {
          // The Exit event from the channel already updated state.
          // For self-update, surface the post-update version.
          dispatch({
            type: "complete",
            id,
            newVersion: typeof result.newVersion === "string" ? result.newVersion : null,
          });
        } else {
          dispatch({ type: "fail", id, error: result.err });
        }
        return result;
      } catch (e) {
        return fail({
          code: "COMMAND_FAILED",
          message: e instanceof Error ? e.message : String(e),
          stderr: "",
        });
      } finally {
        cancelRefs.current.delete(id);
      }
    },
    [],
  );

  /**
   * Run an arbitrary `mise ...` command and return its structured
   * result. Reads use the return value to feed the React Query cache so
   * no command is ever executed twice (ADR-0005). Never rejects because
   * another command is running (#138).
   */
  const run = useCallback(
    (request: RunRequest, options?: RunOptions): Promise<RunCommandResult> =>
      runMiseInternal(
        "run_mise_command",
        "mise",
        { cwd: request.cwd, args: request.args },
        request,
        options,
      ),
    [runMiseInternal],
  );

  /** Run the official install script. The displayed command echo is
   *  platform-derived (curl|sh on Unix, irm|iex on Windows). The
   *  structured result is returned so the caller can tell success
   *  from failure and refresh its queries on ok (issue #166). */
  const runInstall = useCallback((): Promise<RunCommandResult> => {
    const request: RunRequest = {
      cwd: null,
      // The displayed args are a hint of what the script is doing.
      // The actual platform-specific command is built in Rust.
      args: ["install", "(official script)"],
    };
    return runMiseInternal("install_mise", "install", {}, request);
  }, [runMiseInternal]);

  /** Run `mise self-update --yes` via the cached mise binary. The
   *  structured result is returned so the caller can tell success from
   *  failure (issue #145). */
  const runSelfUpdate = useCallback((): Promise<RunCommandResult> => {
    const request: RunRequest = {
      cwd: null,
      args: ["self-update", "--yes"],
    };
    return runMiseInternal("mise_self_update", "selfUpdate", {}, request);
  }, [runMiseInternal]);

  /** Run `mise trust` for the given directory. Streams into the
   *  panel and returns the structured result. Because runs are
   *  concurrent (#138), the caller must read *this* result and not
   *  the panel's active-run projection — another run may be active
   *  by the time this one finishes. The trust cache is the
   *  caller's responsibility to invalidate — see
   *  `useTrustAction()` which does it on Ok. */
  const runTrust = useCallback(
    (cwd: string | null): Promise<RunCommandResult> => {
      const request: RunRequest = {
        cwd,
        args: ["trust"],
      };
      return runMiseInternal("mise_trust", "mise", { cwd }, request);
    },
    [runMiseInternal],
  );

  const cancel = useCallback(() => {
    if (state.activeRunId) cancelRefs.current.get(state.activeRunId)?.();
  }, [state.activeRunId]);

  /** Select which run the panel transcribes (issue #138). Background runs
   *  are never selectable; this only switches the foreground view. */
  const selectRun = useCallback((id: string) => {
    dispatch({ type: "select", id });
  }, []);

  /** Remove a finished run from the switcher history (#180). Running runs
   *  are protected — the panel is the only surface for an in-flight
   *  command (ADR-0005) — so this is a no-op for them. Removing the
   *  active run falls back to the most recent remaining run, or the idle
   *  empty state when history is empty. */
  const removeRun = useCallback((id: string) => {
    dispatch({ type: "removeRun", id });
  }, []);

  /** Clear every finished run from the switcher history (#180). Running
   *  runs always survive; if the active run was finished, the selection
   *  falls back to the most recent running run, or the idle empty state. */
  const clearRuns = useCallback(() => {
    dispatch({ type: "clearRuns" });
  }, []);

  /** Hide the panel without clearing its history. The next run does NOT
   *  re-open it automatically — `start` preserves whatever visibility the
   *  panel already had. It only pops open if that run fails while closed. */
  const dismiss = useCallback(() => {
    dispatch({ type: "close" });
  }, []);

  /** Re-open a hidden panel so the user can inspect an active run or
   *  the history of the last one. */
  const openPanel = useCallback(() => {
    dispatch({ type: "open" });
  }, []);

  const activeRun = state.runs.find((r) => r.id === state.activeRunId) ?? null;
  const projected: ExecutionState = activeRun
    ? {
        status: activeRun.status,
        kind: activeRun.kind,
        request: activeRun.request,
        lines: activeRun.lines,
        exitCode: activeRun.exitCode,
        durationMs: activeRun.durationMs,
        error: activeRun.error,
        newVersion: activeRun.newVersion,
        isOpen: state.isOpen,
      }
    : { ...idleState, isOpen: state.isOpen };

  return {
    state: projected,
    runs: state.runs,
    activeRunId: state.activeRunId,
    selectRun,
    removeRun,
    clearRuns,
    run,
    runInstall,
    runSelfUpdate,
    runTrust,
    cancel,
    dismiss,
    openPanel,
  };
}

// Re-export the state-machine types moved to executionState.ts so existing
// consumers importing from "./useExecution" keep compiling.
export type {
  ExecutionKind,
  ExecutionStatus,
  LogLine,
  RunEntry,
  RunRequest,
} from "./executionState";
