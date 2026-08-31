# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.
Last updated: end of session C — all v1 implementation tickets closed.

**Status: v1 implementation complete.** No further `ready-for-agent` implementation tickets remain. Issue #16 (the v1 spec) stays open as the living spec document.

---

## Completed (11 implementation tickets, all on master)

| # | Title | Commit | Notes |
| - | ----- | ------ | ----- |
| #17 | Tauri 2 scaffold + end-to-end mise detection | `756f93b` | `misedeck/` is the Tauri app; `DetectMiseResult` enum returns `{kind, ok/err}` so the JS side never has to recover from a thrown error |
| #19 | i18n infrastructure (en + zh-CN) | `650d534` | 52 keys; `react-i18next` + `LanguageProvider` + `LanguageSwitcher`; `npm run lint:i18n` parity check |
| #20 | Visual system — full token set, base components, gallery | `d537157` | Extended to 114 keys; components at `misedeck/src/components/` (Panel, Button, IconButton, Badge, Banner, Table, DataRow, EmptyState, ProgressDot, StyleGuide, LanguageSwitcher); StyleGuide at `/__styleguide` |
| #31 | CI: three-platform builds + release automation | `a8da879` | `.github/workflows/{release,ci}.yml`; tag-push `v*.*.*` triggers matrix; per-platform bundle subset; SHA256SUMS attached |
| #18 | Generalized mise runner + execution panel | `f5d8d9d` | `run_mise(mise_path, req, on_event)` is the single entry point; new `run_mise_command` Tauri command streams via `tauri::ipc::Channel<RunEvent>`; `ExecutionPanel` + `useExecution` hook; +12 execution.* keys; **126 keys total** |
| #23 | Directory context bar + recent directories | `01c9be0` | `DirectoryProvider` + `ContextBar`; `tauri-plugin-dialog` wired; `useDirectory().cwd` is the single source of truth |
| #30 | mise self-management: guided install + self-update | `5ab053a` | `install.rs`; `ExecutionContext` lifted so any page can trigger a run |
| #21 | Global tools list (read-only) with outdated badges | `1ab8458` | `mise ls --json` + `mise outdated --json --bump` + `mise ls-remote --json`; `Table` / `Badge` / `EmptyState` wired; Tauri commands `tools_ls` / `tools_outdated` / `tools_ls_remote`; +6 keys (`tools.*`); **140 keys total** |
| #24 | Directory resolved-state preview with config-source badges | `4db6d2a` | new `/preview` page (reuses #21's `tools_ls` path with `cwd`); `tools_env` Tauri command (`mise env --json`); `read_lockfile` Tauri command (reads `<cwd>/mise.lock`); convention list for tool-derived env vars (JAVA_HOME → "java", etc.); +53 keys (`preview.*`); **193 keys total** |
| #25 | Trust UX: readonly + banner + one-click trust | `b5ae8c7` | `MISE_SAFE=1` for untrusted directories; one-click `mise trust` via the panel |
| #26 | Config editor: [tools] and [env] forms | `69b8f4f` | `/config` route; writes via `mise use` / `mise config set` / `mise set` / `mise unset` through the panel; never direct TOML edits |
| #27 | Tasks: list, run, simple edit | `3fbcfad` | `/tasks` route; `mise tasks ls --json` + run via panel; simple edit (name/run/depends) |
| #28 | Activation entry points: open-in-terminal, copy command, shell check | `5b78cf5` | `tauri-plugin-opener` + `tauri-plugin-shell`; `ActivationBanner` in `PageShell`; `TERMINAL_NOT_FOUND` error code |
| #29 | Settings, doctor, plugin/backend pages | `7ea4e83` | `/settings`, `/doctor`, `/plugins`; `mise settings ls --json-extended`, `mise doctor --json` with raw-text fallback, `mise registry --json`; +60 keys; **326 keys total** |
| #22 | Global tool mutations via execution panel | `7973cdb` | Install / uninstall / switch / upgrade on `/tools`; list refreshes on `running → ok`; `RunEvent` enum serialization fixed to camelCase fields on the wire |
| #32 | Bilingual README + release prep | `b84776e` | README.md + zh-CN/README.md with current screenshots, install notes, Gatekeeper note, disclaimer; `.github/release-template.md` created |
| — | Pre-release workflow tweak | `de8c7df` | `.github/workflows/release.yml` marks `-alpha`/`-beta`/`-rc`/`-pre` tags as pre-releases |

**Test count after session C:** 119 Rust tests passed (13 unit + 9 mise-probe + 9 directory + 9 env + 11 settings + 9 runner + 5 cwd + 15 shell + 15 tasks + 5 install + 9 tool_mutations + 10 tools + 9 trust).
**Lint gates:** `npm run typecheck && npm run lint:i18n && npm run build && cargo check && cargo test` — all pass.
**i18n keys:** 334 leaf keys, parity holds.

---

## Release status

- Repository renamed to `cherishfall/misedeck`; old `cherishfall/mise-ui` URL redirects correctly.
- GitHub description and topics set.
- Tag `v1.0.0-beta.1` pushed; release CI triggered: https://github.com/cherishfall/misedeck/actions/runs/33416339349
- Final `v1.0.0` release was intentionally deferred per maintainer request (some adjustments still wanted).

---

## Open items

- Issue #16 (SPEC: MiseDeck v1) remains open as the living spec / roadmap document.
- No `ready-for-agent` implementation tickets remain.

---

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
