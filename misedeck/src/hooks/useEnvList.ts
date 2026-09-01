// Hooks for the first-class Env page (issue #41).
//
//   * useEnvList      → mise env --json-extended (with source)
//   * useGlobalEnvList → mise env --json-extended for the global context
//
// Each hook is keyed by the directory context so switching Global ↔ a
// directory refetches the data.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { envLs } from "../api/mise";
import { parseEnvExtendedPayload, type EnvEntry } from "../api/miseTools";
import { useDirectory } from "../state/directoryContext";
import type { JsonResult } from "../types/tauri";

/**
 * Wrap a thrown IPC error as the structured `{kind: "err"}` shape
 * the page renders.
 */
function toErr(error: unknown): JsonResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "err",
    err: { code: "COMMAND_FAILED", message, stderr: "" },
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
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Global resolved env list (`mise env --json-extended` with no `-C`).
 * Disabled when the active context is already global.
 */
export function useGlobalEnvList(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["env", "ls", null],
    queryFn: () => envLs(null),
    enabled: cwd !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Convenience wrapper that parses `useEnvList` into typed entries. */
export function useParsedEnvList(): {
  isPending: boolean;
  data: EnvEntry[] | null;
  error: JsonResult | null;
} {
  const q = useEnvList();
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseEnvExtendedPayload(q.data.value), error: null };
}

/** Convenience wrapper that parses `useGlobalEnvList`. */
export function useParsedGlobalEnvList(): EnvEntry[] | null {
  const q = useGlobalEnvList();
  if (q.isPending || q.error || !q.data || q.data.kind === "err") {
    return null;
  }
  return parseEnvExtendedPayload(q.data.value);
}
