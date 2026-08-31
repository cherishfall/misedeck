# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.
Last updated: end of session A (5 tickets closed + scaffold + Rust toolchain).
Next session should resume from the **Next up** section below.

## Completed (6 tickets, all on master)

| # | Title | Commit | Notes |
| - | ----- | ------ | ----- |
| #17 | Tauri 2 scaffold + end-to-end mise detection | `756f93b` | `misedeck/` is the Tauri app; `DetectMiseResult` enum returns `{kind, ok/err}` so the JS side never has to recover from a thrown error |
| #19 | i18n infrastructure (en + zh-CN) | `650d534` | 52 keys; `react-i18next` + `LanguageProvider` + `LanguageSwitcher`; `npm run lint:i18n` parity check |
| #20 | Visual system — full token set, base components, gallery | `d537157` | Extended to 114 keys; components at `misedeck/src/components/` (Panel, Button, IconButton, Badge, Banner, Table, DataRow, EmptyState, ProgressDot, StyleGuide, LanguageSwitcher); StyleGuide at `/__styleguide` |
| #31 | CI: three-platform builds + release automation | `a8da879` | `.github/workflows/{release,ci}.yml`; tag-push `v*.*.*` triggers matrix; per-platform bundle subset; SHA256SUMS attached |
| #18 | Generalized mise runner + execution panel | `f5d8d9d` | `run_mise(mise_path, req, on_event)` is the single entry point; new `run_mise_command` Tauri command streams via `tauri::ipc::Channel<RunEvent>`; `ExecutionPanel` + `useExecution` hook; +12 execution.* keys; **126 keys total** |

**Test count after #18:** 4 unit + 9 mise-probe + 5 runner = 18 tests. All green.
**Lint gates:** `npm run typecheck && npm run lint:i18n && npm run build && cargo check && cargo test` — all pass.

## Next up (in dependency order)

The remaining 11 tickets in three waves:

### Wave 1 — only depends on already-closed tickets
- **#23 Directory context bar + recent directories** — needs the `DirectoryContext` type (architecture doc prescribes `enum DirContext { Global, Dir(PathBuf) }`); recent-directories list persists across launches. This is the foundation for #24, #25, #28, #29.
- **#30 mise self-management: guided install + self-update** — needs the not-installed state from #17 and the runner from #18.

### Wave 2 — depends on #23
- **#21 Global tools list (read-only) with outdated badges** — `mise ls --json` + `mise outdated --json` + `mise ls-remote --json`. The Table component is ready; just needs the data and the type definitions.
- **#24 Directory resolved-state preview with config-source badges** — `mise -C <dir> ls --json` + `mise -C <dir> env --json`; tool-bound vars shown as derived state.
- **#25 Trust UX: readonly + banner + one-click trust** — `MISE_SAFE=1` for untrusted directories; one-click `mise trust` via the panel.
- **#26 Config editor: [tools] and [env] forms** — writes via `mise use` / `mise config set` through the panel; never direct TOML edits.
- **#27 Tasks: list, run, simple edit** — `mise tasks ls --json` + run via panel; simple edit (name/run/depends).
- **#28 Activation entry points: open-in-terminal, copy command, shell check** — needs #23 (cwd); uses `tauri-plugin-opener` for the open-in-terminal integration.
- **#29 Settings, doctor, plugin/backend pages** — three read-mostly pages; uses `mise settings ls --json`, `mise doctor --json`, `mise registry --json`; the doctor JSON has no `--json` flag so it falls back to table parsing behind the runner.

### Wave 3 — depends on most of the above
- **#22 Global tool mutations via execution panel** — install/uninstall/switch/upgrade; each goes through the existing `run_mise_command` IPC + `ExecutionPanel`.
- **#32 Bilingual README + release prep** — final, depends on the rest.

## Working agreement reminders

These come from `AGENTS.md` and `docs/agents/conventions.md` and apply to every ticket:

- **One ticket per session.** The next session should start fresh with `gh issue view <n>` and the relevant docs.
- **Build before commit.** `cargo check` + frontend typecheck must pass; all tests must pass.
- **Verify visually when feasible.** The user opted to skip per-ticket screenshots — do the Vite-driven smoke check (Chrome DevTools Protocol), but skip taking a screenshot unless the page is visually complex.
- **All UI copy through i18n.** `npm run lint:i18n` must stay clean.
- **Mirror docs to zh-CN** when any doc is touched.
- **Commit to master** with a message referencing the issue. Push after. Master must stay green.
- **Close the issue** with a verification block.

## Critical files

| File | Purpose |
| ---- | ------- |
| `misedeck/src-tauri/src/mise.rs` | The general runner (`run_mise`, `RunRequest`, `RunOutcome`, `RunEvent`); the probe (`detect_mise`); the fixtures |
| `misedeck/src-tauri/src/lib.rs` | Tauri command surface: `detect_mise` + `run_mise_command`; `MISE_BINARY` cache; `DetectMiseResult` and `RunCommandResult` enums |
| `misedeck/src/components/ExecutionPanel/` | ExecutionPanel + useExecution hook; the docked deck per visual language |
| `misedeck/src/components/index.ts` | Re-exports the base library; **add new components here when you create them** |
| `misedeck/src/i18n/{en,zh-CN}.json` + `keys.ts` | The i18n catalog; lint:i18n enforces parity |
| `misedeck/scripts/check-i18n.ts` | Parity + call-site lint (use `npm run lint:i18n`) |
| `docs/design/visual-language.md` | Source of truth for every token and effect — never invent new colors or animations |
| `misedeck/src-tauri/tests/fixtures/mise/fixture-mise` | The fixture-mise harness; add new slugs by creating a new directory under `tests/fixtures/mise/<slug>/` with `stdout`/`stderr`/`exit_code` |
| `docs/agents/{architecture,conventions,getting-started,runner}.md` | The running agreement; read each ticket's "Read first" before starting |

## Environment reminders

- Rust toolchain is **managed by mise**. For every shell that needs `cargo`/`rustc`, run:
  ```
  source /Users/lifan/AiCodingProjects/mise-ui/.mise-shims/env.sh
  ```
  Without it, `cargo` is "command not found".
- mise is at `/Users/lifan/.local/bin/mise`; mise shims are at `/Users/lifan/.local/share/mise/shims/`.
- For Tauri dev: `cd misedeck && npm run tauri dev` (the macOS app opens).
- For frontend-only: `cd misedeck && npx tsc --noEmit` and `npm run build`.
- The project root has a `mise.toml` pinning `rust = "latest"`.

## Open design choices for the next session

These are the spots where the next ticket has a meaningful choice to make. Don't pre-decide; the next session should propose to the user only if a direction changes the API surface or breaks the architecture doc.

- **#23 DirectoryContext storage** — Zustand vs React context. The architecture doc prescribes "no Redux, no zustand" so React context it is. Persistence: `localStorage` with a versioning strategy or a Tauri `appDataDir` JSON file? The architecture doc doesn't say; pick the simpler one (`localStorage` with a schema-version key).
- **#21 Tool table virtualization** — `mise ls` can return hundreds of rows. The base Table component is not virtualized; for v1 a non-virtualized table is acceptable, but if you hit perf issues in a smoke test, add a simple windowed renderer in #21 or a follow-up.
- **#29 Doctor JSON** — `mise doctor` has no `--json` flag. The runner has to capture and ship the raw text. The UI can parse known patterns (`[OK]`, `[WARN]`, `[ERROR]`) or render the raw text. ADR-0004 says the GUI should be a faithful shell over mise, so rendering raw text with row tinting is acceptable.

## Notes for the next session

- The user's preference: **skip per-ticket screenshots**; only capture when the page is visually novel or the fix changes the visual surface. End-of-session screenshot dump is fine.
- Worker subagents (`task` tool) get cancelled by the runtime more often than I'd like in this environment. Budget ~1h per worker with a manual takeover fallback ready. If a worker is silent for 20 minutes with no file activity, stop it and take over directly.
- The i18n key catalog at 126 is large because #20 pre-populated it. Future tickets should only add keys they actually use; the `npm run lint:i18n` script will catch any drift.
- The Visual system was rendered as a gallery at `/__styleguide`; that page is still there and useful for visual verification of new components.
- The execution panel is on every page now; a successful `runCommand` shows a status dot, command echo, and live log with auto-scroll.
- Screenshot capture: headless Chrome DevTools Protocol at `localhost:1420` is the reliable path. Use `misedeck/scripts-capture.mjs` (move to `/tmp/` when done so it doesn't get committed).

Good luck.
