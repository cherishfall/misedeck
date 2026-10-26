// The shell-activation probe's execution half, split out of
// activationContext.tsx (issue #286) so its ok / err / thrown branches
// are unit-tested without React or IPC — the check function is injected
// (conventions.md: surfaces that never call mise inject their own
// boundary; production passes the real `shellActivationCheck`).
//
// What this module deliberately does NOT do: resolve `err.message`. The
// message is key-shaped (`errors.*` + params) and resolution belongs to
// render time — the provider stores the raw value and resolves it while
// rendering, exactly like trustContext (issue #118). That is what lets
// the provider's `runProbe` depend on `[]` instead of `[t]`: switching
// locale re-renders the copy, it never re-sends `shell_activation_check`
// and never flashes the banner back to loading.

import { shellActivationCheck } from "../api/mise";
import type { ActivationStatus, ShellActivationResult } from "../types/tauri";

/** The UI's view of the activation probe. Mirrors the `TrustState`
 *  shape (issue #25) so the banner code reads the same way. An `error`
 *  state holds the raw `AppError.message` — key-shaped, unresolved
 *  (issue #286). */
export type ActivationState =
  | { kind: "unknown" }
  | { kind: "loading" }
  | { kind: "ok"; status: ActivationStatus }
  | { kind: "error"; message: string };

/** The injected probe boundary. */
export type ActivationCheck = () => Promise<ShellActivationResult>;

/** Run one probe and map it to an `ActivationState`. Never rejects. */
export async function probeShellActivation(
  check: ActivationCheck = shellActivationCheck,
): Promise<ActivationState> {
  try {
    const result = await check();
    if (result.kind === "ok") return { kind: "ok", status: result.ok };
    return { kind: "error", message: result.err.message };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
