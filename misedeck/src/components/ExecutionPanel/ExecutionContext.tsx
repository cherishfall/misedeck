// ExecutionContext — lifts the useExecution reducer out of the panel
// so any page can trigger an install, self-update, or arbitrary mise
// command. The panel is presentational; the state machine lives here.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useExecution } from "./useExecution";
import type {
  ExecutionState,
  LogLine,
  RunRequest,
  RunEntry,
  ExecutionKind,
  RunCommandResult,
  RunOptions,
} from "./useExecution";

interface ExecutionContextValue {
  state: ExecutionState;
  /** Every run the panel knows about, each with its own isolated
   *  transcript (issue #138). A background run is never in this list. */
  runs: RunEntry[];
  /** Which run the panel is currently transcribing. */
  activeRunId: string | null;
  /** Switch the panel's transcript to the given run. */
  selectRun: (id: string) => void;
  /** Run an arbitrary `mise <args>` command and return its structured
   *  result, so read queries can cache what the panel already ran
   *  instead of invoking mise again (ADR-0005). Never rejects because
   *  another command is running (#138). */
  run: (request: RunRequest, options?: RunOptions) => Promise<RunCommandResult>;
  /** Run the official install script. Streams into the panel. */
  runInstall: () => Promise<void>;
  /** Run `mise self-update --yes`. Streams into the panel. */
  runSelfUpdate: () => Promise<void>;
  /** Run `mise trust` for the given directory. Streams into the panel
   *  and returns the structured result — with concurrent runs (#138)
   *  the caller cannot rely on the panel's active-run projection. */
  runTrust: (cwd: string | null) => Promise<RunCommandResult>;
  cancel: () => void;
  /** Hide the panel while preserving history. */
  dismiss: () => void;
  /** Re-open a hidden panel to inspect an active run or history. */
  openPanel: () => void;
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const {
    state,
    runs,
    activeRunId,
    selectRun,
    run,
    runInstall,
    runSelfUpdate,
    runTrust,
    cancel,
    dismiss,
    openPanel,
  } = useExecution();
  const value = useMemo<ExecutionContextValue>(
    () => ({
      state,
      runs,
      activeRunId,
      selectRun,
      run,
      runInstall,
      runSelfUpdate,
      runTrust,
      cancel,
      dismiss,
      openPanel,
    }),
    [
      state,
      runs,
      activeRunId,
      selectRun,
      run,
      runInstall,
      runSelfUpdate,
      runTrust,
      cancel,
      dismiss,
      openPanel,
    ],
  );
  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}

export function useExecutionContext(): ExecutionContextValue {
  const v = useContext(ExecutionContext);
  if (!v) {
    throw new Error("useExecutionContext must be used inside <ExecutionProvider>");
  }
  return v;
}

/**
 * `useOwnRun` — per-action run-locking (issue #138). It wraps the panel's
 * `run()` and exposes an `isRunning` flag that is true only while the
 * command *this hook instance* dispatched is in flight. A control that
 * calls this hook's `run` freezes only for its own command; a long
 * install on another page (or another action on the same page) no longer
 * disables it. The flag is set before the await and cleared in a
 * `finally`, and is guarded against a `setState` after unmount.
 *
 * Use one hook instance per command-firing action, not one per page, so a
 * page that fires several commands keeps each control's lock to itself.
 */
export function useOwnRun() {
  const { run } = useExecutionContext();
  const [isRunning, setIsRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);
  const runOwn = useCallback(
    async (request: RunRequest, options?: RunOptions): Promise<RunCommandResult> => {
      setIsRunning(true);
      try {
        return await run(request, options);
      } finally {
        if (mounted.current) setIsRunning(false);
      }
    },
    [run],
  );
  return { run: runOwn, isRunning };
}

// Re-export types for consumers that imported them from the panel index.
export type {
  ExecutionState,
  LogLine,
  RunRequest,
  RunEntry,
  ExecutionKind,
  RunCommandResult,
  RunOptions,
};
