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

import { readMiseLockfile, configFiles, toolsEnv, toolsLs, toolsLsRemote, toolsOutdated } from "../api/mise";
import {
  parseEnvPayload,
  parseLsPayload,
  parseLsRemotePayload,
  parseOutdatedPayload,
  type EnvEntry,
} from "../api/miseTools";
import { useDirectory } from "../state/directoryContext";
import type {
  ConfigFilesResult,
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
 * contexts: the env page (#41) shows the resolved env the user is
 * editing, and the preview page (#48) renders the globally resolved
 * env in the Global context.
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
 * Read the current directory's `mise.lock` file (or `null` when
 * absent). The cache key is `["tools", "lockfile", cwd]`. Enabled in
 * both directory and Global contexts (issue #48): the runner reports
 * `null` for the Global context (the lockfile is a per-directory
 * artifact), so the section renders its muted "missing" line.
 */
export function useLockfile(): UseQueryResult<LockfileResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "lockfile", cwd],
    queryFn: () => readMiseLockfile(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * `mise config ls --json` for the current directory context — the
 * config files mise loads, in precedence order (highest first), each
 * with its raw text for the preview page's read-only content view
 * (issue #42). The cache key is `["tools", "config", cwd]`. Enabled
 * in both Global and directory contexts: in Global the runner
 * reports the global config files.
 */
export function useConfigFiles(): UseQueryResult<ConfigFilesResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["tools", "config", cwd],
    queryFn: () => configFiles(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
