# Mise runner

> [简体中文](../../zh-CN/docs/agents/runner.md)

The runner is the layer between the Tauri commands and the mise CLI. It lives in `misedeck/src-tauri/src/mise.rs` and is split into two parts:

- **Pure runner** — `run_mise(mise_path, req, on_event)` builds argv, spawns mise, captures stdout/stderr in background reader threads, and invokes `on_event` for every line plus a final `Exit`. The function has no Tauri imports so it is unit-testable against a fixture binary.
- **Tauri command** — `run_mise_command(cwd, args, on_event)` validates input, resolves the mise binary (cached on first call), and pipes the runner's events into a `tauri::ipc::Channel<RunEvent>`. The final `RunCommandResult` enum is returned as a structured value (never throws on the JS side).

## Argv shape

`run_mise_command` always passes literal argv — no shell, no interpolation. The `-C <dir>` flag is prepended when `cwd` is `Some`, followed by the user-supplied args. The Rust side rejects empty args and any arg containing `;`, `|`, `&`, `` ` ``, `$`, `\n`, or `\r`. The intent is to make shell-injection impossible by construction.

## Streaming

The runner uses background reader threads (one per pipe) to split lines and forward them through a bounded `mpsc::channel`. The main loop non-blocking-drains the channel between `try_wait` polls so the panel sees output in real time. The runner auto-kills the process at `STREAMING_TIMEOUT` (30 minutes, per the conventions). Cancellation from the UI is a soft cancel in the current ticket; the next ticket that needs true process kill (#22 mutations, which can take longer than the demo `mise doctor`) will thread a kill handle through.

## Captured mode

The probe path (`detect_mise`) uses the same `run_mise` but with a no-op `on_event` and reads the buffered `RunOutcome.stdout` / `RunOutcome.stderr`. The two modes share a single function so error mapping is consistent: non-zero exit + non-empty stderr → `COMMAND_FAILED`, malformed JSON → `PARSE_FAILED`, timeout → `TIMEOUT`.

## Testing

Tests live in `misedeck/src-tauri/tests/`. The fixture-mise script (`tests/fixtures/mise/fixture-mise`) is the only thing the runner ever calls; the user's real mise binary is **never** touched. New slugs: `doctor-happy`, `doctor-fail`, `doctor-mixed`. The `serial_test` crate serializes tests that share the `FIXTURE_MISE_SLUG` env var.

## Frontend hook

`useExecution()` (in `misedeck/src/components/ExecutionPanel/useExecution.ts`) is a small reducer + Tauri `Channel` consumer. Pages call `run({ cwd, args })`; the panel reflects state, lines, and exit. The `ExecutionPanel` component renders the docked deck per `docs/design/visual-language.md`.
