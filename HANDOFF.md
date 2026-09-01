# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.
Last updated: 2026-09-02 — #41, #42, #44 closed; #43 is the active ticket (the last v1 ticket).

**Status:** v1 product-logic implementation in progress. 10 of 11 `ready-for-agent` v1 tickets closed; #43 is the next ticket to pick up.

---

## Completed this session (on `origin/master`)

| # | Title | Commit | Notes |
| - | ----- | ------ | ----- |
| #34 | SPEC: Product logic — sidebar IA, on-demand execution panel, mise-native concepts | `18977d8` | Ratified and landed `docs/design/product-logic.md` + `zh-CN/docs/design/product-logic.md`; added product principles to `AGENTS.md`. |
| #35 | Fix undefined CSS design tokens (TasksPage and repo-wide sweep) | `31f80ee` | Mapped 13 broken `TasksPage` tokens to existing `tokens.css` values; added `scripts/check-css-tokens.ts` and wired it into `npm run ci` + CI workflow; docs updated bilingually. |
| #36 | Remove Styleguide from product navigation; keep dev-only route with working back navigation | `3673a47` | Dropped Styleguide from product nav; made `/__styleguide` dev-only; added a working back link on the Styleguide page; removed dead i18n nav key. |
| #37 | Visual language overhaul: mise.jdx.dev look for light + dark, theme switching infrastructure | `ee24dc9`, `6a0c73b`, `1696e6e` | Rewrote `visual-language.md` (en + zh-CN); added `ThemeProvider`/`themeContext.tsx` + `ThemeSwitcher`; wired `html[data-theme]` with system/light/dark defaulting to system and persisting across launches; updated all components/pages to the new mise.jdx.dev palette. A follow-up commit fixed a React hooks-order crash on the Plugins registry page. |
| #38 | App shell: collapsible sidebar, directory indicator, window sizing discipline | `d2225b6` | Rebuilt `PageShell` as a collapsible left sidebar with brand lockup, main/bottom nav groups, collapse toggle, and sidebar footer; renamed `ContextBar` to `DirectoryIndicator` and moved it into the content area; added a Global button; enforced window minimum size and body-level overflow discipline. |
| #39 | Execution panel on demand: hidden by default, slides in on run, absent on read-only pages | `5035de6` | Added `isOpen` visibility state to the execution reducer; panel hidden by default and auto-opens on any command; `dismiss` now hides while preserving history; added persistent `ExecutionPanelAffordance` to reopen from any page; read-only routes (`/doctor`, `/plugins`, `/preview`) close the panel when idle. |
| #40 | Command-teaching page headers + data-is-never-uppercased typography audit | `dba5565` | Added backing-command hints to every page header; updated empty states to name populating commands; removed uppercase transforms from Doctor raw-status data; verified real-case paths/versions/values in both locales. |
| #41 | Env page: first-class env-vars management (mise env / set / unset) | `95a0ad3` | New `EnvPage` with resolved env vars + source for the active context; add/edit/remove via `mise set` / `mise unset` through the execution panel; trust-gated; sidebar order Preview → Tools → Env → Tasks → Plugins; explicit query refetch after mutations. |
| #42 | Preview absorbs config-file hierarchy (mise config: loaded files in precedence order) | `2f80c51` | New Config files section on Preview backed by `mise config ls --json`; files in precedence order with real-case paths and read-only content view; works in Global and directory contexts; fixture-backed precedence-order test. |
| #44 | Home (mise status) page in the new shell | `95ee434` | Moved the mise status page out of `App.tsx` into `pages/HomePage/`; all detection states (missing / too old / ready / command-failed / parse-failed) as panels in the new shell; brand lockup links Home, Home absent from nav; `starter.*` → `home.*` i18n. |

**Lint gates at the end of #44:** `npm run ci` (typecheck + `lint:i18n` + `lint:css-tokens` + build) green; `cargo check` + `cargo test` green; i18n parity at 386 keys.

---

## Paused work

- **#43 — Retire the Config page (redirect /config to /preview, remove residue)** is the active ticket — the last v1 ticket.
- No commit for #43 has been made yet; working tree is clean aside from the unrelated untracked file `beta3-feedback-scratch.md`.

---

## Remaining `ready-for-agent` v1 tickets

Dependency order (check `gh issue view <n> --json blockedBy` before starting):

1. **#43** Retire the Config page (redirect /config to /preview, remove residue)  
   → blocked by: #41 (closed), #42 (closed). Start here.

Also open but **not** currently in scope:
- #14, #15, #13, #12, #11 (chore/roadmap, no `ready-for-agent` label).

---

## Recommended next-session startup

1. Ensure you are on `master` and synced:  
   `git checkout master && git pull origin master`
2. Read this `HANDOFF.md`.
3. Read `AGENTS.md`, `CONTEXT.md`, `docs/design/product-logic.md`, `docs/design/visual-language.md`, `docs/agents/conventions.md`, `docs/agents/architecture.md`.
4. Run `gh issue view 43 --comments`, then implement per acceptance criteria.
5. Follow the implement skill: TDD at seams, regular typechecks, full `npm run ci` + `cargo check`, build/run/screenshot verification.
6. Commit to `master` referencing `#43`, push with:  
   `git -c http.proxy=http://127.0.0.1:7890 push origin master`
7. Close the issue with `gh issue close 43 --comment "..."`.
8. #43 is the final v1 ticket — after it closes, all 11 `ready-for-agent` v1 tickets are done.

---

## Working agreement reminders

- **One ticket per session.** Do not batch unrelated tickets.
- **Build before commit.** `npm run ci` and `cargo check` must pass.
- **Verify visually when feasible.** Run the Tauri app and screenshot complex UI changes.
- **All UI copy through i18n.** `npm run lint:i18n` must stay green.
- **Mirror docs to zh-CN** when any doc is touched.
- **Commit to master** with a message referencing the issue. Push after. Master must stay green.
- **Close the issue** with a verification block.

---

## Critical files

| File | Purpose |
| ---- | ------- |
| `docs/design/product-logic.md` | Source of truth for IA, navigation, execution-panel rules, and page inventory. |
| `docs/design/visual-language.md` | mise.jdx.dev-derived tokens for light + dark themes. |
| `misedeck/src/state/themeContext.tsx` | Theme state (system/light/dark, persistence, `html[data-theme]`). |
| `misedeck/src/components/ThemeSwitcher/` | Theme toggle component. |
| `misedeck/src/components/PageShell/PageShell.tsx` | Current app shell — the starting point for #38. |
| `misedeck/src/components/ContextBar/` | Existing directory-context bar — will likely be refactored into the #38 directory indicator. |
| `misedeck/src/components/ExecutionPanel/` | Existing execution panel — #39 will change its visibility rules. |
| `misedeck/src/i18n/{en,zh-CN}.json` + `keys.ts` | i18n catalog; `npm run lint:i18n` enforces parity. |
| `misedeck/scripts/check-css-tokens.ts` | CSS token guard — `npm run lint:css-tokens`. |
| `misedeck/src-tauri/src/lib.rs` / `mise.rs` | Tauri commands and general mise runner. |

---

## Environment reminders

- Rust toolchain is **managed by mise**. For every shell that needs `cargo`/`rustc`, run:
  ```
  source /Users/lifan/AiCodingProjects/mise-ui/.mise-shims/env.sh
  ```
  Without it, `cargo` is "command not found".
- mise is at `/Users/lifan/.local/bin/mise`; mise shims are at `/Users/lifan/.local/share/mise/shims/`.
- For Tauri dev: `cd misedeck && npm run tauri dev` (the macOS app opens).
- For frontend-only: `cd misedeck && npx tsc --noEmit` and `npm run build`.
- Git push in this environment requires a one-time proxy parameter:
  ```
  git -c http.proxy=http://127.0.0.1:7890 push origin master
  ```
