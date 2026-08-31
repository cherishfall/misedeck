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

export interface ExecutionState {
  status: ExecutionStatus;
  request: RunRequest | null;
  lines: LogLine[];
  exitCode: number;
  durationMs: number;
  error: AppError | null;
}

const initial: ExecutionState = {
  status: "idle",
  request: null,
  lines: [],
  exitCode: 0,
  durationMs: 0,
  error: null,
};

type Action =
  | { type: "start"; request: RunRequest }
  | { type: "line"; stream: "stdout" | "stderr"; text: string }
  | { type: "exit"; exitCode: number; durationMs: number }
  | { type: "fail"; error: AppError }
  | { type: "cancel" }
  | { type: "dismiss" };

function reducer(state: ExecutionState, action: Action): ExecutionState {
  switch (action.type) {
    case "start":
      return { ...initial, status: "running", request: action.request };
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
    case "fail":
      return { ...state, status: "failed", error: action.error };
    case "cancel":
      return { ...state, status: "cancelled" };
    case "dismiss":
      return { ...initial };
  }
}

/** Shape that the Rust `run_mise_command` IPC handler returns. */
interface RunCommandOk {
  kind: "ok";
  outcome: { stdout: string; stderr: string; exitCode: number; durationMs: number; timedOut: boolean };
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

export function useExecution() {
  const [state, dispatch] = useReducer(reducer, initial);
  // We keep the most recent cancel handle on a ref so the cancel button
  // can find it without re-rendering.
  const cancelRef = useRef<(() => void) | null>(null);

  const run = useCallback(async (request: RunRequest) => {
    if (state.status === "running") return;
    dispatch({ type: "start", request });
    const channel = new Channel<unknown>((msg) => {
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
      const result = (await invoke("run_mise_command", {
        cwd: request.cwd,
        args: request.args,
        onEvent: channel,
      })) as unknown;
      if (cancelled) return;
      if (isRunCommandResult(result)) {
        if (result.kind === "ok") {
          // The Exit event from the channel already updated state.
        } else {
          dispatch({ type: "fail", error: result.err });
        }
      } else {
        dispatch({
          type: "fail",
          error: {
            code: "COMMAND_FAILED",
            message: "unexpected IPC response from run_mise_command",
            stderr: "",
          },
        });
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
  }, [state.status]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  return { state, run, cancel, dismiss };
}
