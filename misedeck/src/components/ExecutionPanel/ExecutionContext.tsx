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
import type { ExecutionState, LogLine, RunRequest, ExecutionKind } from "./useExecution";

interface ExecutionContextValue {
  state: ExecutionState;
  /** Run an arbitrary `mise <args>` command. */
  run: (request: RunRequest) => Promise<void>;
  /** Run the official install script. Streams into the panel. */
  runInstall: () => Promise<void>;
  /** Run `mise self-update`. Streams into the panel. */
  runSelfUpdate: () => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const { state, run, runInstall, runSelfUpdate, cancel, dismiss } = useExecution();
  const value = useMemo<ExecutionContextValue>(
    () => ({ state, run, runInstall, runSelfUpdate, cancel, dismiss }),
    [state, run, runInstall, runSelfUpdate, cancel, dismiss],
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
export type { ExecutionState, LogLine, RunRequest, ExecutionKind };
