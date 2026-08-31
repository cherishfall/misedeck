// useExecution — a small reducer that drives the execution panel.
// Holds the current request, streamed lines, status, and a cancel handle.

import { useCallback, useReducer, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";

import type { AppError } from "../../types/tauri";
import { isAppError } from "../../api/mise";

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
};

type Action =
  | { type: "start"; kind: ExecutionKind; request: RunRequest }
  | { type: "line"; stream: "stdout" | "stderr"; text: string }
  | { type: "exit"; exitCode: number; durationMs: number }
  | { type: "complete"; newVersion: string | null }
  | { type: "fail"; error: AppError }
  | { type: "cancel" }
  | { type: "dismiss" };

function reducer(state: ExecutionState, action: Action): ExecutionState {
  switch (action.type) {
    case "start":
      return {
        ...initial,
        kind: action.kind,
        status: "running",
        request: action.request,
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
      };
    case "complete":
      return { ...state, newVersion: action.newVersion };
    case "fail":
      return { ...state, status: "failed", error: action.error };
    case "cancel":
      return { ...state, status: "cancelled" };
    case "dismiss":
      return { ...initial };
  }
}

/** Shape that the Rust `run_mise_command` / `install_mise` /
 *  `mise_self_update` IPC handlers return. Same shape on the wire
 *  for all three (success → `{kind:"ok", outcome, newVersion?}`,
 *  error → `{kind:"err", err}`). */
interface RunCommandOk {
  kind: "ok";
  outcome: { stdout: string; stderr: string; exitCode: number; durationMs: number; timedOut: boolean };
  newVersion?: string | null;
}
interface RunCommandErr {
  kind: "err";
  err: AppError;
}
type RunCommandResult = RunCommandOk | RunCommandErr;

function isRunCommandResult(v: unknown): v is RunCommandResult {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.kind === "ok") return typeof o.outcome === "object" && o.outcome !== null;
  if (o.kind === "err") return isAppError(o.err);
  return false;
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

export function useExecution() {
  const [state, dispatch] = useReducer(reducer, initial);
  // We keep the most recent cancel handle on a ref so the cancel button
  // can find it without re-rendering.
  const cancelRef = useRef<(() => void) | null>(null);

  const runMiseInternal = useCallback(
    async (
      ipcCommand: "run_mise_command" | "install_mise" | "mise_self_update" | "mise_trust",
      kind: ExecutionKind,
      payload: Record<string, unknown>,
      request: RunRequest,
    ) => {
      if (state.status === "running") return;
      dispatch({ type: "start", kind, request });
      const channel = makeChannel(dispatch);
      let cancelled = false;
      cancelRef.current = () => {
        cancelled = true;
        // The Rust runner doesn't expose a kill handle from the JS side yet;
        // for now `cancel` just marks the panel as cancelled. The next
        // ticket that needs it (e.g. #22 mutations) will thread a kill
        // handle through. For the demo (`mise doctor` finishes in <1s)
        // this is fine.
        dispatch({ type: "cancel" });
      };
      try {
        const result = (await invoke(ipcCommand, {
          ...payload,
          onEvent: channel,
        })) as unknown;
        if (cancelled) return;
        if (isRunCommandResult(result)) {
          if (result.kind === "ok") {
            // The Exit event from the channel already updated state.
            // For self-update, surface the post-update version.
            if (typeof result.newVersion === "string") {
              dispatch({ type: "complete", newVersion: result.newVersion });
            } else {
              dispatch({ type: "complete", newVersion: null });
            }
          } else {
            dispatch({ type: "fail", error: result.err });
          }
        } else {
          dispatch({ type: "fail", error: unexpectedIpcResponse() });
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        dispatch({
          type: "fail",
          error: { code: "COMMAND_FAILED", message, stderr: "" },
        });
      } finally {
        cancelRef.current = null;
      }
    },
    [state.status],
  );

  /** Run an arbitrary `mise ...` command. */
  const run = useCallback(
    async (request: RunRequest) => {
      await runMiseInternal(
        "run_mise_command",
        "mise",
        { cwd: request.cwd, args: request.args },
        request,
      );
    },
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

  const dismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  return { state, run, runInstall, runSelfUpdate, runTrust, cancel, dismiss };
}

