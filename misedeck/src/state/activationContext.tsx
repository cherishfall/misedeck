// Activation context — the activation entry points (issue #28).
//
// Three affordances live here, lifted out of the page layer so
// every page can use them:
//
//   * `useActivation().state`  — the result of the shell
//                                 activation probe (running /
//                                 missing / present / unknown /
//                                 error). Probed once on app
//                                 start; the result is held in
//                                 React state and re-fetched
//                                 when the user clicks "Check
//                                 again" (the only "refresh"
//                                 surface in this provider).
//   * `useActivation().openInTerminal(path)` — calls the
//                                 `open_in_terminal` Tauri
//                                 command; the result is
//                                 surfaced as a one-shot
//                                 `openOutcome` (success or
//                                 error message) that the
//                                 caller can render.
//   * `useActivation().dismissBanner()` — persists the
//                                 "dismissed" flag in
//                                 localStorage so the banner
//                                 does not reappear on every
//                                 launch. The flag is
//                                 per-shell: a user with zsh +
//                                 bash can dismiss zsh and
//                                 still see the bash banner.
//
// Persistence: the dismissed-shell list lives in localStorage
// under a versioned key. The activation status itself is NOT
// persisted — the probe runs on every app start so the
// "activation present" state is always fresh.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  openInTerminal as invokeOpenInTerminal,
  shellActivationCheck,
} from "../api/mise";
import type {
  ActivationStatus,
  AppError,
  TerminalOpenOutcome,
} from "../types/tauri";

/** The UI's view of the activation probe. Mirrors the
 *  `TrustState` shape (issue #25) so the banner code reads the
 *  same way. */
export type ActivationState =
  | { kind: "unknown" }
  | { kind: "loading" }
  | { kind: "ok"; status: ActivationStatus }
  | { kind: "error"; message: string };

/** One-shot outcome of an `openInTerminal` call. The provider
 *  holds the latest one and clears it when the caller re-reads
 *  via `consumeOpenOutcome`. The shape lets the page render a
 *  transient toast without owning its own reducer. */
export type OpenTerminalOutcome =
  | { kind: "ok"; outcome: TerminalOpenOutcome }
  | { kind: "error"; error: AppError; path: string | null };

interface ActivationContextValue {
  state: ActivationState;
  /** True when the user has dismissed the banner for the
   *  current shell family. The banner re-evaluates on each
   *  app start; if the shell changes, the dismissed flag
   *  resets. */
  dismissed: boolean;
  /** Run the probe now (e.g. after the user clicks "check
   *  again"). The result replaces `state`. */
  recheck: () => Promise<void>;
  /** Persist the dismiss flag for the active shell. */
  dismissBanner: () => void;
  /** Clear the dismiss flag for the active shell (used by the
   *  "dismissed earlier" recovery flow). */
  undismissBanner: () => void;
  /** Open a terminal at `path` (or `$HOME` when null). The
   *  result is published as `openOutcome`; consume it via
   *  `consumeOpenOutcome`. */
  openInTerminal: (path: string | null) => Promise<void>;
  /** Latest open-in-terminal outcome, or `null` when none has
   *  run since the last consume. */
  openOutcome: OpenTerminalOutcome | null;
  /** Pop the latest `openOutcome` (returns the value and
   *  clears it). */
  consumeOpenOutcome: () => OpenTerminalOutcome | null;
  /** Build the one-liner the user pastes into their rc file
   *  for the active shell. Mirrors the Rust `ShellKind::
   *  activation_line` so the JS side has a fallback when the
   *  Rust call has not yet returned. The Rust call is the
   *  source of truth once it has resolved (the page can read
   *  `state` and ask the Rust side for the line by reading
   *  the rc file's expected location); for the banner we
   *  pre-compute the line in JS so the copy button is
   *  immediately responsive. */
  activationLine: (status: ActivationStatus) => string;
}

const ActivationContext = createContext<ActivationContextValue | null>(null);

const DISMISSED_KEY = "misedeck.activationDismissed.v1";
/** The shape of the persisted dismissed flag: a per-shell
 *  record. We key by the shell `kind` (e.g. "zsh", "bash")
 *  rather than by the rc path so a user who moves their
 *  dotfiles does not un-dismiss the banner. */
type DismissedMap = Partial<Record<ShellKindTag, true>>;

type ShellKindTag = "zsh" | "bash" | "fish" | "powerShell" | "unknown";

function shellKindTag(s: ActivationStatus["shell"]): ShellKindTag {
  if (s.kind === "unknown") return "unknown";
  return s.kind;
}

function loadDismissed(): DismissedMap {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: DismissedMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v === true) {
          if (
            k === "zsh" ||
            k === "bash" ||
            k === "fish" ||
            k === "powerShell" ||
            k === "unknown"
          ) {
            out[k as ShellKindTag] = true;
          }
        }
      }
      return out;
    }
  } catch {
    // ignore
  }
  return {};
}

function persistDismissed(map: DismissedMap) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** Build the activation line for a given shell. The JS mirror
 *  of `ShellKind::activation_line` (see
 *  `src-tauri/src/shell.rs`). The two must stay in lockstep;
 *  the integration test in `tests/shell.rs` pins the Rust
 *  side. */
function activationLineFor(status: ActivationStatus): string {
  const shell = status.shell;
  if (shell.kind === "zsh") return 'eval "$(mise activate zsh)"';
  if (shell.kind === "bash") return 'eval "$(mise activate bash)"';
  if (shell.kind === "fish") return "mise activate fish | source";
  if (shell.kind === "powerShell") {
    return "mise activate pwsh | Out-String | Invoke-Expression";
  }
  // Unknown shell — best-effort sh form.
  return 'eval "$(mise activate sh)"';
}

function shellDisplayName(s: ActivationStatus["shell"]): string {
  if (s.kind === "unknown") return s.name;
  if (s.kind === "powerShell") return "PowerShell";
  return s.kind;
}

export function ActivationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActivationState>({ kind: "loading" });
  const [dismissedMap, setDismissedMap] = useState<DismissedMap>(() => loadDismissed());
  const [openOutcome, setOpenOutcome] = useState<OpenTerminalOutcome | null>(null);
  // Mirror of `openOutcome` so the consumer can read+clear in
  // one synchronous step without racing the React setState.
  const openOutcomeRef = useRef<OpenTerminalOutcome | null>(null);

  const runProbe = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const result = await shellActivationCheck();
      if (result.kind === "ok") {
        setState({ kind: "ok", status: result.ok });
      } else {
        setState({ kind: "error", message: result.err.message });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ kind: "error", message });
    }
  }, []);

  // Probe once on mount. The "once" is per app start — the
  // provider is at the root of the tree (see `main.tsx`).
  useEffect(() => {
    void runProbe();
  }, [runProbe]);

  // The dismissed flag for the active shell family. When the
  // shell changes (e.g. user moves to a new machine), the
  // previous flag no longer applies.
  const activeTag: ShellKindTag | null =
    state.kind === "ok" ? shellKindTag(state.status.shell) : null;
  const dismissed = activeTag !== null && dismissedMap[activeTag] === true;

  const dismissBanner = useCallback(() => {
    if (activeTag === null) return;
    setDismissedMap((prev) => {
      const next: DismissedMap = { ...prev, [activeTag]: true };
      persistDismissed(next);
      return next;
    });
  }, [activeTag]);

  const undismissBanner = useCallback(() => {
    if (activeTag === null) return;
    setDismissedMap((prev) => {
      if (prev[activeTag] !== true) return prev;
      const next: DismissedMap = { ...prev };
      delete next[activeTag];
      persistDismissed(next);
      return next;
    });
  }, [activeTag]);

  const openInTerminalFn = useCallback(async (path: string | null) => {
    try {
      const result = await invokeOpenInTerminal(path);
      if (result.kind === "ok") {
        const next: OpenTerminalOutcome = { kind: "ok", outcome: result.ok };
        openOutcomeRef.current = next;
        setOpenOutcome(next);
      } else {
        const next: OpenTerminalOutcome = { kind: "error", error: result.err, path };
        openOutcomeRef.current = next;
        setOpenOutcome(next);
      }
    } catch (e) {
      // Defensive: the Rust command should not throw, but if
      // it does we surface the message as a structured error.
      const message = e instanceof Error ? e.message : String(e);
      const next: OpenTerminalOutcome = {
        kind: "error",
        error: { code: "COMMAND_FAILED", message, stderr: "" },
        path,
      };
      openOutcomeRef.current = next;
      setOpenOutcome(next);
    }
  }, []);

  const consumeOpenOutcome = useCallback(() => {
    const cur = openOutcomeRef.current;
    openOutcomeRef.current = null;
    setOpenOutcome(null);
    return cur;
  }, []);

  const value = useMemo<ActivationContextValue>(
    () => ({
      state,
      dismissed,
      recheck: runProbe,
      dismissBanner,
      undismissBanner,
      openInTerminal: openInTerminalFn,
      openOutcome,
      consumeOpenOutcome,
      activationLine: activationLineFor,
    }),
    [
      state,
      dismissed,
      runProbe,
      dismissBanner,
      undismissBanner,
      openInTerminalFn,
      openOutcome,
      consumeOpenOutcome,
    ],
  );

  return (
    <ActivationContext.Provider value={value}>{children}</ActivationContext.Provider>
  );
}

export function useActivation(): ActivationContextValue {
  const v = useContext(ActivationContext);
  if (!v) {
    throw new Error("useActivation must be used inside <ActivationProvider>");
  }
  return v;
}

/** Re-export `shellDisplayName` so the banner / page code can
 *  render the shell label without re-defining the mapping. */
export { shellDisplayName };
