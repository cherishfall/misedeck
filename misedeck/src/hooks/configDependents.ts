// One home for "which cached views does a write to mise state change?"
// (issue #285).
//
// Every page that mutates mise state — `mise use` / `unuse` / `install` /
// `uninstall` / `upgrade` / `link`, `mise tasks add`, `mise set` /
// `unset`, `mise settings set` / `unset`, `mise plugins install` /
// `uninstall`, and `mise trust` — call this helper on success instead of
// invalidating only the list their own page renders. A config write is
// visible on every page that reads the config: the Tools table, the
// Preview page's config text, lockfile, and resolved env, the Env page's
// sourced env list, the task list (tasks live in the same file), and the
// installed-plugin list.
//
// Key families (verified against the app-wide query-key inventory, not
// copied from the ticket):
//
//   ["tools", "config", cwd]     config files + their raw text (Preview)
//   ["tools", "lockfile", cwd]   mise.lock (Preview)
//   ["tools", "ls", cwd]         requested + installed tools (Tools)
//   ["tools", "env", cwd]        resolved tool-injected env (Preview)
//   ["env", "ls", cwd]           sourced env list (Env)
//   ["tasks", "ls", cwd]         task list (Tasks)
//   ["plugins", "ls", cwd]       installed plugins (Plugins)
//
// The Global (`null`) variants are invalidated too when the active context
// is a directory: the global config participates in every directory's
// resolution, the installed-version set on disk is global, and the Env /
// Preview pages cross-check `["tools", "env", null]` and
// `["env", "ls", null]` against the project read. Invalidation only
// refetches *active* queries, so the extra keys cost nothing until a
// global view is on screen.
//
// Deliberately not here:
//   * ["tools", "outdated", cwd] — derived from the config but backed by a
//     network call (`mise outdated`), which is why it carries a 5-minute
//     staleTime (issue #199). The Tools page invalidates it next to this
//     helper, where its own writes happen.
//   * ["tools", "ls-remote", cwd, tool] — upstream versions, unaffected by
//     local state; the toolbar refresh drops it (issue #269).
//   * ["settings", "ls", cwd, all] — the Settings page's own read, invalidated
//     by its own write path; no other page's write changes the settings set.
//   * ["mise", "detect"], ["mise", "trust", cwd] — mise binary / trust probe,
//     not config-derived views.
//   * ["registry", cwd], ["doctor", cwd] — static-ish reads; the page refresh
//     covers the registry (issue #181).

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * The key families a successful mise-state write invalidates. Each family
 * is `[group, name]`; the directory context and (for a directory context)
 * the Global `null` variant are appended by `configDependentKeys`.
 */
export const CONFIG_DEPENDENT_FAMILIES = [
  ["tools", "config"],
  ["tools", "lockfile"],
  ["tools", "ls"],
  ["tools", "env"],
  ["env", "ls"],
  ["tasks", "ls"],
  ["plugins", "ls"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

/**
 * Config-dependent reads refetch on every mount (issue #285). The app
 * default is a 30-second staleTime, which let a page remount inside the
 * window show data written elsewhere before the write; these reads are
 * local and cheap (`mise ls`, `mise env`, `mise config ls`, a lockfile
 * read), so mount-time refetch is the honest default. This also covers
 * changes made outside the GUI — the CLI or a text editor — which no
 * write hook can observe.
 */
export const CONFIG_DEPENDENT_STALE_TIME = 0;

/** Every cache key a write to mise state invalidates for `cwd`. Pure;
 *  the single source of truth the test pins. */
export function configDependentKeys(cwd: string | null): QueryKey[] {
  return CONFIG_DEPENDENT_FAMILIES.flatMap((family) => {
    const active: QueryKey = [...family, cwd];
    if (cwd === null) return [active];
    const global: QueryKey = [...family, null];
    return [active, global];
  });
}

/**
 * Invalidate every config-dependent view. Call it on the success branch
 * of a write command — never on failure (a failed run changed nothing).
 */
export function invalidateConfigDependents(
  queryClient: QueryClient,
  cwd: string | null,
): void {
  for (const queryKey of configDependentKeys(cwd)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
