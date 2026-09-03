# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.
Last updated: 2026-09-03 (session close) — **v1.0.0-beta.6 RELEASED** (`aeef8b5` + tag `v1.0.0-beta.6`; GitHub Pre-release published 2026-09-03T14:59:40Z with dmg/deb/rpm/AppImage/x64-setup + SHA256SUMS). A streamed-output truncation race was found right after tagging and **fixed on `master` (`1feb11d`)**; the owner chose to leave beta.6 as published, so **beta.6's binaries still contain that bug and the fix rides to the next release.** **beta5 feedback batches 1 and 2 are IMPLEMENTED and merged to master: all 11 tickets #62–#64 and #66–#73 closed.** Only the three SPEC parents remain open (#61, #65, #45), all awaiting the owner's in-person visual verification of beta.6. (beta4 round: #46 73eb690, #47 366c079, #48 aa857fb, #49–#50/#54/#57 earlier, #51 b765193, #52 30c6afb, #53 b09708b, #55 18556c9, #56 f138901, #58 d8ede91, #59 0c7b3d8, #60 b9b1bc1.)

**Status:** v1 implementation (11 tickets, #34–#44) is complete and shipped as beta.4. The beta4 UI/UX feedback round (#46–#60) and both beta5 batches are now fully implemented. **Next step: owner does in-person visual verification (NONE of #46–#73 was visually verified — every ticket was closed with an explicit "not visually verified" note), then closes SPEC parents #45, #61, #65.** Note for verification: #56 changed the uninstall command to target `<tool>@<version>` (was `<tool>`) so the confirmation dialog's command is honest.

---

## What just happened (beta4 feedback round, 2026-09-02)

- 8 user feedback items + a two-track full-app audit (visual + product/UX) were aligned with the owner and published:
  - **SPEC parent: #45**. **Tickets: #46–#60**, labels `v1` + `ready-for-agent`, native blocking + sub-issue links set.
  - Startable now (no blockers): **#60** visual remnant sweep (last one). (#47 done, 366c079. #48 done, aa857fb. #51 done, b765193. #52 done, 30c6afb. #46 done, 73eb690. #53 done, b09708b. #55 done, 18556c9. #56 done, f138901. #58 done, d8ede91. #59 done, 0c7b3d8.)
  - Blocked: none remaining.
- Sources of truth for the round (all committed):
  - `beta4-feedback-scratch.md` — verbatim feedback + alignment + issue mapping.
  - `beta4-audit-visual.md` / `beta4-audit-product.md` — full audit reports; screenshots in `docs/screenshots/beta4-audit/`.
- New standing rule set: `docs/design/ui-ux-rules.md` (+ zh-CN mirror), pointed to from `AGENTS.md`. Verification is deliberately **economical**: build + run + static self-audit by default; screenshots only for layout restructures or on request; mark "not visually verified" when nothing was seen.
- `visual-language.md` (both locales) updated for two beta4 decisions: no `▸` eyebrow glyph; theme is two-state light/dark, default light, no system mode.
- Nav "double-click to switch" suspicion from the audit: **not reproduced on real hardware, dropped**.

## v1.0.0-beta.6 release (2026-09-03 night)

- Version bump touched the usual **6 places across 5 files**: `misedeck/package.json`, `misedeck/package-lock.json` (2), `misedeck/src-tauri/Cargo.toml`, `misedeck/src-tauri/Cargo.lock` (the `name = "misedeck"` entry at line ~2094), `misedeck/src-tauri/tauri.conf.json`.
- Flow: `chore(release): bump version to 1.0.0-beta.6` (`aeef8b5`) → annotated tag `v1.0.0-beta.6` (tag message *is* the Release body, en + zh-CN) → push master + tag → `release.yml` builds macOS/Windows/Linux installers and publishes a GitHub Pre-release.
- `cargo check` and `npm run ci` were both green before tagging.
- **Push note (third time this happened):** `git push origin <tag>` failed with `CONNECT tunnel failed, response 502`; the proxy form worked: `git -c http.proxy=http://127.0.0.1:7890 push origin v1.0.0-beta.6`. `git push origin master` succeeded without the proxy in the same session — the failure is intermittent, not deterministic.
- This release also carries the **beta.5 post-tag CI fix** (`2463528`, test-only, Linux `TERMINAL_NOT_FOUND` assertion), which was deliberately held back from beta.5 rather than re-tagging a published release.
- **Published assets** (all six built and uploaded): `misedeck_1.0.0-beta.6_aarch64.dmg` (4.1 MB), `misedeck_1.0.0-beta.6_x64-setup.exe` (2.8 MB), `misedeck_1.0.0-beta.6_amd64.deb` (5.3 MB), `misedeck-1.0.0-beta.6-1.x86_64.rpm` (5.3 MB), `misedeck_1.0.0-beta.6_amd64.AppImage` (76.5 MB), `SHA256SUMS`.
- The only CI annotation is the pre-existing "Node.js 20 is deprecated" notice from `actions/checkout@v4` / `setup-node@v4` / `upload-artifact@v4` — harmless, but worth upgrading those actions eventually.

### Post-release bug found and fixed: streamed output was being truncated

`1feb11d` (after the `v1.0.0-beta.6` tag — **not in the published artifacts**) fixes a real race in both streaming runners.

- **Symptom:** `rust (ubuntu-latest)` went red on `install::tests::run_install_streams_a_short_command` (expected `["line-1","line-2"]`, got `[]`). The commit under test only touched a markdown file, so the test was flaky — but it exposed a production bug.
- **Root cause:** both runners spawn a reader thread per pipe feeding an `mpsc` channel, then poll `child.try_wait()`. In the exited branch the code **drained the channel before joining the readers**. Any line a reader had not yet sent was lost permanently — nobody drains again after `join()`.
- **Sites fixed** (all now join-then-drain, with a why-comment): `mise.rs` exit branch; `install.rs` `run_install` exit branch; the inlined loop in the test. The two **timeout branches** (`mise.rs` ~335, `install.rs` ~167) did `kill→wait→join` with no post-join drain, so they dropped the last lines too — both now drain after joining.
- **Impact:** `mise.rs` is the runner ADR-0005 routes *every* mise invocation through, so a command's tail output — including its error lines — could be silently truncated in the execution panel. That is a data-honesty violation, not a cosmetic one.
- **Verification:** the race cannot be reproduced locally (on macOS the reader thread usually wins). The ubuntu runner is the real check; `cargo test` and all three CI jobs are green.
- **Owner decision (2026-09-03): leave `v1.0.0-beta.6` as published.** The fix stays in `master` and rides to the next release. Do not re-tag or delete the remote tag/release unless the owner asks. Rationale for the next session: the bug is real but narrow (it needs the reader thread to lose the race, which is rare on macOS and shows up mainly under Linux runner load), and the owner prefers not to churn releases for it.
- **Known limitation of the shipped beta.6 binaries:** a mise command's tail output can occasionally be truncated in the execution panel — most visibly, a failed command showing an empty error. If a user reports that, it is this bug, and it is already fixed on `master`.

## Remaining open issues

- **Nothing left to implement.** All 11 tickets from both beta5 batches are closed and merged:

| Ticket | What | Commit |
| --- | --- | --- |
| #62 | Sidebar: Home to nav head; theme pill inline with the language switcher (drops label + box), 30px to match height | `91cc9c5` |
| #63 | `FloatingMenu` portal primitive + language menu migration; new `--z-popover: 60`; WAI-ARIA Menu Button Pattern | `89783a4` |
| #64 | Directory switcher popover migrated onto `FloatingMenu` | `9da476b` |
| #69 | `parseLsPayload` accepts the array payload of `mise ls --json <tool>` + new Rust test | `0c573e0` |
| #70 | `Pagination` component (client-side) + per-row uninstall on installed versions | `b48acac` |
| #71 | "Link a tool" section wrapping `mise link <tool>@<version> <path>` | `2faf5ca` |
| #72 | All mise reads routed through the execution panel (`run()` now returns a result) + command copy moved into the panel; **ADR-0005** | `79a99a1` |
| #73 | Preview page renamed to 概览/Overview; `DirectoryIndicator` persistent across global/directory modes via an explicit `mode` prop | `4378104` |
| #67 | TasksPage hardcoded values → design tokens (24 visual + 11 cosmetic + `max-width` 1280→1200) | `be198f1` |
| #68 | TasksPage five token-to-token mismatches (semantic colors, `.loading` missing uppercase/tracking) | `09d9ceb` |
| #66 | Sidebar collapse toggle drops its button padding, reuses `.navItem`'s hover-only affordance | `0ed1129` |

- **Open by design — three SPEC parents, all blocked on the owner's in-person visual verification:**
  - **#61** — beta5 batch 1 SPEC (`#62–#64` closed, unverified).
  - **#65** — beta5 batch 2 SPEC (`#66–#73` closed, unverified).
  - **#45** — beta4 round SPEC (`#46–#60` closed, unverified).
- Older, not in scope: #11–#15 (chore/roadmap, no `ready-for-agent` label).

---

## What to know before the next implementation session

- **`FloatingMenu`** (`misedeck/src/components/FloatingMenu/`) is now the only floating-layer implementation. Any new popover must use it — never hand-roll markup, and never use a separate overlay window (`ui-ux-rules.md:47`).
- **`useExecutionContext().run()` now returns a result** and every mise invocation (reads included) goes through the execution panel — see **ADR-0005**. Read hooks (`useLsTool` / `useLsRemote` / `useToolsList`) have no `queryFn`; the panel run *is* the fetch, written into the cache via `setQueryData`. `RunOptions.background` keeps app-initiated refreshes off the panel transcript. Do not reintroduce direct `invoke()` calls.
- **Copy-command lives in the execution panel**; `DirectoryIndicator`'s copy button was deleted (#72) and `activation.copyCommand*` is retired.
- **Naming:** the preview page is now 概览 / Overview; `directory.eyebrow` is 当前目录 / CURRENT DIRECTORY. The comment in `DirectoryIndicator.tsx` was corrected too — the terminology ban (`ui-ux-rules.md:45`) also covers 上下文 / 项目.
- No frontend component test harness exists (no vitest/jest). Rust tests live in `misedeck/src-tauri/tests/`.

### CI fix shipped after the tag (2026-09-03)

- CI was red on `ubuntu-latest` only: `tests/terminal.rs::open_in_terminal_rejects_empty_path` demanded `COMMAND_FAILED` but got the documented `TERMINAL_NOT_FOUND`. It had been red since #54 (`5c3ee3f`) — **pre-existing, unrelated to the beta.5 code**. macOS/Windows were green and `release.yml` built/installed fine.
- Root cause was the assertion, not the runner: an empty path falls back to `$HOME` by design (`shell.rs:410-429`), so on a Linux runner with no terminal emulator `TERMINAL_NOT_FOUND` is a valid, documented outcome.
- Fixed in `2463528` (test-only; accepts both codes). Local `cargo test --test terminal` 5/5; CI green on master.
- **Decision pending with the owner**: the fix is test-only and does not affect the built artifacts, so `v1.0.0-beta.5` was left as-is and the fix rides to beta.6. Re-tagging a published release would require deleting the remote tag + release.

---

## Recommended next-session startup

1. `git checkout master && git pull origin master`
2. Read this file, then `beta4-feedback-scratch.md` (issue mapping + context) and `docs/design/ui-ux-rules.md` (binding UI rules).
3. Pick any startable ticket from the frontier above — one ticket per session, per the working agreement in `AGENTS.md`.
4. Git push in this environment may require the proxy parameter:
   `git -c http.proxy=http://127.0.0.1:7890 push origin master` (plain `git push` worked on 2026-09-02; use the proxy only if it fails).

---

## Working agreement reminders

- **One ticket per session.** Do not batch unrelated tickets.
- **Build before commit.** `npm run ci` and `cargo check` must pass.
- **Economical visual verification** per `docs/design/ui-ux-rules.md`; never claim visual verification you did not perform.
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
| `docs/design/ui-ux-rules.md` | Hard interaction/presentation rules from the beta review cycles. |
| `misedeck/src/state/themeContext.tsx` | Theme state + persistence + `html[data-theme]` (#47, #54 touch this). |
| `misedeck/src/components/PageShell/` | App shell / sidebar (#49, #60 touch this). |
| `misedeck/src/components/ExecutionPanel/` | Execution panel (on-demand since #39). |
| `misedeck/src/i18n/{en,zh-CN}.json` + `keys.ts` | i18n catalog; `npm run lint:i18n` enforces parity. |
| `misedeck/scripts/check-css-tokens.ts` | CSS token guard — `npm run lint:css-tokens`. |
| `misedeck/src-tauri/src/lib.rs` / `mise.rs` | Tauri commands and mise runner (#46 rewrites these to async). |

---

## Environment reminders

- Rust toolchain is **managed by mise**. For every shell that needs `cargo`/`rustc`, run:
  ```
  source /Users/lifan/AiCodingProjects/mise-ui/.mise-shims/env.sh
  ```
  Without it, `cargo` is "command not found".
- mise is at `/Users/lifan/.local/bin/mise`; mise shims are at `/Users/lifan/.local/share/mise/shims/`.
- For Tauri dev: `cd misedeck && npm run tauri dev`.
- For frontend-only: `cd misedeck && npx tsc --noEmit` and `npm run build`.
