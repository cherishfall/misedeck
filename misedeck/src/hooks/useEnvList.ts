// Hooks for the first-class Env page (issue #41).
//
//   * useEnvList → mise env --json-extended (with source)
//
// Each hook is keyed by the directory context so switching Global ↔ a
// directory refetches the data.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { envLs } from "../api/mise";
import { readEnvExtendedPayload, type EnvEntry } from "../api/miseTools";
import { useDirectory } from "../state/directoryContext";
import { ipcFailedMessage, runtimeErrorText } from "../utils/appError";
import { CONFIG_DEPENDENT_STALE_TIME } from "./configDependents";
import type { JsonResult } from "../types/tauri";

/**
 * Wrap a thrown IPC error as the structured `{kind: "err"}` shape
 * the page renders.
 *
 * The detail is the key-shaped IPC failure (issue #311): MiseDeck's
 * words live in the catalog, and the runtime's own message rides along
 * as the message's data — so a zh-CN page never shows an English
 * sentence.
 */
function toErr(error: unknown): JsonResult {
  return {
    kind: "err",
    err: {
      code: "COMMAND_FAILED",
      message: ipcFailedMessage(runtimeErrorText(error)),
      stderr: "",
    },
  };
}

/**
 * Read-only resolved env list with source annotations
 * (`mise env --json-extended`). Cache key is `["env", "ls", cwd]`.
 */
export function useEnvList(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["env", "ls", cwd],
    queryFn: () => envLs(cwd),
    staleTime: CONFIG_DEPENDENT_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Convenience wrapper that parses `useEnvList` into typed entries.
 *  Classified against the canonical cwd (issue #305): mise reports
 *  source paths canonically, so the raw context path would class the
 *  active directory's own config as a parent config on a symlinked
 *  prefix. */
export function useParsedEnvList(): {
  isPending: boolean;
  data: EnvEntry[] | null;
  error: JsonResult | null;
} {
  const q = useEnvList();
  const { canonicalCwd } = useDirectory();
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  const parsed = readEnvExtendedPayload(q.data.value, canonicalCwd);
  return { isPending: false, data: parsed.data, error: parsed.error };
}

