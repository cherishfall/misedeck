// Hooks for the tasks page (issue #27).
//
//   * useTasksList     → mise tasks ls --json
//   * useParsedTasksList — typed view the page renders
//
// The hook is keyed by the directory context (`["tasks", "ls", cwd]`)
// so switching Global ↔ a directory refetches the data, the same
// way the tools / preview hooks do. When no directory is picked
// the page renders the `globalEmpty` state instead of fetching
// (the architecture doc prescribes per-directory scoping for
// tasks; the global task list is meaningful only for the global
// `~/.config/mise/config.toml` and is not in scope for v1).

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { tasksLs } from "../api/mise";
import { parseTasksLsPayload } from "../api/miseTools";
import { useDirectory } from "../state/directoryContext";
import type { JsonResult, MiseTask } from "../types/tauri";

/**
 * Read-only task list (`mise tasks ls --json`). Cache key is
 * `["tasks", "ls", cwd]`. Disabled in the global context so the
 * global empty state is the only thing the page renders — the
 * task list is meaningful per-directory, not globally.
 */
export function useTasksList(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tasks", "ls", cwd],
    queryFn: () => tasksLs(cwd),
    enabled: cwd !== null,
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
