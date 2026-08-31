// Pure parsers for the JSON mise returns from the read-only tools
// commands. The Rust side ships the raw JSON value; this module
// turns it into the typed shapes declared in `types/tauri.ts`. Each
// parser is intentionally tolerant: unknown fields are ignored,
// missing fields fall back to the type's default, and one bad row
// never poisons the rest. The runner is the trust boundary; this
// module is just a presentational convenience.

import type { MiseLsItem, MiseLsRemoteItem, MiseOutdatedItem, MiseSource } from "../types/tauri";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asOptionalString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
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
