# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.

## CURRENT STATE (2026-09-08, updated 3)

**Pre-beta9 cleanup/slimming done** (two audit subagents → two fix subagents; not ticketed, one-shot maintenance commits):

- Code sweep `93813eb`: **fixed a live bug** — ExecutionPanel log lines referenced nonexistent CSS classes (`stderrLine`/`stdoutLine`), so stderr tinting never applied; now `styles.line` + `data-stream`. Deleted: 31 dead i18n keys (both locales), dead hooks (`useGlobalEnvList`, `useParsedGlobalEnvList`, `dirContextLabel`), orphaned CSS (ExecutionPanel demo/caret residue, LanguageSwitcher `.root`, DirectoryPreview `.dim`, VersionQuerySection `.collapseToggle`), unused deps (`thiserror` crate, `@tauri-apps/plugin-shell` npm — Rust-side plugin stays, it powers external links), stale comments (lib.rs/mise.rs/tools.rs/IconButton). Consolidated: clipboard writes → shared `writeClipboard` (ActivationBanner, DoctorPage); Table column-width storage → `loadPersistent`/`savePersistent`. `npm run ci` + `cargo test` (124) green.
- Docs sweep `5259ad6` (all edits mirrored en + zh-CN): theme is light/dark default light (product-logic was wrong); directory-indicator action list dropped Copy-Command; conventions DoD now matches the no-visual-verification rule; runner.md cancel description corrected to reality (still soft-cancel from JS — the audit's premise was wrong; only real kill is the 30-min timeout); ci.md release bump = 6 places/5 files + file-layout tree fixed + changelog hedge resolved; **`.github/workflows/ci.yml` now runs all four lint guards** (`lint:i18n-concat`, `lint:css-font-size` added); ui-ux-rules no-op example genericized off the deleted upgrade-all; IA sketch caret removed; i18n.md key-group table → pointer to keys.ts, error-code list shows all 7 codes; domain.md fictional ADR names → real ones; `docs/agents/getting-started.md` **deleted** (scaffold era, both locales) + AGENTS.md pointer removed; ADR-0002 status note: Homebrew tap not yet implemented; tools-page.prototype.html bannered as historical.

**Known gap discovered, not fixed (candidate for a beta9 ticket):** `mise.rs` error payloads reference message keys `errors.miseNotFound` / `errors.miseTooOld` etc., but the i18n catalogs contain only `errors.timeout` — other error codes have no dedicated `errors.*` key (`MISE_TOO_OLD` copy actually lives in `states.tooOld.*`). Documented in i18n.md as a known gap.

**Pending owner decisions (flagged, not acted on):** (1) HANDOFF.md has no zh-CN mirror — recommend documenting the exemption in AGENTS.md rather than mirroring an ephemeral handoff doc; (2) `docs/agents/issue-tracker.md` /triage + /wayfinder boilerplate sections unused by the real workflow — trim or keep; (3) zero-caller shared-component variants (Badge `danger`, Banner `danger`/`success`, DataRow `muted`, ProgressDot `ice`, IconButton `secondary`) — kept for now, consistent with the earlier Banner-success decision.

**Post-beta8 cleanup batch done.** Follow-up tickets **#114–#117** implemented and closed (OutdatedHint refactor resolving the #102 deviation; i18n-concat lint guard; component font-size token sweep + guard; StyleGuide gallery deleted). **AGENTS.md gained a new working agreement** (en + zh-CN, commit `92247b2`): rule-introducing tickets must sweep their own class app-wide, and mechanically checkable classes get lint guards in `npm run ci`.

| Ticket | Commit | Notes |
| --- | --- | --- |
| #114 shared OutdatedHint | `eb9f8b9` | one component owns loading/n>0/all-up-to-date; `common.outdatedCount`/`common.allUpToDate` ({{count}} interpolation); `tools.outdatedBadge`/`tools.noOutdated` retired — **#102 deviation formally resolved**; count format changed `outdated (3)` → `3 outdated` (visual, owner to verify) |
| #115 i18n-concat lint | `339f7d0` | `scripts/check-i18n-concat.ts` in ci (AST walk, rejects t(…) as + operand / in template literals); sweep fixed 4 sites (TasksPage count + hardcoded `runLabel required`, ThemeSwitcher, EnvPage/Preview source badges); rule codified in conventions.md both locales |
| #116 component font-size sweep | `da5a38e` | `scripts/check-css-font-size.ts` in ci; 18 literals in 8 component CSS modules folded to `--size-*` tokens, zero remain. **Largest visual fold: EmptyState title 18→14px**; full fold table on the issue — owner visual verification needed |

**#117 done (this session):** StyleGuide dev gallery removed entirely — component + CSS module, `/__styleguide` route in `main.tsx`, the whole `styleguide.*` i18n namespace (60 keys × 2 locales), and the now-stale mentions in `docs/design/product-logic.md` (both locales) and `check-css-tokens.ts` comments. The "StyleGuide demo drift" owner decision below is thereby resolved by deletion.

**Beta8 batch fully implemented.** All 16 tickets **#98–#113** closed in one autonomous run; SPEC parent **#97 stays open** pending the owner's in-person visual verification (same protocol as #86). Every ticket: `npm run ci` (+ `cargo check` where Rust touched) green, static self-audit, **NOT visually verified**.

| Ticket | Commit | Notes |
| --- | --- | --- |
| #98 chrome/toolbar+caret+unified refresh | `54db21f` | PageShell-owned unified refresh (`useRegisterPageRefresh`); 7 local refresh buttons deleted |
| #99 HomePage version compare+update row | `3660bb6` | segment-wise compare; DataRow `flare` tone added; RAW copy (stand-in until #107) |
| #100 glyph sweep ▹→→ + ▾ leftovers | `25e7080` | shared `.upgrade-arrow` in tokens.css; zero ▹/▾ left in src |
| #101 eyebrow dedupe+lockfile hidden | `fbb2f1b` | 9 section eyebrows removed; lockfile section renders only with content/error |
| #102 remove upgrade-all+install variant | `c4713bc` | `tools.noOutdated` KEPT — still feeds live toolbar hints (deviation noted on ticket) |
| #103 fixed px columns | `9308322` | 5 % columns → px; `TableColumn.minWidth` added |
| #104 column drag-resize | `bccf5f7` | opt-in `resizeKey` on Table; localStorage `misedeck.tableWidths.<key>` |
| #105 sortable columns | `06d71d0` | `sortValue`/`sortVersion`; `compareVersions` extracted to `utils/versions.ts` |
| #106 table text filter | `bd06cbe` | `useTableFilter` + `TableFilter` component; registry search gained clear |
| #107 Tooltip guard+CopyButton | `9e98e19` | shared CopyButton; Tooltip pops only on non-empty/non-— values |
| #108 UI-state persistence | `8dcdfe5` | `usePersistentState` hook; panel height is NEW (drag handle 120–600px) |
| #109 form Enter/Esc+datalists | `72e29bc` | `KeyForm`+`Suggestions` components; 9 sites; placeholder width fixes |
| #110 tools table signals | `c9da912` | inactive note (not badge); `current → latest` path; stable version color |
| #111 tools form comprehension | `69820e5` | empty version = latest (JS+Rust argv in lockstep); click-tool-prefills-query; live command preview |
| #112 page dead-ends & copy | `80f64fb` | tasks open-config CTA; plugins uninstall via ConfirmDialog; doctor → Home link; settings count i18n |
| #113 token alignment | `4051c96` | found 17 literals in 7 files (ticket said 14/6); all mapped to `--size-*` tokens |

**Adjacent findings flagged on closing comments (not ticketed yet):** TasksPage hardcoded `"{runLabel} required"` string + its toolbar count concatenation (same class as #112's settings fix); ToolsPage "Active" column now partially redundant with the inline 未激活 note; component-level CSS px literals remain (Badge 9px, Button 11.5/12.5px, etc. — #113 covered pages only); tools-page click-tool doesn't scroll the query section into view; `docs/design/tools-page.prototype.html` still has ▾ carets (static prototype).

**Beta7 batch fully closed** (tickets #87–#95, SPEC #86):

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

1. ~~**#95** — dead Rust command `tasks_edit_path`~~ **Done as #96** (`6f9d81b`, closed). Also removed the other dead Tauri commands found in the same sweep: `tools_ls`, `tools_ls_remote`, `tools_ls_tool` (the `ls` family has been dispatched through the execution panel's generic `run_mise_command` since #72; the "kept for callers outside the UI" comment was stale). Kept: the `mise.rs` helpers + `TasksEditPathResult` enum + `tests/tools.rs`/`tests/tasks.rs` — still exercised by Rust integration tests. Inventory now: every registered command has a live frontend caller.
2. **#92** — `DoctorPayload.activated`/`shimsOnPath` + their parsing are dead for the summary row (kept for raw output); pre-existing rules-of-hooks violation in `DoctorContent`.
3. **#91** — the too-old gate parses pipe-delimited params from Rust error text; fragile if `mise version --json` ever drops `latest`.
4. **#90** — ui-ux-rules "a data table never demands horizontal scrolling" is now in tension with fixed-table min-width; needs a one-line doc clarification.
5. ~~**#94** — StyleGuide dev page hardcoded English gallery strings~~ Resolved by #117 (StyleGuide deleted).
6. **#89** — EnvPage source Badge and directory recents menu items intentionally keep native `title` (explained in the closing comment; needs a decision only if the owner wants richer affordances there).

## Latest release: v1.0.0-beta.8 (2026-09-08)

Tag pushed, `release.yml` run 34143786713 building/publishing in the background (macOS/Windows/Linux assets + GitHub Pre-release). Carries the beta7 feedback batch (#87–#95) + dead-command cleanup #96 (`d7852ea`). Confirm the run finished and all six assets are attached before announcing.

### Release procedure (reapply for the next release)

1. Version bump touches **6 places across 5 files**: `misedeck/package.json`, `misedeck/package-lock.json` (×2), `misedeck/src-tauri/Cargo.toml`, `misedeck/src-tauri/Cargo.lock` (the `name = "misedeck"` entry), `misedeck/src-tauri/tauri.conf.json`. Grep-verify N×new / 0×old; `cargo check` + `npm run ci` green before tagging.
2. `chore(release): bump version to X` → annotated tag `vX` (tag message = Release body, en + zh-CN) → push master + tag → `release.yml` builds macOS/Windows/Linux and publishes the GitHub Pre-release.
3. **Push often needs the proxy**: `git -c http.proxy=http://127.0.0.1:7890 push origin …` (plain push 502s intermittently). Always verify a tag landed: `git ls-remote origin refs/tags/<tag>` — a silent `-q` failure looks like success.

## Standing architecture / rules the next session must know

- **`FloatingMenu`** (`misedeck/src/components/FloatingMenu/`) is the only floating-layer implementation; **`Tooltip`** (`misedeck/src/components/Tooltip/`) is the only hover-detail layer for ellipsized data (has a copy button; native `title` on data is gone app-wide, with two intentional exceptions — the EnvPage source Badge and the directory recents menu items, per the #89 finding above).
- **`useExecutionContext().run()` returns a result** and every mise invocation (reads included) goes through the execution panel — **ADR-0005**. Read hooks have no `queryFn`; the panel run is the fetch. `RunOptions.background` keeps app-initiated refreshes off the transcript. Never reintroduce direct `invoke()` calls.
- **Copy-command lives in the execution panel**; `DirectoryIndicator`'s copy button is deleted (#72).
- **Naming:** preview page = 概览 / Overview; `directory.eyebrow` = 当前目录 / CURRENT DIRECTORY. The terminology ban (`ui-ux-rules.md`) also covers 上下文 / 项目.
- **Typography:** the eyebrow is the only uppercase element; uppercase/tracking never on data — data components reset inheritance at their root (#93/#94, both docs locales).
- **Tables:** the 6 fixed tables declare `min-width` so narrow windows scroll horizontally (#90); long cells ellipsis + Tooltip (#81/#89).
- Chrome surface hierarchy: `--hull` / `--hull-soft` / `--hull-deep` + `--panel` as the elevated role — **ADR-0006** (#78).
- No frontend component test harness (no vitest/jest). Rust tests live in `misedeck/src-tauri/tests/`.

## Feedback docs

Per-beta feedback scratch/audit docs live in **`docs/feedback/`** (`betaN-feedback-scratch.md`, audits). New cycles (e.g. beta8) go there — never the repo root.

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
