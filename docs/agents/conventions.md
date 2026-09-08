# Conventions

> [简体中文](../../zh-CN/docs/agents/conventions.md)

Rules for writing code in this repo. Read before invoking mise, handling errors, or writing tests.

## Tauri command contract

Every Tauri command returns `Result<T, AppError>` where `T` is a serde-serializable typed shape and:

```rust
struct AppError {
    code: String,      // SCREAMING_SNAKE, e.g. MISE_NOT_FOUND, MISE_TOO_OLD, COMMAND_FAILED, PARSE_FAILED, TIMEOUT
    message: String,   // i18n key + params, resolved in the UI — never pre-rendered copy
    stderr: String,    // raw mise stderr when a command failed; empty otherwise
}
```

The UI renders `code` via i18n and offers stderr through the execution panel. Callers pattern-match on `code`, never on message text. Every UI site that displays `err.message` resolves it through `resolveAppErrorMessage` (`misedeck/src/utils/appError.ts`), which parses the `key|param=value|…` wire format, looks the key up in the catalog (falling back to `errors.unknown` so a raw key never renders), and passes raw detail text (COMMAND_FAILED / PARSE_FAILED) through verbatim.

**Boundary serialization**: every type crossing the Rust↔TS boundary uses `#[serde(rename_all = "camelCase")]` on the Rust side; the matching TS type is camelCase. `code` values come from this fixed set — inventing new ones is a bug:

```
MISE_NOT_FOUND  MISE_TOO_OLD  COMMAND_FAILED  PARSE_FAILED  TIMEOUT  TERMINAL_NOT_FOUND
```

`TERMINAL_NOT_FOUND` is a one-off addition for issue #28's
`open_in_terminal` Tauri command on Linux: the probe for
`gnome-terminal` / `konsole` / `xfce4-terminal` found none on the
user's `PATH`, so the UI surfaces the copyable command instead
of guessing. It is the only non-mise error code in the set; future
tickets should reuse the existing six when possible.

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
3. The changed flow was verified economically per `docs/design/ui-ux-rules.md` ("Verify economically"): `npm run ci` green plus a mechanical static self-audit of the diff — no screenshots, no computer-use drives, no running the app by default. If nobody saw the rendered result, mark the issue "not visually verified".
4. All new UI copy exists in both `en.json` and `zh-CN.json`.
5. If a doc was touched, its mirrored counterpart under `zh-CN/` was updated in the same change.
6. The closing comment states what was verified and how.

## Verification loop (replaces human code review)

1. Build: `npm run ci` (frontend typecheck + lint guards + build) and `cargo check` must pass.
2. Self-audit the diff mechanically per `docs/design/ui-ux-rules.md` ("Verify economically"). Reach for screenshots or a manual click-through only when the change restructures layout, or a human asks.
3. State in the PR/summary what was verified and how; if nothing visual was checked, mark the issue "not visually verified".

## Cross-platform

Paths, home dirs, process spawning, and shell detection go through Tauri/Rust cross-platform APIs. macOS-only behavior (e.g. Gatekeeper notes) lives behind platform guards with a no-op or equivalent elsewhere.

## i18n

- Never concatenate translated strings in code — no `t(...) + x`, no `x + t(...)`, no `t(...)` inside a template literal. Word order, punctuation, and plural rules are owned by the locale, not the code. Put the entire phrase in `en.json` + `zh-CN.json` with `{{placeholders}}` and pass the parts via `t(key, { ... })` — counts included (`"{{count}} settings"`, not `` `${n} ${t(...)}` ``).
- `npm run lint:i18n-concat` enforces this over `src/**` at generation time (wired into `npm run ci`); a genuinely locale-safe exception belongs in the script's explicit allowlist with a reason, never as a dodged pattern.

## Style

Match the surrounding file. Comment only where the code cannot say why. Keep diffs scoped to the ticket.
