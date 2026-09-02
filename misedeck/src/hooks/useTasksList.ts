// Hooks for the tasks page (issue #27).
//
//   * useTasksList     → mise tasks ls --json
//   * useParsedTasksList — typed view the page renders
//
// The hook is keyed by the directory context (`["tasks", "ls", cwd]`)
// so switching Global ↔ a directory refetches the data, the same
// way the tools / preview hooks do. Enabled in both contexts: in the
// Global context the runner runs without `-C`, which resolves the
// global tasks exactly like `mise tasks ls` in the home directory
// (issue #48).

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { tasksLs } from "../api/mise";
import { parseTasksLsPayload } from "../api/miseTools";
import { useDirectory } from "../state/directoryContext";
import type { JsonResult, MiseTask } from "../types/tauri";

/**
 * Read-only task list (`mise tasks ls --json`). Cache key is
 * `["tasks", "ls", cwd]`. Runs in the Global context too (issue
 * #48): without `-C`, mise resolves the global task list.
 */
export function useTasksList(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tasks", "ls", cwd],
    queryFn: () => tasksLs(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Wrap a thrown IPC error (channel closed, runtime torn down,
 * etc.) as the structured `{kind: "err"}` shape the page
 * renders. The Tauri command itself should never throw on the
 * happy path, so a thrown error always means a structural
 * failure.
 */
function toErr(error: unknown): JsonResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "err",
    err: { code: "COMMAND_FAILED", message, stderr: "" },
  };
}

/** Parse a `JsonResult` from `useTasksList` into the typed
 *  view the table renders. Returns `{isPending, data, error}`
 *  so the caller never has to walk the raw JSON. */
export function useParsedTasksList(): {
  isPending: boolean;
  data: MiseTask[] | null;
  error: JsonResult | null;
} {
  const q = useTasksList();
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseTasksLsPayload(q.data.value), error: null };
}
