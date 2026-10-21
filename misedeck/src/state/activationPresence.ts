// The activation probe is tri-state (issue #28): `true` (the rc file
// has the activate line), `false` (it does not), and `null` (the probe
// could not decide — e.g. an unknown shell family). Rendering `null` as
// `false` told users a fact the probe never established (issue #262).
//
// Kept as a pure mapping so the three-way branch is unit-tested; the
// banner and the Doctor row both consume it instead of re-deriving it
// with truthiness.

/** What the UI may claim about shell activation. */
export type ActivationPresence = "activated" | "notActivated" | "unknown";

export function activationPresence(
  activated: boolean | null,
): ActivationPresence {
  if (activated === true) return "activated";
  if (activated === false) return "notActivated";
  return "unknown";
}
