// lsRemoteInFlight — one `mise ls-remote --json <tool>` per key at a time
// (issue #290).
//
// The AddToolSection effect used to guard only on "is the query cache
// empty yet?", which answers "has a read finished", never "is one
// running". Picking tool A, deselecting, and re-picking A inside the
// read's several-second window therefore dispatched the same command a
// second time — and StrictMode's double mount did it on every first
// selection. The cache cannot close that gap; a per-key promise can.
//
// The promise is dropped as soon as it settles, so a later selection (or
// the retry button, which clears the cache entry first) dispatches
// again. `reset()` exists for tests; production never calls it.

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `dispatch` unless an identical key is already in flight, in which
 * case that promise is reused. The key is the caller's: it must identify
 * the command (directory context + tool), not the cache entry.
 */
export function dispatchOnce<T>(key: string, dispatch: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing as Promise<T>;
  const promise = dispatch().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/** Test-only: forget every in-flight promise. */
export function resetInFlight(): void {
  inFlight.clear();
}

/** Test-only: how many keys are currently in flight. */
export function inFlightCount(): number {
  return inFlight.size;
}
