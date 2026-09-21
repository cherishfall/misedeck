// Hooks for the settings, doctor, and plugins pages plus the Tools
// page's registry search (issues #29 + #51 + #134).
//
// Each hook is keyed by the directory context so switching Global ↔ a
// directory refetches the data. The result is the typed JSON Result
// union (`{kind: "ok", ...} | {kind: "err", ...}`) so the consumer
// pattern-matches the same way the tools page does.
//
// The `settings ls` read routes through the execution panel's runner
// (ADR-0005, issue #162) rather than its own Tauri command (removed once
// no callers remained, same as the tools `ls` family): the read is
// visible in the execution panel and runs once.

import { useCallback } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { doctor, pluginsLs, registry } from "../api/mise";
import {
  parseDoctorPayload,
  parsePluginsLsPayload,
  parseRegistryPayload,
  parseSettingsPayload,
} from "../api/miseTools";
import { toJsonResult, useExecutionContext } from "../components/ExecutionPanel";
import { useDirectory } from "../state/directoryContext";
import type {
  DoctorPayload,
  InstalledPlugin,
  JsonResult,
  RegistryItem,
  SettingsItem,
} from "../types/tauri";

/** Build the `mise settings ls` argv, mirroring the Rust helper
 *  `mise_settings_ls` (issue #29). `--all` lists unset keys with their
 *  defaults (issue #52); `--local` restricts the list to the project
 *  config when the context is a directory. */
function settingsLsArgs(all: boolean, local: boolean): string[] {
  const args = ["settings", "ls", "--json-extended"];
  if (all) args.push("--all");
  if (local) args.push("--local");
  return args;
}

/** Read-only mise settings list (`mise settings ls --json-extended`).
 *  Cache key is `["settings", "ls", cwd, all]`. The table loads itself,
 *  so this read is dispatched in the background: the same runner, but
 *  it must not replace the transcript the user is reading (a write's
 *  log, typically, since a successful write invalidates this very
 *  query — ADR-0005). */
export function useSettingsList(all: boolean): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  const { run } = useExecutionContext();
  const read = useCallback(
    async (dir: string | null, argv: string[]) =>
      toJsonResult(await run({ cwd: dir, args: argv }, { background: true })),
    [run],
  );
  return useQuery({
    queryKey: ["settings", "ls", cwd, all],
    queryFn: () => read(cwd, settingsLsArgs(all, cwd !== null)),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Parse a `JsonResult` from `useSettingsList` into typed rows. */
export function useParsedSettingsList(all: boolean): {
  isPending: boolean;
  data: SettingsItem[] | null;
  error: JsonResult | null;
} {
  const q = useSettingsList(all);
  if (q.isPending) return { isPending: true, data: null, error: null };
  if (q.error) return { isPending: false, data: null, error: toErr(q.error) };
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseSettingsPayload(q.data.value), error: null };
}

/** Read-only mise doctor check (`mise doctor --json`). Cache key is
 *  `["doctor", cwd]`. */
export function useDoctor(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["doctor", cwd],
    queryFn: () => doctor(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Parse a `JsonResult` from `useDoctor` into a typed payload. */
export function useParsedDoctor(): {
  isPending: boolean;
  data: DoctorPayload | null;
  error: JsonResult | null;
} {
  const q = useDoctor();
  if (q.isPending) return { isPending: true, data: null, error: null };
  if (q.error) return { isPending: false, data: null, error: toErr(q.error) };
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseDoctorPayload(q.data.value), error: null };
}

/** Read-only mise registry list (`mise registry --json`). Cache key is
 *  `["registry", cwd]`. */
export function useRegistry(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["registry", cwd],
    queryFn: () => registry(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Parse a `JsonResult` from `useRegistry` into typed rows. */
export function useParsedRegistry(): {
  isPending: boolean;
  data: RegistryItem[] | null;
  error: JsonResult | null;
} {
  const q = useRegistry();
  if (q.isPending) return { isPending: true, data: null, error: null };
  if (q.error) return { isPending: false, data: null, error: toErr(q.error) };
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parseRegistryPayload(q.data.value), error: null };
}

/** Read-only installed plugins list (`mise plugins ls --urls`,
 *  issue #51). Cache key is `["plugins", "ls", cwd]`. */
export function usePluginsList(): UseQueryResult<JsonResult> {
  const { cwd } = useDirectory();
  return useQuery({
    queryKey: ["plugins", "ls", cwd],
    queryFn: () => pluginsLs(cwd),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Parse a `JsonResult` from `usePluginsList` into typed rows. */
export function useParsedPluginsList(): {
  isPending: boolean;
  data: InstalledPlugin[] | null;
  error: JsonResult | null;
} {
  const q = usePluginsList();
  if (q.isPending) return { isPending: true, data: null, error: null };
  if (q.error) return { isPending: false, data: null, error: toErr(q.error) };
  if (!q.data || q.data.kind === "err") {
    return { isPending: false, data: null, error: q.data ?? null };
  }
  return { isPending: false, data: parsePluginsLsPayload(q.data.value), error: null };
}

/** Wrap a thrown IPC error as the structured `{kind: "err"}` shape
 *  the page renders. */
function toErr(error: unknown): JsonResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "err",
    err: { code: "COMMAND_FAILED", message, stderr: "" },
  };
}
