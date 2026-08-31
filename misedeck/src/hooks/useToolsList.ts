// Hooks for the global tools page (issue #21).
//
//   * useToolsList      → mise ls --json
//   * useOutdatedTools  → mise outdated --json --bump
//   * useLsRemote       → mise ls-remote --json <tool>
//
// Each hook is keyed by the directory context so switching Global ↔ a
// directory refetches the data. The result is the typed JSON Result
// union (`{kind: "ok", ...} | {kind: "err", ...}`) so the consumer
// pattern-matches the same way it does for `useDetectMise` in App.tsx.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { readMiseLockfile, toolsEnv, toolsLs, toolsLsRemote, toolsOutdated } from "../api/mise";
import {
  parseEnvPayload,
  parseLsPayload,
  parseLsRemotePayload,
  parseOutdatedPayload,
  type EnvEntry,
} from "../api/miseTools";
import { useDirectory } from "../state/directoryContext";
import type {
  JsonResult,
  LockfileResult,
  MiseLsItem,
  MiseLsRemoteItem,
  MiseOutdatedItem,
} from "../types/tauri";

/**
 * Read-only mise tool list (`mise ls --json`). Cache key is
 * `["tools", "ls", cwd]` so the per-context cache survives
 * component remounts.
 */
export function useToolsList(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "ls", cwd],
    queryFn: () => toolsLs(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Outdated tools map (`mise outdated --json --bump`). Cache key is
 * `["tools", "outdated", cwd]`.
 */
export function useOutdatedTools(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "outdated", cwd],
    queryFn: () => toolsOutdated(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Upstream versions for a single tool (`mise ls-remote --json <tool>`).
 * Cache key is `["tools", "ls-remote", cwd, tool]`. The hook is
 * disabled when `tool` is empty.
 */
export function useLsRemote(
  tool: string,
): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "ls-remote", cwd, tool],
    queryFn: () => toolsLsRemote(cwd, tool),
    enabled: tool.length > 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Wrap a thrown IPC error (the channel is closed, the Tauri runtime
 * is not available, etc.) as the structured `{kind: "err"}` shape
 * the page renders. The Tauri command itself should never throw on
 * the happy path (it serialises errors into the union), so a thrown
 * error always means a structural failure.
 */
function toErr(error: unknown): JsonResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "err",
    err: { code: "COMMAND_FAILED", message, stderr: "" },
  };
}

/** Parse a `JsonResult` from `useToolsList` into the typed view the
 *  table renders. Returns `{isPending, data, error}` so the caller
 *  never has to walk the raw JSON. */
export function useParsedToolsList(): {
  isPending: boolean;
  data: Array<{ tool: string; items: MiseLsItem[] }> | null;
  error: JsonResult | null;
} {
  const q = useToolsList();
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseLsPayload(q.data.value), error: null };
}

/** Same convenience for `useOutdatedTools`. */
export function useParsedOutdatedTools(): {
  isPending: boolean;
  data: MiseOutdatedItem[] | null;
  error: JsonResult | null;
} {
  const q = useOutdatedTools();
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseOutdatedPayload(q.data.value), error: null };
}

/** Same convenience for `useLsRemote`. */
export function useParsedLsRemote(
  tool: string,
): {
  isPending: boolean;
  data: MiseLsRemoteItem[] | null;
  error: JsonResult | null;
} {
  const q = useLsRemote(tool);
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseLsRemotePayload(q.data.value), error: null };
}

/**
 * `mise env --json` for the current directory context. Cache key is
 * `["tools", "env", cwd]`. Enabled in both global and directory
 * contexts so the config editor (#26) can show the resolved env
 * the user is editing. (The preview page guards against an empty
 * cwd separately; the config page consumes this hook in both
 * contexts and shows an empty list when no vars are returned.)
 */
export function useEnv(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "env", cwd],
    queryFn: () => toolsEnv(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Parse the env payload into typed entries. */
export function useParsedEnv(): {
  isPending: boolean;
  data: EnvEntry[] | null;
  error: JsonResult | null;
} {
  const q = useEnv();
  if (q.isPending) {
    return { isPending: true, data: null, error: null };
  }
  if (q.error) {
    return { isPending: false, data: null, error: toErr(q.error) };
  }
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseEnvPayload(q.data.value), error: null };
}

/** Same for the global context, used to cross-check the project
 *  context and badge project-only env vars correctly. Disabled when
 *  the active context is already global. */
export function useGlobalEnv(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "env", null],
    queryFn: () => toolsEnv(null),
    enabled: cwd !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Parse the global env payload. */
export function useParsedGlobalEnv(): EnvEntry[] | null {
  const q = useGlobalEnv();
  if (q.isPending || q.error || !q.data || q.data.kind === "err") {
    return null;
  }
  return parseEnvPayload(q.data.value);
}

/**
 * Read the project's `mise.lock` file (or `null` when absent). The
 * cache key is `["tools", "lockfile", cwd]`. Disabled when no
 * directory is picked.
 */
export function useLockfile(): UseQueryResult<LockfileResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "lockfile", cwd],
    queryFn: () => readMiseLockfile(cwd),
    enabled: cwd !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
