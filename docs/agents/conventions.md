# Conventions

> [简体中文](../../zh-CN/docs/agents/conventions.md)

Rules for writing code in this repo. Read before invoking mise, handling errors, or writing tests.

## Tauri command contract

Every Tauri command returns `Result<T, AppError>` where `T` is a serde-serializable typed shape and:

```rust
struct AppError {
    code: String,      // SCREAMING_SNAKE, e.g. MISE_NOT_FOUND, MISE_TOO_OLD, COMMAND_FAILED, PARSE_FAILED, UNTRUSTED
    message: String,   // i18n key + params, resolved in the UI — never pre-rendered copy
    stderr: String,    // raw mise stderr when a command failed; empty otherwise
}
```

The UI renders `code` via i18n and offers stderr through the execution panel. Callers pattern-match on `code`, never on message text.

**Boundary serialization**: every type crossing the Rust↔TS boundary uses `#[serde(rename_all = "camelCase")]` on the Rust side; the matching TS type is camelCase. `code` values come from this fixed set — inventing new ones is a bug:

```
MISE_NOT_FOUND  MISE_TOO_OLD  COMMAND_FAILED  PARSE_FAILED  UNTRUSTED  TIMEOUT
```

## Invoking mise

- Locate the binary once at startup (`mise version --json`); cache path + version. Minimum supported mise version is **2025.1.0**, enforced here (code `MISE_TOO_OLD`); raise the floor deliberately when a feature needs newer mise. Absence is `MISE_NOT_FOUND` and routes to the guided-install flow (issue #2).
- Always pass the directory context via `-C`; always request `--json` where it exists.
- Set a generous but finite timeout per command; streaming commands (install, task run) stream stdout/stderr lines to the execution panel instead of buffering.
- Non-zero exit → `COMMAND_FAILED` with stderr preserved verbatim. Parse failures → `PARSE_FAILED` with the raw payload logged.

## Error handling

- Errors are data: they travel as `AppError` to the UI. Panics and `unwrap` in command code are bugs.
- mise's own error text passes through untranslated (spec #16); the UI adds a copy button and a GitHub-search link.

## Testing

- The single test seam is the mise CLI boundary: tests substitute a **fixture mise** — a small script that serves recorded JSON/stderr/exit codes per argv. Fixture layout: `tests/fixtures/mise/<slug>/` where `<slug>` is the argv joined by `-` (e.g. `ls---json/`), containing `stdout`, `stderr`, and `exit_code` files. The runner is unit-tested against fixtures; everything above the runner is tested with the runner mocked at the Tauri command contract.
- Test external behavior only: given this fixture response, the command returns this shape / the panel shows this state. No tests of internal helpers.
- Frontend: component tests against the typed contract; no snapshot churn.

## Definition of done (every ticket, no exceptions)

1. `cargo check` and the frontend typecheck pass; all tests pass.
2. Every acceptance criterion in the ticket is demonstrably met.
3. The app was run and the changed flow driven end-to-end; a screenshot (or harness-provided UI evidence) is attached to the closing comment.
4. All new UI copy exists in both `en.json` and `zh-CN.json`.
5. If a doc was touched, its mirrored counterpart under `zh-CN/` was updated in the same change.
6. The closing comment states what was verified and how.

## Verification loop (replaces human code review)

1. Build: `cargo check` + frontend typecheck must pass.
2. Run the app, drive the changed flow with the computer-use tools, and screenshot the result.
3. State in the PR/summary what was verified and how.

## Cross-platform

Paths, home dirs, process spawning, and shell detection go through Tauri/Rust cross-platform APIs. macOS-only behavior (e.g. Gatekeeper notes) lives behind platform guards with a no-op or equivalent elsewhere.

## Style

Match the surrounding file. Comment only where the code cannot say why. Keep diffs scoped to the ticket.
