# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.

## CURRENT STATE (2026-09-10, evening)

**Tools-page lifecycle chain #129–#135 fully implemented in one autonomous run.** All seven tickets closed, each its own subagent, committed to master and pushed. **#136** (plugins registry table removal) is **owner-gated** on his verdict on #134's effect; **#137** (app icon) is an **owner taste gate** — next session should propose 2–3 icon directions for him to pick, then produce assets. Note: an unreviewed owner-side commit `f3d9d8b` ("icon", binary icon assets) was already on master and pushed before this run — possibly early #137 work.

| Ticket | Commit | Notes |
| --- | --- | --- |
| #129 panel fail-on-success wire-shape | `d651a3c` | removed `#[serde(flatten)]` from `InstallCommandResult`; new Rust contract suite `tests/wire_shapes.rs` (18 tests, every `*Result` variant); fail path no longer shows stale exit code (`exitCode: number \| null`); drift-guard rule in architecture.md both locales |
| #130 toolbar refresh never renders | `9e1e657` | `PageRefreshProvider` lifted above the router in `main.tsx`; rule codified (chrome-level contexts can't be consumed by the page rendering their PageShell) |
| #131 unuse/uninstall semantics | `bc464ec` | row danger = 卸载/Unuse (`mise unuse`; orphans → `uninstall --all`); per-version 删除此版本/Uninstall on non-active rows only; argv builders + fixtures in Rust tests; vocabulary rule in ui-ux-rules both locales |
| #132 version dropdown | `3830608` | `UseVersionCell` dropdown of installed versions replaces free-text switch; Use/使用 + Install only/仅安装 naming landed (ADR-0008); rule: version switching never free-typed |
| #133 expandable row version center | `264759b` | new `VersionCenter` (installed + available sub-lists, cached `ls-remote`, client filter/paginate ≥10, version-desc sort, installed markers); Table gained `expandedKey`/`renderExpanded`; both `VersionQuerySection`s + datalists deleted; rules codified |
| #134 registry search add-tool entry | `b82d58a` | `AddToolEntry` combobox at top of ToolsPage; bottom install form + `?install=` round trip gone; **Plugins registry Install button REMOVED** (registry is browse-only until #136) |
| #135 narrow run-lock + Advanced link form | `505a165` | row-expand no longer locked; `LinkToolForm` in collapsed Advanced section; run-lock rule codified (command-firing controls only) |

**Flagged for the owner (from closing comments):** (1) TasksPage row Edit button is disabled while a command runs although it only opens an inline form — borderline under the new run-lock rule, needs his call; (2) #134's suggestion list is a hand-rolled combobox, not FloatingMenu (menu-button pattern breaks typing) — documented in component comment; (3) free-text tool names (`backend:name`) stay submittable in AddToolEntry by design. All tickets: `npm run ci` green, cargo green where touched, **NOT visually verified — owner verifies manually**.

**First actions next session:** ask owner for his #136 verdict and his #137 icon-direction pick. If #136 approved, implement it; for #137, prepare 2–3 directions first.

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97, #119 (older batches) + **#128** (this batch, verify against next build).

**Design decisions settled with the owner (3 grilling rounds, 2026-09-10):** verb vocabulary per **ADR-0008** (使用/Use, 仅安装/Install only, 删除此版本/Uninstall, 卸载/Unuse — zh 卸载 maps to `mise unuse`, not `uninstall`); inline row expansion over side panel; remote version lists = one cached `ls-remote` call + client-side filter/pagination (java-scale); row switch cell = dropdown of installed versions only; run-locking narrows to command-firing controls (panel single-flight, ADR-0005, unchanged); top registry search replaces the bottom install form and the `/plugins → /tools?install=` round trip; link form becomes a collapsed Advanced section.

**Docs landed this session:** `CONTEXT.md` + zh-CN (Use/Unuse/Install/Uninstall entries), `docs/adr/0008` + zh-CN — committed `91ac671`, pushed.

**Owner directives this round (binding):** (1) interaction/functionality may break current ui-ux-rules where professionally justified, but EVERY breakthrough is codified back into `docs/design/ui-ux-rules.md` (both locales) within the same ticket; (2) visual style stays on the current token base — any visual-style change must be flagged to the owner with rationale BEFORE implementing; (3) beta10 visual pass is done — opportunistic visual findings are reported for his confirmation, not fixed silently; (4) he is not deep on the tool/plugin domain — #136 waits for his verdict on #134.

**First actions next session:** work #129 and #130 (independent, different layers — panel Rust/TS contract vs app-root provider), then the chain #131→#135 in order. One ticket per session/subagent; commit to master referencing the issue.

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97, #119 (older batches) — #128 is the new active spec.

## PREVIOUS STATE (2026-09-09, evening)

**v1.0.0-beta.10 released** (commit `96449b2`, tag pushed + verified on remote, release run `34371860413`). Carries the beta9 batch.

**Beta9 batch fully implemented and closed.** Tickets **#120–#127** all closed in one autonomous run; SPEC parent **#119 stays open** pending owner visual verification (commented with the beta.10 tag/run).

| Ticket | Commit | Notes |
| --- | --- | --- |
| #120 toolbar mode label 12px + zh tracking | `843b322` | `.eyebrow`→`.modeLabel`; `:lang(zh)` override anchored by `document.documentElement.lang` |
| #121 visual-balance floor ×12 + Badge inline + 当前目录 | `c776b9b` | Badge `size="inline"`; no lint (class ruled not mechanically decidable) |
| #122 choose-directory primary + drop "…" labels | `c6e11d7` | new `lint:i18n-ellipsis` guard |
| #123 page-eyebrow removal + nav 目录概览 | `b766ba6` | 8 pages; 8 eyebrow i18n keys deleted |
| #124 shared CommandHint + drop internal flags | `614d71f` | new `lint:command-hint` guard; no component test (no test runner) |
| #125 self-update `--yes` + GUI ConfirmDialog | `c05cb99` | root cause: stdin EOF on `[Y/n]` prompt; new Rust test suite `tests/install.rs` |
| #126 spacing tokens + check-css-spacing | `5692f50` | 23 literals (ticket said 24); 4 half-step `--space-*` tokens added; **two 7px→6px judgment calls (Badge, DoctorPage warningDot) — 1px visual shift, owner to eyeball** |
| #127 closing sweep | `ab5b5b0` | fixed 4 same-class small-text residue sites; full clean-check report on the issue; **flagged letter-spacing finding RESOLVED (`c1a017e`): `--tracking-button`/`--tracking-title` tokens + `lint:css-tracking` guard** |

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97, **#119** (new — verify against beta.10).

**Owner's standing meta-directives:** proactive-sweep reporting enforced (report clean checks too); NO agent-side visual verification ever unless asked; owner has paused visual nitpicking — function work resumes after this batch is verified.

**Previous state (2026-09-09, morning):**

**Beta9 feedback round collected, specced, ticketed — awaiting implementation in a fresh session.** SPEC parent **#119**; tickets **#120–#127** (all `ready-for-agent`; #127 closing sweep is natively blocked by #120–#126). Source of truth for every settlement: `docs/feedback/beta9-feedback-scratch.md` (owner's verbatim quotes + per-class sweeps + 定稿). Mapping: #120 toolbar mode label 12px/zh-CN tracking, #121 inline 12px floor ×13 + Badge inline size + 本目录→当前目录, #122 choose-directory primary everywhere + drop "…" labels, #123 page-eyebrow row removal + nav 目录概览, #124 shared CommandHint + drop internal flags, #125 self-update `--yes` + GUI ConfirmDialog, #126 spacing literals → tokens + `check-css-spacing` lint, #127 closing sweep.

**Doc-side changes already landed this session (uncommitted at handoff — commit first, see below):** rule cleanup per owner review (he approved rules without full understanding; several were wrong): toolbar-eyebrow exception retired and generalized into a visual-balance floor (`ui-ux-rules.md`: text sharing a line with 12px+ content is ≥ `--size-data`; quietness via `--ice`, never size; **the goal is visual balance, the floor is just its enforcement**); choose-directory mapping moved to primary, beta8 fallback clause deleted; commandHint rule gains user-commands-only + unbreakable-command + shared-component clauses; `visual-language.md`: data size pinned to `--size-data` 12px (no range), "4px grid" claim dropped (the `--space-*` scale is the truth), zh-CN eyebrow note, `--panel` changelog voice cleaned, page-header eyebrows retired (eyebrow = toolbar mode label only). **One-rule-one-home refactor**: verification rule's canonical home is now `docs/agents/conventions.md` (DoD + Verification loop merged, **agent-side visual verification banned by owner decision — slow, token-expensive, drives his machine**; substitute = generation-time lint guards; rendered confirmation = owner's beta gate); `ui-ux-rules.md` keeps only a pointer; `AGENTS.md` non-negotiables demoted to one-line index entries + new meta-rule "one rule, one home — restating is drift". All mirrored en + zh-CN (8 files).

**Owner's meta-directives this round (binding):** (1) he has PAUSED visual nitpicking after 7 rounds — not a rule, just his intent; function work resumes after this batch; (2) criticism logged: when he stops nitpicking, agents stop reporting — the proactive-sweep agreement must be enforced, reporting clean checks too; (3) verification economy: NO screenshots/app launches/computer-use, ever, unless he asks.

**First actions next session:** commit the pending doc changes (rule docs ×6 + AGENTS.md ×2 + `docs/feedback/beta9-feedback-scratch.md`, reference #119), then work the frontier #120–#126 (no inter-blockers; one ticket per session/subagent), then #127.

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97 (older batches) — #119 joins this list once its tickets close.

**v1.0.0-beta.9 released 2026-09-08** (tag pushed; release matrix run was `34242665624`). Known-leftover list empty.

**Previous state (2026-09-08):**

- Code sweep `93813eb`: **fixed a live bug** — ExecutionPanel log lines referenced nonexistent CSS classes (`stderrLine`/`stdoutLine`), so stderr tinting never applied; now `styles.line` + `data-stream`. Deleted: 31 dead i18n keys (both locales), dead hooks (`useGlobalEnvList`, `useParsedGlobalEnvList`, `dirContextLabel`), orphaned CSS (ExecutionPanel demo/caret residue, LanguageSwitcher `.root`, DirectoryPreview `.dim`, VersionQuerySection `.collapseToggle`), unused deps (`thiserror` crate, `@tauri-apps/plugin-shell` npm — Rust-side plugin stays, it powers external links), stale comments (lib.rs/mise.rs/tools.rs/IconButton). Consolidated: clipboard writes → shared `writeClipboard` (ActivationBanner, DoctorPage); Table column-width storage → `loadPersistent`/`savePersistent`. `npm run ci` + `cargo test` (124) green.
- Docs sweep `5259ad6` (all edits mirrored en + zh-CN): theme is light/dark default light (product-logic was wrong); directory-indicator action list dropped Copy-Command; conventions DoD now matches the no-visual-verification rule; runner.md cancel description corrected to reality (still soft-cancel from JS — the audit's premise was wrong; only real kill is the 30-min timeout); ci.md release bump = 6 places/5 files + file-layout tree fixed + changelog hedge resolved; **`.github/workflows/ci.yml` now runs all four lint guards** (`lint:i18n-concat`, `lint:css-font-size` added); ui-ux-rules no-op example genericized off the deleted upgrade-all; IA sketch caret removed; i18n.md key-group table → pointer to keys.ts, error-code list shows all 7 codes; domain.md fictional ADR names → real ones; `docs/agents/getting-started.md` **deleted** (scaffold era, both locales) + AGENTS.md pointer removed; ADR-0002 status note: Homebrew tap not yet implemented; tools-page.prototype.html bannered as historical.

**Error-key gap RESOLVED as #118** (`ecb987b`): shared `resolveAppErrorMessage` in `misedeck/src/utils/appError.ts` parses the `key|param=value` wire format; catalog-miss on a key-shaped message falls back to `errors.unknown` (raw keys can never render); `KNOWN_MESSAGE_KEYS` keeps dynamically-resolved keys alive against dead-key sweeps. Added `errors.miseNotFound`/`miseTooOld`/`terminalNotFound`/`unknown` (both locales); TERMINAL_NOT_FOUND now sends a key from `shell.rs` (was raw English); HomePage/trust/activation consumers all wired through the resolver. Contract codified in conventions.md, i18n.md gap note rewritten (both locales). Note (resolved pre-beta9): `UNTRUSTED` was declared but never emitted by Rust — removed from `mise.rs`, `AppErrorCode`, HomePage's switch, and the code lists in conventions.md / i18n.md (both locales); `toTrustState`'s raw-English defensive fallbacks ("unexpected response") now emit the `errors.unknown` key, which the hook resolves via `resolveAppErrorMessage` (`errors.unknown` added to `KNOWN_MESSAGE_KEYS`).

**Owner decisions (2026-09-08, all resolved):** (1) HANDOFF.md stays English-only — mirroring exemption now codified in AGENTS.md both locales; (2) `docs/agents/issue-tracker.md` /triage + /wayfinder sections KEPT (mattpocock skill machinery the owner may use later); (3) zero-caller shared-component variants (Badge `danger`, Banner `danger`/`success`, DataRow `muted`, ProgressDot `ice`, IconButton `secondary`) KEPT intentionally — do not re-flag these in future audits.

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
