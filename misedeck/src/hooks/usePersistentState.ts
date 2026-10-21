// usePersistentState — the app's single localStorage-backed state
// mechanism (issue #108). UI chrome state — sidebar collapsed, execution
// panel open/height, per-table pageSize — persists across restarts
// through this hook rather than per-page one-offs.
//
// Values are JSON-serialized under the caller's full key
// (`misedeck.<purpose>.<scope>`), the same naming style as the table
// column widths (`misedeck.tableWidths.<key>`, issue #104). A missing or
// corrupt payload falls back to the declared initial value; a quota or
// serialization failure drops persistence, never the interaction.
// Reducer-based state (the execution panel's `isOpen`) reuses the
// exported load/save pair directly so every persisted value shares one
// serialization contract.
//
// The theme and language keys predate JSON persistence and stay raw
// strings (`light`, `en`): `index.html`'s pre-paint script and
// i18next's language detector read them without going through this
// module. Both call sites pass an identity codec, so the guarded read
// and write still cover them (issue #257 — a throwing localStorage at
// boot must not blank the window).

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Read a persisted value, falling back to `initial` on a missing key,
 *  a decode failure, or a denied storage. `parse` overrides the default
 *  JSON decoding for keys whose on-disk format is a raw string. */
export function loadPersistent<T>(
  key: string,
  initial: T,
  parse: (raw: string) => T = (raw) => JSON.parse(raw) as T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return initial;
    return parse(raw);
  } catch {
    return initial;
  }
}

/** Write a persisted value; failures are swallowed (quota, private mode).
 *  `stringify` overrides the default JSON encoding for raw-string keys. */
export function savePersistent<T>(
  key: string,
  value: T,
  stringify: (value: T) => string = (value) => JSON.stringify(value),
): void {
  try {
    localStorage.setItem(key, stringify(value));
  } catch {
    // Persistence is best-effort; the in-memory state stays authoritative.
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadPersistent(key, initial));
  useEffect(() => {
    savePersistent(key, value);
  }, [key, value]);
  return [value, setValue];
}
