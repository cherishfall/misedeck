// IPC payload for `run_mise_command` (issue #276).
//
// `readOnly` is an explicit caller decision, never inferred from argv:
// the Rust boundary sets `MISE_SAFE=1` only when it receives `true`, and
// mutations / `mise run` stay on the unsafe streaming path. Extracted
// from the hook so the contract has a plain unit test.

export interface RunCommandRequest {
  cwd: string | null;
  args: string[];
}

export interface RunCommandOptions {
  /** True only for a read dispatched through the panel (a table load or
   *  its background refresh). Defaults to false. */
  readOnly?: boolean;
}

export function runMiseCommandPayload(
  request: RunCommandRequest,
  options: RunCommandOptions | undefined,
): { cwd: string | null; args: string[]; readOnly: boolean } {
  return {
    cwd: request.cwd,
    args: request.args,
    readOnly: options?.readOnly === true,
  };
}
