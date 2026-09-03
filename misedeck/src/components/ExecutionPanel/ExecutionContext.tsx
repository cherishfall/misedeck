// ExecutionContext — lifts the useExecution reducer out of the panel
// so any page can trigger an install, self-update, or arbitrary mise
// command. The panel is presentational; the state machine lives here.

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useExecution } from "./useExecution";
import type {
  ExecutionState,
  LogLine,
  RunRequest,
  ExecutionKind,
  RunCommandResult,
  RunOptions,
} from "./useExecution";

interface ExecutionContextValue {
  state: ExecutionState;
  /** Run an arbitrary `mise <args>` command and return its structured
   *  result, so read queries can cache what the panel already ran
   *  instead of invoking mise again (ADR-0005). */
  run: (request: RunRequest, options?: RunOptions) => Promise<RunCommandResult>;
  /** Run the official install script. Streams into the panel. */
  runInstall: () => Promise<void>;
  /** Run `mise self-update`. Streams into the panel. */
  runSelfUpdate: () => Promise<void>;
  /** Run `mise trust` for the given directory. Streams into the panel. */
  runTrust: (cwd: string | null) => Promise<void>;
  cancel: () => void;
  /** Hide the panel while preserving history. */
  dismiss: () => void;
  /** Re-open a hidden panel to inspect an active run or history. */
  openPanel: () => void;
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const { state, run, runInstall, runSelfUpdate, runTrust, cancel, dismiss, openPanel } = useExecution();
  const value = useMemo<ExecutionContextValue>(
    () => ({ state, run, runInstall, runSelfUpdate, runTrust, cancel, dismiss, openPanel }),
    [state, run, runInstall, runSelfUpdate, runTrust, cancel, dismiss, openPanel],
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

// Re-export types for consumers that imported them from the panel index.
export type {
  ExecutionState,
  LogLine,
  RunRequest,
  ExecutionKind,
  RunCommandResult,
  RunOptions,
};
