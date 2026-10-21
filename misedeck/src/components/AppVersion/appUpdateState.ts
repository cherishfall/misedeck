// The silent launch check's persisted state (#238, ADR-0009 revision).
//
// The manual check needed no memory. The launch check needs two facts
// that survive a restart: when it last asked GitHub, and — when an
// answer named a newer build — that build's version and Release page.
// Both live in one localStorage payload so a write cannot record
// "checked just now" while forgetting what was found.
//
// Everything here is pure except `loadUpdateState` / `saveUpdateState`,
// which keep the same swallow-on-failure contract as every other
// persisted value (`usePersistentState`). The component reads the clock;
// these functions only decide.

import { loadPersistent, savePersistent } from "../../hooks/usePersistentState";

/** One JSON payload: `{ lastAttemptAt, available }`. */
export const UPDATE_STATE_KEY = "misedeck.updateCheck.v1";

/** A completed attempt suppresses the next launch check for a day. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The check waits until the shell has settled: it must never compete
 *  with first paint or the first mise reads (issue #238). */
export const LAUNCH_CHECK_DELAY_MS = 10_000;

/** The newer build the last successful check named. */
export interface AvailableUpdate {
  version: string;
  url: string;
}

export interface UpdateState {
  /** Wall-clock time of the last attempt, successful or not. */
  lastAttemptAt: number | null;
  /** The newest build known to exist, or `null`. */
  available: AvailableUpdate | null;
}

export const EMPTY_UPDATE_STATE: UpdateState = {
  lastAttemptAt: null,
  available: null,
};

/** The check outcome this module reasons about — the `AppUpdateResult`
 *  shape minus fields the decision does not read. Structural so tests
 *  never need the Tauri bridge. */
export type CheckOutcome =
  | { status: "available"; version: string; url: string }
  | { status: "current"; version: string }
  | { status: "err" };

/** Parse a stored payload, invalidating anything that does not prove a
 *  usable timestamp and marker. A corrupt or hand-edited value degrades
 *  to "never checked" rather than crashing or inventing a marker. */
export function parseUpdateState(raw: string | null): UpdateState {
  if (raw === null) return EMPTY_UPDATE_STATE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_UPDATE_STATE;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_UPDATE_STATE;
  }
  const record = value as Record<string, unknown>;
  const attempt = record.lastAttemptAt;
  return {
    lastAttemptAt:
      typeof attempt === "number" && Number.isFinite(attempt) && attempt > 0
        ? attempt
        : null,
    available: parseAvailableUpdate(record.available),
  };
}

function parseAvailableUpdate(value: unknown): AvailableUpdate | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const version = typeof record.version === "string" ? record.version.trim() : "";
  if (version === "") return null;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!isHttpUrl(url)) return null;
  return { version, url };
}

/** A marker is only rendered as a link; anything but http(s) is not a
 *  Release page. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function loadUpdateState(): UpdateState {
  return loadPersistent(UPDATE_STATE_KEY, EMPTY_UPDATE_STATE, parseUpdateState);
}

export function saveUpdateState(state: UpdateState): void {
  savePersistent(UPDATE_STATE_KEY, state);
}

/** At most one attempt per window. A missing timestamp is due, and a
 *  timestamp in the future is due too: the clock moved backwards, and
 *  treating that as "not yet" would silence the check until real time
 *  catches up with the old value. */
export function isCheckDue(lastAttemptAt: number | null, now: number): boolean {
  if (
    lastAttemptAt === null ||
    !Number.isFinite(lastAttemptAt) ||
    lastAttemptAt <= 0
  ) {
    return true;
  }
  if (now < lastAttemptAt) return true;
  return now - lastAttemptAt >= CHECK_INTERVAL_MS;
}

/** Is the stored build still newer than the one running? Unparsable
 *  versions answer `false`: the app must not show a marker it cannot
 *  prove, and a build equal to the marker means the user already
 *  upgraded past it. */
export function isStoredUpdateNewer(
  available: AvailableUpdate | null,
  runningVersion: string | null,
): boolean {
  if (available === null || runningVersion === null) return false;
  return isVersionNewer(available.version, runningVersion);
}

/** Fold one check outcome into the persisted state.
 *
 *  - A failure keeps the marker (a build that existed five minutes ago
 *    still exists) and records the attempt.
 *  - `current` clears the marker: the feed just said nothing is newer.
 *  - `available` stores the build only when it really is newer than the
 *    build running now; a feed that lags behind the installed version
 *    must not plant a phantom dot.
 */
export function applyCheckResult(
  state: UpdateState,
  outcome: CheckOutcome,
  runningVersion: string | null,
  now: number,
): UpdateState {
  if (outcome.status === "err") {
    return { lastAttemptAt: now, available: state.available };
  }
  if (outcome.status === "current") {
    return { lastAttemptAt: now, available: null };
  }
  const candidate = { version: outcome.version, url: outcome.url };
  return {
    lastAttemptAt: now,
    available: isStoredUpdateNewer(candidate, runningVersion) ? candidate : null,
  };
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const SEMVER_RE =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(value: string): ParsedVersion | null {
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

/** Semver precedence, which the release tags depend on: `beta.17`
 *  beats `beta.16`, and a final release beats its own betas. Unparsable
 *  input answers `false` — never claim an update we cannot compare. */
function isVersionNewer(candidate: string, running: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(running);
  if (a === null || b === null) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  // Same core: a final release beats any prerelease of itself.
  if (a.prerelease.length === 0) return b.prerelease.length > 0;
  if (b.prerelease.length === 0) return false;
  for (let i = 0; i < a.prerelease.length; i += 1) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return false;
    if (right === undefined) return true;
    if (left === right) continue;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      return Number.parseInt(left, 10) > Number.parseInt(right, 10);
    }
    if (leftNumeric) return false;
    if (rightNumeric) return true;
    return left.localeCompare(right) > 0;
  }
  return false;
}
