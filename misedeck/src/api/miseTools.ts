// Pure parsers for the JSON mise returns from the read-only tools
// commands. The Rust side ships the raw JSON value; this module
// turns it into the typed shapes declared in `types/tauri.ts`. Each
// parser is intentionally tolerant: unknown fields are ignored,
// missing fields fall back to the type's default, and one bad row
// never poisons the rest. The runner is the trust boundary; this
// module is just a presentational convenience.

import type {
  DoctorLine,
  DoctorPayload,
  MiseLsItem,
  MiseLsRemoteItem,
  MiseOutdatedItem,
  MiseSource,
  MiseTask,
  RegistryItem,
  SettingsItem,
} from "../types/tauri";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asOptionalString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : null))
    .filter((x): x is string => x !== null);
}

function asSource(v: unknown): MiseSource | undefined {
  if (v === null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const type = asString(o.type);
  if (type === "") return undefined;
  return {
    type,
    path: asOptionalString(o.path),
  };
}

/** Parse one row of `mise ls --json`. */
export function parseLsItem(value: unknown): MiseLsItem | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const version = asString(o.version);
  // A row with no `version` is not a row we can render.
  if (version === "") return null;
  return {
    version,
    requestedVersion: asOptionalString(o.requestedVersion),
    installPath: asOptionalString(o.installPath),
    symlinkedTo: asOptionalString(o.symlinkedTo),
    source: asSource(o.source),
    installed: asBoolean(o.installed, false),
    active: asBoolean(o.active, false),
  };
}

/** Parse the `mise ls --json` payload (`{tool: [items...]}`). */
export function parseLsPayload(
  value: unknown,
): Array<{ tool: string; items: MiseLsItem[] }> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const out: Array<{ tool: string; items: MiseLsItem[] }> = [];
  for (const [tool, raw] of Object.entries(obj)) {
    if (!Array.isArray(raw)) continue;
    const items: MiseLsItem[] = [];
    for (const row of raw) {
      const parsed = parseLsItem(row);
      if (parsed) items.push(parsed);
    }
    out.push({ tool, items });
  }
  // Stable order: alphabetic by tool name so the table doesn't shuffle
  // between refetches.
  out.sort((a, b) => a.tool.localeCompare(b.tool));
  return out;
}

/** Parse one row of `mise outdated --json --bump`. */
export function parseOutdatedItem(value: unknown): MiseOutdatedItem | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const name = asString(o.name);
  if (name === "") return null;
  return {
    name,
    requested: asOptionalString(o.requested),
    current: asOptionalString(o.current),
    bump: asOptionalString(o.bump),
    latest: asOptionalString(o.latest),
    source: asSource(o.source),
  };
}

/** Parse the `mise outdated --json --bump` payload (`{tool: row}` or `{}`). */
export function parseOutdatedPayload(
  value: unknown,
): MiseOutdatedItem[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const out: MiseOutdatedItem[] = [];
  for (const raw of Object.values(obj)) {
    const parsed = parseOutdatedItem(raw);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Parse the `mise ls-remote --json <tool>` payload (`[rows]`). */
export function parseLsRemotePayload(value: unknown): MiseLsRemoteItem[] {
  if (!Array.isArray(value)) return [];
  const out: MiseLsRemoteItem[] = [];
  for (const row of value) {
    if (row === null || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const version = asString(o.version);
    if (version === "") continue;
    out.push({
      version,
      createdAt: asOptionalString(o.createdAt),
    });
  }
  return out;
}

/**
 * Categorisation for a single env var, used by the directory-preview
 * page to badge each row. The Rust side ships only the flat map from
 * `mise env --json`; the JS side picks a category from a small
 * convention list plus a few well-known mise-managed vars.
 *
 *   * `project` — the var was added by the project mise.toml (we
 *      infer this when the same name is absent from the global
 *      context, or when the var is one of the well-known project
 *      keys we always treat as project-set, e.g. `NODE_ENV`).
 *   * `global` — the var comes from the global config (every var
 *      that the global context also surfaces, with the same value).
 *   * `tool` — a tool-derived var like `JAVA_HOME` or `GOROOT`.
 *   * `default` — inherited from the host environment (e.g. `PATH`).
 */
export type EnvSource = "global" | "project" | "tool" | "default";

export interface EnvEntry {
  /** The env var name. */
  name: string;
  /** The resolved value (always a string for `mise env --json`). */
  value: string;
  /** The source badge category. */
  source: EnvSource;
  /**
   * Optional human-readable suffix, e.g. the tool name that
   * produced a tool-derived var. Used in the badge label.
   */
  sourceDetail?: string;
  /**
   * Absolute path of the config file mise reports as the source,
   * when available (`mise env --json-extended`).
   */
  sourcePath?: string;
  /**
   * Tool name mise reports as the contributor, when available
   * (`mise env --json-extended`).
   */
  sourceTool?: string;
}

/**
 * Well-known env var names that a mise-managed tool typically
 * contributes. The list is deliberately small — when in doubt, fall
 * back to the `default` category and let the user investigate. The
 * mapping is var → tool (used for the badge suffix).
 */
const TOOL_DERIVED: Record<string, string> = {
  JAVA_HOME: "java",
  JAVA_VERSION: "java",
  GOROOT: "go",
  GOBIN: "go",
  GOPATH: "go",
  NODE_OPTIONS: "node",
  NODE_PATH: "node",
  NPM_CONFIG_PREFIX: "node",
  PYTHONHOME: "python",
  PYTHONPATH: "python",
  RUSTUP_HOME: "rust",
  RUSTUP_TOOLCHAIN: "rust",
  CARGO_HOME: "rust",
  CARGO_TARGET_DIR: "rust",
  MISE_ADD_PATH: "mise",
  MISE_INSTALLS: "mise",
};

/** Env vars that are always inherited from the host shell, not
 *  set by mise or a tool. Badged as `default`. */
const DEFAULT_VARS = new Set<string>([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "PWD",
  "OLDPWD",
  "TMPDIR",
  "EDITOR",
  "VISUAL",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
]);

/**
 * Parse the `mise env --json` payload (`{name: value, ...}`) into
 * a flat list of entries with a source category inferred from the
 * conventions above. The order is alphabetical so the table is
 * stable across refetches.
 */
export function parseEnvPayload(value: unknown): EnvEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const out: EnvEntry[] = [];
  for (const [name, raw] of Object.entries(obj)) {
    // `mise env --json` values are always strings, but be tolerant
    // of forks that ship a non-string (e.g. a JSON object) — coerce.
    const v = typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
    let source: EnvSource = "default";
    let sourceDetail: string | undefined;
    if (TOOL_DERIVED[name]) {
      source = "tool";
      sourceDetail = TOOL_DERIVED[name];
    } else if (DEFAULT_VARS.has(name)) {
      source = "default";
    } else {
      // Anything else is treated as coming from the project — the
      // project mise.toml's [env] table is the most common source
      // of a project-localised env var, and the same name is
      // usually absent from the global resolution.
      source = "project";
    }
    out.push({ name, value: v, source, sourceDetail });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function isGlobalConfigPath(path: string): boolean {
  // mise's global config path is conventionally
  // `~/.config/mise/config.toml`; the extended source reports the
  // absolute path. Match the tail so we don't depend on the user's
  // home directory.
  return path.endsWith(".config/mise/config.toml") || path.endsWith("/mise/config.toml");
}

/**
 * Parse the `mise env --json-extended` payload
 * (`{name: {value, source?, tool?}, ...}`) into typed entries. The
 * source path and tool name from mise are preserved; the badge
 * category is derived from them, falling back to the same
 * conventions as `parseEnvPayload` when mise omits source info.
 */
export function parseEnvExtendedPayload(value: unknown): EnvEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const out: EnvEntry[] = [];
  for (const [name, raw] of Object.entries(obj)) {
    let value = "";
    let sourcePath: string | undefined;
    let sourceTool: string | undefined;

    if (typeof raw === "string") {
      // Older mise or a fork that doesn't support --json-extended
      // may return the flat shape. Coerce and fall back to
      // inference.
      value = raw;
    } else if (raw !== null && typeof raw === "object") {
      const entry = raw as Record<string, unknown>;
      const rawValue = entry.value;
      value =
        typeof rawValue === "string"
          ? rawValue
          : rawValue == null
            ? ""
            : JSON.stringify(rawValue);
      sourcePath = asOptionalString(entry.source);
      sourceTool = asOptionalString(entry.tool);
    }

    let source: EnvSource;
    let sourceDetail: string | undefined;
    if (sourceTool && sourceTool.length > 0) {
      source = "tool";
      sourceDetail = sourceTool;
    } else if (sourcePath && isGlobalConfigPath(sourcePath)) {
      source = "global";
    } else if (sourcePath && sourcePath.length > 0) {
      source = "project";
    } else if (TOOL_DERIVED[name]) {
      source = "tool";
      sourceDetail = TOOL_DERIVED[name];
    } else if (DEFAULT_VARS.has(name)) {
      source = "default";
    } else {
      source = "default";
    }

    out.push({
      name,
      value,
      source,
      sourceDetail,
      sourcePath,
      sourceTool,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Infer which entries in the directory context's env are NOT in the
 * global context — those are the project-set ones. Updates the
 * entries' `source` field in place when a project attribute
 * supersedes the convention guess.
 */
export function reconcileEnvSources(
  entries: EnvEntry[],
  globalEntries: EnvEntry[],
): EnvEntry[] {
  const globalByName = new Map(globalEntries.map((e) => [e.name, e]));
  for (const entry of entries) {
    const global = globalByName.get(entry.name);
    if (entry.source === "project") {
      // Keep the project tag. The convention already chose it for
      // anything that isn't tool-derived or default.
      continue;
    }
    if (entry.source === "tool" || entry.source === "default") {
      // Tool-derived and default vars stay where they are — the
      // project doesn't change the fact that JAVA_HOME comes from
      // java or PATH comes from the host.
      continue;
    }
    if (!global) {
      // The global context doesn't have this var, but the
      // directory does — it must have come from the project.
      entry.source = "project";
    }
  }
  return entries;
}

// ---------- Tasks (issue #27) ----------

/** Parse one row of `mise tasks ls --json`. Tolerant: missing
 *  fields fall back to the type's default, and a row without a
 *  `name` is dropped (the name is the only stable key the table
 *  needs). The `run` field is preserved as an array — the page
 *  joins it for display. */
export function parseTask(value: unknown): MiseTask | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const name = asString(o.name);
  if (name === "") return null;
  return {
    name,
    aliases: asStringArray(o.aliases),
    description: asString(o.description),
    run: asStringArray(o.run),
    depends: asStringArray(o.depends),
    source: asString(o.source),
    dir: asString(o.dir),
    hide: asBoolean(o.hide, false),
  };
}

/** Parse the `mise tasks ls --json` payload (`[MiseTask]`). The
 *  result is sorted alphabetically by name so the table is stable
 *  across refetches. A non-array payload yields an empty list. */
export function parseTasksLsPayload(value: unknown): MiseTask[] {
  if (!Array.isArray(value)) return [];
  const out: MiseTask[] = [];
  for (const row of value) {
    const parsed = parseTask(row);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Flatten a `MiseTask.run` array into a single human-readable
 *  string. mise represents a multi-line `run` as one entry per
 *  line; for v1 we join with a space and surface the result
 *  verbatim. Empty arrays surface as an em-dash so the column
 *  still has a placeholder when a task has no run (e.g. a task
 *  defined only by sources / outputs). */
export function taskRunDisplay(run: string[]): string {
  if (run.length === 0) return "";
  return run.join(" ");
}

/** Split a comma-separated depends string into a trimmed,
 *  empty-dropped array. The text input on the edit form
 *  produces this shape; the argv builder consumes it. */
export function parseDependsInput(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------- Settings / doctor / registry (issue #29) ----------

/** Parse the `mise settings ls --json-extended` payload into typed
 *  rows. Unknown or non-object values are dropped so a single bad
 *  entry never poisons the table. */
export function parseSettingsPayload(value: unknown): SettingsItem[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const out: SettingsItem[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (raw === null || typeof raw !== "object") {
      // Fallback for the plain `--json` shape (key → value) when
      // `--json-extended` is not available.
      out.push({ key, value: raw });
      continue;
    }
    const entry = raw as Record<string, unknown>;
    out.push({
      key,
      value: entry.value,
      type: asOptionalString(entry.type),
      description: asOptionalString(entry.description),
      source: asOptionalString(entry.source),
    });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/** Parse the `mise doctor --json` payload. Tolerant: the fallback
 *  shape keeps the raw lines under `rawLines`. The real mise JSON uses
 *  snake_case keys, so the parser normalises the fields the UI reads
 *  to camelCase while preserving everything else. */
export function parseDoctorPayload(value: unknown): DoctorPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const out: DoctorPayload = { ...raw };
  if (raw.shims_on_path !== undefined) {
    out.shimsOnPath = !!raw.shims_on_path;
  }
  if (raw.self_update_available !== undefined) {
    out.selfUpdateAvailable = !!raw.self_update_available;
  }
  if (Array.isArray(raw.config_files)) {
    out.configFiles = raw.config_files.map((v) => String(v));
  }
  if (Array.isArray(raw.warnings)) {
    out.warnings = raw.warnings.map((v) => String(v));
  }
  if (raw.toolset !== null && typeof raw.toolset === "object" && !Array.isArray(raw.toolset)) {
    out.toolset = raw.toolset as Record<string, Array<{ version: string }>>;
  }
  if (raw.shell !== null && typeof raw.shell === "object" && !Array.isArray(raw.shell)) {
    out.shell = raw.shell as { name?: string; version?: string };
  }
  if (typeof raw.activated === "boolean") {
    out.activated = raw.activated;
  }
  if (typeof raw.version === "string") {
    out.version = raw.version;
  }
  if (Array.isArray(raw.rawLines)) {
    out.rawLines = raw.rawLines as DoctorLine[];
  }
  if (typeof raw.rawText === "string") {
    out.rawText = raw.rawText;
  }
  return out;
}

/** Parse one `mise registry --json` row. */
export function parseRegistryItem(value: unknown): RegistryItem | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const short = asString(o.short);
  if (short === "") return null;
  return {
    short,
    backends: asStringArray(o.backends),
    description: asOptionalString(o.description),
    aliases: asStringArray(o.aliases),
  };
}

/** Parse the `mise registry --json` payload (`[RegistryItem]`). */
export function parseRegistryPayload(value: unknown): RegistryItem[] {
  if (!Array.isArray(value)) return [];
  const out: RegistryItem[] = [];
  for (const row of value) {
    const parsed = parseRegistryItem(row);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => a.short.localeCompare(b.short));
  return out;
}
