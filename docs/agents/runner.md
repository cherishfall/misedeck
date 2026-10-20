# Mise runner

> [简体中文](../../zh-CN/docs/agents/runner.md)

The runner is the layer between the Tauri commands and the mise CLI. It lives in `misedeck/src-tauri/src/mise.rs` and is split into two parts:

- **Pure runner** — `run_mise(mise_path, req, on_event)` builds argv, spawns mise, captures stdout/stderr in background reader threads, and invokes `on_event` for every line plus a final `Exit`. `run_mise_tracked` is the same run with a `run_id`, which is what makes it cancellable (see Process tree). The function has no Tauri imports so it is unit-testable against a fixture binary.
- **Tauri command** — `run_mise_command(cwd, args, runId, on_event)` validates input, resolves the mise binary (cached on first call), and pipes the runner's events into a `tauri::ipc::Channel<RunEvent>`. `runId` is the panel's id for the run; `cancel_run(runId)` uses it. The final `RunCommandResult` enum is returned as a structured value (never throws on the JS side). This command is also the success/failure boundary (issue #221): a non-zero exit comes back as the error variant with mise's stderr attached, while `run_mise` itself still reports the raw `RunOutcome`.

## Argv shape

`run_mise_command` always passes literal argv — no shell, no interpolation. The `-C <dir>` flag is prepended when `cwd` is `Some`, followed by the user-supplied args. `validate_run_args` (mise.rs) enforces two rules, both narrowed from the original #18 guardrail by #160: args must be non-empty, and a token *starting with* `-` (a flag/option) must not contain a shell metacharacter (`;`, `|`, `&`, `` ` ``, `$`, `\n`, `\r`). Everything else — the subcommand, positionals, `run` values, `set` values — is inert data in a shell-less spawn and passes through untouched, so values like `npm run build && npm run test` or a `DATABASE_URL` containing `&` remain saveable from the GUI. Shell injection is impossible by construction (no shell ever sees the argv), not by rejecting values.

## Streaming

The runner uses background reader threads (one per pipe) to split lines and forward them through a bounded `mpsc::channel`. The main loop non-blocking-drains the channel between `try_wait` polls so the panel sees output in real time. The runner auto-kills the process at `STREAMING_TIMEOUT` (30 minutes, per the conventions); the install script has the same ceiling at 5 minutes, and read-only queries at 2 minutes.

Readers read bytes and decode each line with `String::from_utf8_lossy`, so one invalid byte can never end a reader, truncate the transcript, or close the pipe under a still-running child (issue #222; `RunOutcome` already promises lossy decoding). Once the child is gone the runner waits for the readers only up to `READER_SHUTDOWN_BOUND` (1 second): they only need to drain what the pipe already buffered, while a grandchild that inherited the pipe (`npm run dev &`, a daemon) can keep it open forever and must not be able to swallow the exit event. A reader still blocked at the bound is abandoned — its handle is dropped and the thread exits on its own when the pipe finally closes.

## Process tree

Timeouts, cancel and app quit terminate the **whole process tree**, not only the direct child (issue #223). `process_tree.rs` is the single home for this: both runners (`mise.rs`, `install.rs`) spawn through it.

- **Spawn**: every child is put in its own process group — unix `pre_exec` + `setsid()`, Windows `CREATE_NEW_PROCESS_GROUP`.
- **Kill**: unix `killpg(pgid, SIGKILL)`; Windows `taskkill /F /T /PID`. `child.kill()` stays as a fallback for the direct child when the group signal cannot work (the process left its group, `taskkill` is missing, a platform with neither mechanism). This is what makes `sh -c "curl … | sh"` stop: killing `sh` alone left `curl` and the installer writing shims, and `mise run` left the task shell running.
- **Cancel** is still a *soft* cancel in the panel: the run is marked cancelled immediately and the button is released, without waiting for the process. What changed in #223 is that the cancel now reaches Rust — `cancel_run(runId)` — and the runner that owns the child tears the group down within one poll slice (≤ 50 ms). The kill always runs on the thread that owns the `Child` handle, never from the cancel call, so a cancel can never signal a pid the app did not start.
- **Quit**: Tauri's `RunEvent::ExitRequested` and `RunEvent::Exit` kill every group still in the process-wide registry, so closing the window during an install does not leave downloads running.
- **Pid reuse**: the registry holds only children this process spawned and has not reaped. An entry is removed in the same step that reaps it — a reaped pid is free for reuse — and `terminate_all` signals while holding the registry lock so no owner can reap between the lookup and the kill.

Platform note: Windows has no runtime test for the tree kill (there is no Windows machine in the review loop; the `windows-latest` CI job only compiles and runs the unit tests). Unix is covered by fixture tests that assert a grandchild started by the child is dead after cancel and after timeout (`tests/runner.rs`, `#[cfg(unix)]`).

## Captured mode

The probe path (`detect_mise`) uses the same `run_mise` but with a no-op `on_event` and reads the buffered `RunOutcome.stdout` / `RunOutcome.stderr`. The two modes share a single function so error mapping is consistent: non-zero exit + non-empty stderr → `COMMAND_FAILED`, malformed JSON → `PARSE_FAILED`, timeout → `TIMEOUT`.

## Testing

Tests live in `misedeck/src-tauri/tests/`. The fixture-mise script (`tests/fixtures/mise/fixture-mise`) is the only thing the runner ever calls; the user's real mise binary is **never** touched. New fixture slugs follow the conventions.md layout (`tests/fixtures/mise/<argv-joined-by->`); the existing set lives in that directory. The `serial_test` crate serializes tests that share the `FIXTURE_MISE_SLUG` env var.

## Frontend hook

`useExecution()` (in `misedeck/src/components/ExecutionPanel/useExecution.ts`) is a small reducer + Tauri `Channel` consumer. Pages call `run({ cwd, args })`; the panel reflects state, lines, and exit. Every foreground run carries its id as `runId` on the invoke, and `cancel()` marks the entry cancelled then fires `cancel_run` with that id — fire-and-forget, because the panel must never wait for a process to die (issue #223). The `ExecutionPanel` component renders the docked deck per `docs/design/visual-language.md`.
