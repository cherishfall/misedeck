// useExecution — a small reducer that drives the execution panel.
// Holds the current request, streamed lines, status, and a cancel handle.
//
// It is also the app's *only* mise runner (ADR-0005): reads route
// through `run()` exactly like mutations do, and `run()` returns the
// structured result so a read's caller can feed the query cache without
// invoking mise a second time.

import { useCallback, useReducer, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";

import type { AppError, JsonResult } from "../../types/tauri";
import { isAppError } from "../../api/mise";

export interface RunRequest {
  cwd: string | null;
  args: string[];
}

/** Per-call modifiers for the runner (ADR-0005). */
export interface RunOptions {
  /**
   * Use the panel's runner without claiming its transcript: no echo
   * swap, no streamed lines, no auto-open, and no single-flight
   * rejection.
   *
   * Reads the app issues on its own behalf (the tools table's initial
   * load, its post-mutation refresh) pass this so an automatic refresh
   * can never yank the transcript the user is reading. Everything the
   * user asked for — mutations and the query sections' Run buttons —
   * runs in the foreground and is transcribed.
   */
  background?: boolean;
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

export interface ExecutionState {
  status: ExecutionStatus;
  kind: ExecutionKind;
  request: RunRequest | null;
  lines: LogLine[];
  exitCode: number;
  durationMs: number;
  error: AppError | null;
  /** Post-update version string when `kind === "selfUpdate"`. */
  newVersion: string | null;
  /** Panel visibility. Hidden by default and stays closed when a command
   *  starts (so foreground runs no longer yank the user's attention) —
   *  the reopen affordance surfaces the activity instead. The one
   *  exception: when a command fails while the panel is closed, it opens
   *  once so the error and its logs are visible. The panel can be
   *  dismissed at any time without clearing its history. */
  isOpen: boolean;
}

const initial: ExecutionState = {
  status: "idle",
  kind: "mise",
  request: null,
  lines: [],
  exitCode: 0,
  durationMs: 0,
  error: null,
  newVersion: null,
  isOpen: false,
};

type Action =
  | { type: "start"; kind: ExecutionKind; request: RunRequest }
  | { type: "line"; stream: "stdout" | "stderr"; text: string }
  | { type: "exit"; exitCode: number; durationMs: number }
  | { type: "complete"; newVersion: string | null }
  | { type: "fail"; error: AppError }
  | { type: "cancel" }
  | { type: "close" }
  | { type: "open" };

function reducer(state: ExecutionState, action: Action): ExecutionState {
  switch (action.type) {
    case "start":
      return {
        ...initial,
        kind: action.kind,
        status: "running",
        request: action.request,
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
        lines: [...state.lines, { stream: action.stream, text: action.text }],
      };
    case "exit":
      return {
        ...state,
        status: action.exitCode === 0 ? "ok" : "failed",
        exitCode: action.exitCode,
        durationMs: action.durationMs,
        // Auto-open once on failure if the panel is closed, so the error
        // and its logs are immediately visible (failure exception to the
        // "no auto-open on start" rule). Success never auto-opens, so we
        // keep whatever visibility the panel already had. Because a single
        // run produces exactly one failed-state transition, this opens the
        // panel at most once per run and cannot re-open a panel the user
        // dismissed after seeing the failure — there is no re-open loop.
        isOpen: action.exitCode === 0 ? state.isOpen : true,
      };
    case "complete":
      return { ...state, newVersion: action.newVersion };
    case "fail":
      return {
        ...state,
        status: "failed",
        error: action.error,
        // Same "open once on failure" rule as the `exit` case above: a
        // failed run whose panel is closed pops open so the error is
        // visible; an already-open panel (or one the user closed) is
        // left untouched. A run that fails via this path issues a single
        // `fail` action, so it can never fight the user with a loop.
        isOpen: true,
      };
    case "cancel":
      return { ...state, status: "cancelled" };
    case "close":
      return { ...state, isOpen: false };
    case "open":
      return { ...state, isOpen: true };
  }
}

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
): Channel<unknown> {
  return new Channel<unknown>((msg) => {
    // The Rust side emits RunEvent with a `kind` tag.
    if (!msg || typeof msg !== "object") return;
    const m = msg as { kind?: string; line?: string; exitCode?: number; durationMs?: number };
    if (m.kind === "stdout" && typeof m.line === "string") {
      dispatch({ type: "line", stream: "stdout", text: m.line });
    } else if (m.kind === "stderr" && typeof m.line === "string") {
      dispatch({ type: "line", stream: "stderr", text: m.line });
    } else if (m.kind === "exit") {
      dispatch({
        type: "exit",
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

function panelBusy(): AppError {
  return {
    code: "COMMAND_FAILED",
    message: "another mise command is already running",
    stderr: "",
  };
}

/** A background run still has to hand the IPC boundary a channel (the
 *  Rust signature requires one); this one drops every event. */
function discardingChannel(): Channel<unknown> {
  return new Channel<unknown>(() => {});
}

export function useExecution() {
  const [state, dispatch] = useReducer(reducer, initial);
  // We keep the most recent cancel handle on a ref so the cancel button
  // can find it without re-rendering.
  const cancelRef = useRef<(() => void) | null>(null);
  // Single-flight for foreground runs, tracked on a ref rather than
  // `state.status` so every `run*` callback stays referentially stable:
  // the read hooks close over `run` inside React Query query functions
  // and must not be re-created on every panel state change.
  const foregroundBusyRef = useRef(false);
  const foregroundSeqRef = useRef(0);

  const runMiseInternal = useCallback(
    async (
      ipcCommand: "run_mise_command" | "install_mise" | "mise_self_update" | "mise_trust",
      kind: ExecutionKind,
      payload: Record<string, unknown>,
      request: RunRequest,
      options?: RunOptions,
    ): Promise<RunCommandResult> => {
      const background = options?.background === true;
      let seq = 0;
      if (!background) {
        if (foregroundBusyRef.current) {
          return { kind: "err", err: panelBusy() };
        }
        foregroundBusyRef.current = true;
        seq = ++foregroundSeqRef.current;
        dispatch({ type: "start", kind, request });
      }
      const channel = background ? discardingChannel() : makeChannel(dispatch);
      let cancelled = false;
      if (!background) {
        cancelRef.current = () => {
          cancelled = true;
          // The Rust runner doesn't expose a kill handle from the JS side yet;
          // for now `cancel` just marks the panel as cancelled and frees the
          // single-flight slot so the user can dispatch again immediately.
          foregroundBusyRef.current = false;
          dispatch({ type: "cancel" });
        };
      }
      /** Report a failure: the panel only hears about foreground runs it
       *  still owns; the caller always gets the structured error. */
      const fail = (err: AppError): RunCommandResult => {
        if (!background && !cancelled) dispatch({ type: "fail", error: err });
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
            newVersion: typeof result.newVersion === "string" ? result.newVersion : null,
          });
        } else {
          dispatch({ type: "fail", error: result.err });
        }
        return result;
      } catch (e) {
        return fail({
          code: "COMMAND_FAILED",
          message: e instanceof Error ? e.message : String(e),
          stderr: "",
        });
      } finally {
        // Only release the slot if a later foreground run has not already
        // claimed it (possible after a cancel, which frees it early).
        if (!background && foregroundSeqRef.current === seq) {
          cancelRef.current = null;
          foregroundBusyRef.current = false;
        }
      }
    },
    [],
  );

  /**
   * Run an arbitrary `mise ...` command and return its structured
   * result. Reads use the return value to feed the React Query cache so
   * no command is ever executed twice (ADR-0005).
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
   *  platform-derived (curl|sh on Unix, irm|iex on Windows). */
  const runInstall = useCallback(async () => {
    const request: RunRequest = {
      cwd: null,
      // The displayed args are a hint of what the script is doing.
      // The actual platform-specific command is built in Rust.
      args: ["install", "(official script)"],
    };
    await runMiseInternal("install_mise", "install", {}, request);
  }, [runMiseInternal]);

  /** Run `mise self-update` via the cached mise binary. */
  const runSelfUpdate = useCallback(async () => {
    const request: RunRequest = {
      cwd: null,
      args: ["self-update"],
    };
    await runMiseInternal("mise_self_update", "selfUpdate", {}, request);
  }, [runMiseInternal]);

  /** Run `mise trust` for the given directory. Streams into the
   *  panel. The trust cache is the caller's responsibility to
   *  invalidate — see `useTrustAction()` which does it on Ok. */
  const runTrust = useCallback(
    async (cwd: string | null) => {
      const request: RunRequest = {
        cwd,
        args: ["trust"],
      };
      await runMiseInternal("mise_trust", "mise", { cwd }, request);
    },
    [runMiseInternal],
  );

  const cancel = useCallback(() => {
    cancelRef.current?.();
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

  return { state, run, runInstall, runSelfUpdate, runTrust, cancel, dismiss, openPanel };
}

