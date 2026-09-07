# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.

## CURRENT STATE (2026-09-08)

**All implementation tickets are closed.** The beta7 feedback batch (**#87–#95**, SPEC parent #86) is fully implemented — one subagent per ticket, sequential on `master`, each committed + pushed + closed:

| Ticket | Commit |
| --- | --- |
| #87 Link-tool path from picker only | `c9f1f66` |
| #88 Command hints audit | `dd858bd` |
| #89 Tooltip primitive with copy replaces native title | `ba3fdbe` |
| #90 Fixed tables min-width (narrow windows scroll) | `80f0c33` |
| #91 Home: newer mise version + update button | `e407451` |
| #92 Doctor: activation row from rc-file check | `20e35ac` |
| #93 Uppercase-on-data fixes | `3dc159d` |
| #94 De-uppercase all labels except eyebrow (+ docs both locales) | `824ae43` |
| #95 Tasks: open-in-editor via execution panel; i18n hide badge | `5f6c4fa` |

- **Nothing in #46–#95 was visually verified.** Every ticket was closed with an explicit "NOT visually verified — owner will verify manually" note. Verification was `npm run ci` (+ static audits) only.
- **Open issues are all SPEC parents awaiting the owner's in-person visual verification: #86, #74, #65, #61, #45.** Once the owner is satisfied, close them; nothing is blocked on code.
- Older, not in scope: #11–#15 (chore/roadmap, no `ready-for-agent` label).

### Adjacent findings flagged for future tickets (not done; details in the tickets' closing comments)

1. **#95** — Rust command `tasks_edit_path` (`lib.rs`, `mise.rs` helper, `tests/tasks.rs`, mirrored `TasksEditPathResult` in `types/tauri.ts`) is now registered but unused; remove it.
2. **#92** — `DoctorPayload.activated`/`shimsOnPath` + their parsing are dead for the summary row (kept for raw output); pre-existing rules-of-hooks violation in `DoctorContent`.
3. **#91** — the too-old gate parses pipe-delimited params from Rust error text; fragile if `mise version --json` ever drops `latest`.
4. **#90** — ui-ux-rules "a data table never demands horizontal scrolling" is now in tension with fixed-table min-width; needs a one-line doc clarification.
5. **#94** — StyleGuide dev page has hardcoded English gallery strings (i18n gap).
6. **#89** — EnvPage source Badge and directory recents menu items intentionally keep native `title` (explained in the closing comment; needs a decision only if the owner wants richer affordances there).

## Latest release: v1.0.0-beta.7 (2026-09-04)

Published with all six assets. Carries the beta6 feedback batch (#75–#84) + #85 + the streamed-output truncation fix (`1feb11d`). beta7's own batch (#87–#95) is on `master` and rides to the **next** release.

### Release procedure (reapply for the next release)

1. Version bump touches **6 places across 5 files**: `misedeck/package.json`, `misedeck/package-lock.json` (×2), `misedeck/src-tauri/Cargo.toml`, `misedeck/src-tauri/Cargo.lock` (the `name = "misedeck"` entry), `misedeck/src-tauri/tauri.conf.json`. Grep-verify N×new / 0×old; `cargo check` + `npm run ci` green before tagging.
2. `chore(release): bump version to X` → annotated tag `vX` (tag message = Release body, en + zh-CN) → push master + tag → `release.yml` builds macOS/Windows/Linux and publishes the GitHub Pre-release.
3. **Push often needs the proxy**: `git -c http.proxy=http://127.0.0.1:7890 push origin …` (plain push 502s intermittently). Always verify a tag landed: `git ls-remote origin refs/tags/<tag>` — a silent `-q` failure looks like success.

## Standing architecture / rules the next session must know

- **`FloatingMenu`** (`misedeck/src/components/FloatingMenu/`) is the only floating-layer implementation; **`Tooltip`** (`misedeck/src/components/Tooltip/`) is the only hover-detail layer for ellipsized data (has a copy button; native `title` on data is gone app-wide).
- **`useExecutionContext().run()` returns a result** and every mise invocation (reads included) goes through the execution panel — **ADR-0005**. Read hooks have no `queryFn`; the panel run is the fetch. `RunOptions.background` keeps app-initiated refreshes off the transcript. Never reintroduce direct `invoke()` calls.
- **Copy-command lives in the execution panel**; `DirectoryIndicator`'s copy button is deleted (#72).
- **Naming:** preview page = 概览 / Overview; `directory.eyebrow` = 当前目录 / CURRENT DIRECTORY. The terminology ban (`ui-ux-rules.md`) also covers 上下文 / 项目.
- **Typography:** the eyebrow is the only uppercase element; uppercase/tracking never on data — data components reset inheritance at their root (#93/#94, both docs locales).
- **Tables:** the 6 fixed tables declare `min-width` so narrow windows scroll horizontally (#90); long cells ellipsis + Tooltip (#81/#89).
- Chrome surface hierarchy: `--hull` / `--hull-soft` / `--hull-deep` + `--panel` as the elevated role — **ADR-0006** (#78).
- No frontend component test harness (no vitest/jest). Rust tests live in `misedeck/src-tauri/tests/`.

## Working agreement reminders

- **One ticket per session / subagent.** Do not batch unrelated tickets.
- **Build before commit.** `npm run ci` and `cargo check` must pass.
- **No visual verification by agents** (owner rule since the beta6 batch): no screenshots, no running the app, no simulator, no kimi-cu. Mark every closed issue "not visually verified".
- **All UI copy through i18n.** `npm run lint:i18n` must stay green.
- **Mirror docs to zh-CN** when any doc is touched.
- **Commit to master** referencing the issue (`#N`); push after; master stays green. Never force-push or delete branches/tags.
- **Commit ONLY ticket-relevant files.** `.workbuddy/` and scratch files stay out of ticket commits.

## Critical files

| File | Purpose |
| ---- | ------- |
| `docs/design/product-logic.md` | Source of truth for IA, navigation, execution-panel rules, and page inventory. |
| `docs/design/visual-language.md` | mise.jdx.dev-derived tokens for light + dark themes. |
| `docs/design/ui-ux-rules.md` | Hard interaction/presentation rules from the beta review cycles. |
| `misedeck/src/components/ExecutionPanel/` | Execution panel (every mise invocation routes through it). |
| `misedeck/src/i18n/{en,zh-CN}.json` + `keys.ts` | i18n catalog; `npm run lint:i18n` enforces parity. |
| `misedeck/scripts/check-css-tokens.ts` | CSS token guard — `npm run lint:css-tokens`. |
| `misedeck/src-tauri/src/lib.rs` / `mise.rs` | Tauri commands and the mise runner. |

## Environment reminders

- Rust toolchain is **managed by mise**. For every shell that needs `cargo`/`rustc`, run:
  ```
  source /Users/lifan/AiCodingProjects/mise-ui/.mise-shims/env.sh
  ```
- mise is at `/Users/lifan/.local/bin/mise`; shims at `/Users/lifan/.local/share/mise/shims/`.
- Tauri dev: `cd misedeck && npm run tauri dev`. Frontend-only: `npx tsc --noEmit` / `npm run build`.
- `node_modules` once silently lost `@tauri-apps/api`; if builds fail oddly, `npm install` first. Do not commit local npm-version churn in `package-lock.json`.
