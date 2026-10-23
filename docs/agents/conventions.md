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

- Locate the binary once at startup (`mise version --json`); cache path + version. Minimum supported mise version is **2025.12.5** — the first release with every flag the app builds (`ls-remote --json`, mise #7279) — enforced here (code `MISE_TOO_OLD`); raise the floor deliberately when a feature needs newer mise. Absence is `MISE_NOT_FOUND` and routes to the guided-install flow (issue #2).
- Always pass the directory context via `-C`; always request `--json` where it exists.
- Set a generous but finite timeout per command; streaming commands (install, task run) stream stdout/stderr lines to the execution panel instead of buffering.
- Non-zero exit → `COMMAND_FAILED` with stderr preserved verbatim. Parse failures → `PARSE_FAILED` with the raw payload logged.

## Error handling

- Errors are data: they travel as `AppError` to the UI. Panics and `unwrap` in command code are bugs.
- mise's own error text passes through untranslated (spec #16); the UI adds a copy button and a GitHub-search link.

## Testing

- The single test seam is the mise CLI boundary: tests substitute a **fixture mise** — a small script that serves recorded JSON/stderr/exit codes per argv. Fixture layout: `tests/fixtures/mise/<slug>/` where `<slug>` is the argv joined by `-` (e.g. `ls---json/`), containing `stdout`, `stderr`, and `exit_code` files. The runner is unit-tested against fixtures; everything above the runner is tested with the runner mocked at the Tauri command contract.
- Surfaces that never call mise inject their own boundary instead of touching the network or the host OS: the update check splits fetch from decision (`check` → `check_with`), the guided-install loop takes the command it streams (`run_install_command`), and shell detection takes what `$SHELL` and the passwd entry said (`detect_user_shell_from`). The production entry points pass the real implementations — a seam, not a second behavior (issue #255).
- The tools page's argv exists twice: TS builds the dispatched command, Rust pins the test-only builder. Both halves are asserted against `tests/fixtures/argv-parity.json` — `npm run lint:argv-parity` (wired into `npm run ci`) executes the TS builders, `tests/argv_parity.rs` executes the Rust ones. A one-sided change fails that side's gate (issue #255).
- Test external behavior only: given this fixture response, the command returns this shape / the panel shows this state. No tests of internal helpers.
- Frontend: unit tests of pure functions with node:test — `npm run test` (`tsx --test "src/**/*.test.ts"`), wired into `npm run ci`. There are 26 colocated suites under `src/` today (e.g. `src/utils/paths.test.ts`, `src/api/miseTools.test.ts`). No component harness exists, so UI behavior is not unit-tested; new pure logic ships with a colocated `*.test.ts`.
- A test that rewrites the process environment is `#[serial_test::serial]`, and so is **every other test in that binary that spawns a child**: a spawn copies the environment, so `std::env::set_var` is unsound while one can run. Annotating only the writer protects nothing — the serial attribute is what excludes, not the guard that restores the value afterwards. Live cases: the Linux `$PATH` probe in `tests/terminal.rs`, `FIXTURE_MISE_ENV_LOG` in `tests/install.rs` (issue #278).
- The same gate applies to `process_tree::terminate_all`: it kills every child registered in a **process-global** map, so a unit test that calls it SIGKILLs whatever a neighbouring test in the same binary is waiting on. Every unit test that spawns through `ChildGuard` is `#[serial]`, and so is the test that calls `terminate_all`. Symptom when this is missing: a child dies of a signal, `ExitStatus::code()` returns `None`, and the caller reports `exited with status -1` with empty stderr — which reads like a product bug and is not one. Fixed in `src/process_tree.rs` / `src/install.rs` after the ubuntu leg failed twice this way.

## Definition of done (every ticket, no exceptions)

1. `cargo check` and the frontend typecheck pass; all tests pass.
2. Every acceptance criterion in the ticket is demonstrably met.
3. The changed flow passed the verification loop below; if nobody saw the rendered result, the issue is marked "not visually verified".
4. All new UI copy exists in both `en.json` and `zh-CN.json`.
5. If a doc was touched, its mirrored counterpart under `zh-CN/` was updated in the same change.
6. The closing comment states what was verified and how.

## Verification loop (replaces human code review)

Verification is static-first, and agent-side visual verification is off the table unless the owner asks: launching the app, screenshots, and click-throughs are slow, token-expensive, and drive the owner's machine (owner decision, beta9).

1. Build: `npm run ci` (frontend typecheck + lint guards + build) and `cargo check` must pass.
2. Self-audit the diff mechanically: data cells carry `nowrap`/`min-width: 0`, colors and sizes come from tokens, strings are i18n keys, no hardcoded glyph literals in JSX, no unapproved caret/decorative glyphs, retired vocabulary is absent, contrast is sound by token values.
3. The substitute for agent-side visual verification is generation-time interception: every reported visual/interaction problem that is mechanically checkable ships with a lint guard wired into `npm run ci` in the same ticket. Rendered-result confirmation is the owner's beta review gate.
4. State in the PR/summary what was verified and how; if nothing visual was checked, mark the issue "not visually verified". Never claim visual verification you did not perform.

## Cross-platform

Paths, home dirs, process spawning, and shell detection go through Tauri/Rust cross-platform APIs. macOS-only behavior (e.g. Gatekeeper notes) lives behind platform guards with a no-op or equivalent elsewhere.

Windows shell detection (#277) is split into a pure decision half (`detect_windows_shell`: `$SHELL` first, then PowerShell) that is unit-tested on every host, and probes that run only on Windows (`where.exe pwsh.exe` by absolute path; a file check of the absolute System32 Windows PowerShell). Those probes, and the resulting activation banners, have been run on a real Windows desktop — the shell probe answers `powerShell` there, with the pwsh profile path under the real profile folder. The `windows-latest` CI leg now runs the full suite (unit **and** integration), because the fixtures are cross-platform Rust binaries rather than bash scripts.

That real-Windows pass is now done for the whole surface, not just the shell probes: all eight pages, all fourteen backend commands, and a write-closed-loop (UI → mise → disk → UI) were exercised on hardware. It found two things CI could not have caught — the bash fixtures, and a home-resolution seam that silently no-ops when a test fakes `$HOME` on a platform whose home lookup ignores it (see the injected-home rule below).

- **Home is `dirs::home_dir()`, never the `HOME` env var** (issue #229): Windows sets no `HOME`, so every `$HOME` read resolved to nothing there — the activation probe reported `activated: null` and `open_in_terminal` failed on every launch. The same applies to shell rc paths and to any other home-relative string.
- **A home-relative path is computed from an injected home, not from a faked env var**: `dirs::home_dir()` honors `$HOME` on unix but goes to `SHGetKnownFolderPath` on Windows and ignores the env var entirely, so a test that faked a home through `$HOME` read the *real* user profile there. The rc-path resolver and the activation probe take the home as a parameter (`rc_path_for_in`, `rc_sibling_paths_in`, `check_shell_activation_for_in`); the production entry points resolve it through `dirs::home_dir()` and delegate.
- **A test fixture must be executable on the host it runs on**: a bash script cannot be spawned on Windows (`CreateProcess` refuses a file with no executable extension — os error 193). The fixtures are Rust binaries under `src/bin/` (`fixture-mise`, `fixture-process-tree`), so one implementation serves every platform and the Windows CI leg can run the integration suite too.
- **Locating mise scans `PATH`** after the well-known candidates: a scoop/winget mise on Windows or `/usr/bin/mise` on Linux lives only there.
- **An echo must show the branch the executor takes** — the guided install runs `irm … | iex` on Windows and `curl … | sh` elsewhere, so the echoed line is platform-derived too. `npm run lint:install-echo-parity` fails the build when the frontend's copy and `src-tauri/src/install.rs` disagree.
- **Echo quoting is shell quoting** (single quotes; `'\''` on POSIX, `''` in PowerShell), not JSON quoting: the panel promises a line the user can paste, and `$HOME`, `$(…)`, backticks and `!` change meaning in a shell even though they are inert in argv.

## i18n

- Never concatenate translated strings in code — no `t(...) + x`, no `x + t(...)`, no `t(...)` inside a template literal. Word order, punctuation, and plural rules are owned by the locale, not the code. Put the entire phrase in `en.json` + `zh-CN.json` with `{{placeholders}}` and pass the parts via `t(key, { ... })` — counts included (`"{{count}} settings"`, not `` `${n} ${t(...)}` ``).
- `npm run lint:i18n-concat` enforces this over `src/**` at generation time (wired into `npm run ci`); a genuinely locale-safe exception belongs in the script's explicit allowlist with a reason, never as a dodged pattern.

## Style

Match the surrounding file. Comment only where the code cannot say why. Keep diffs scoped to the ticket.
