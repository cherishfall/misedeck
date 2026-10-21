// Failure-card body copy depends on whether there is stderr to show
// (V-7, issue #262). The old single body promised "Stderr is shown
// below." even when mise wrote nothing, so the card pointed at a block
// that was not rendered. Call sites now choose between a body that
// mentions the block and one that does not.
//
// Pure so the choice is unit-tested; `stderr` is the AppError field,
// which is an empty string when the command wrote nothing.

export function hasStderr(stderr: string | null | undefined): boolean {
  return typeof stderr === "string" && stderr.trim().length > 0;
}

/** Pick the body key that matches the stderr actually available. */
export function stderrBodyKey(
  stderr: string | null | undefined,
  withStderr: string,
  withoutStderr: string,
): string {
  return hasStderr(stderr) ? withStderr : withoutStderr;
}
