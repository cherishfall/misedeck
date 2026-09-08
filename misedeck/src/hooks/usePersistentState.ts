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

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Read a persisted value, falling back to `initial` on a missing key,
 *  corrupt JSON, or a denied storage. */
export function loadPersistent<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

/** Write a persisted value; failures are swallowed (quota, private mode). */
export function savePersistent<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
