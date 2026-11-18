# Round-7 audit + 1.0.7 release — 2026-11-19

The owner requested a fresh comprehensive review of the shipped 1.0.6 state
(code, docs, site, visuals, copy, platform claims — "anything goes", visual
verification explicitly authorized), with the loop: findings → issues → fix →
patch release → re-audit → stop when a round comes back clean. This document
is the round-7 record; the loop continues below it in later sections.

## Method

- Four read-only audit subagents in parallel: Rust backend, frontend (React),
  documentation system, public site + release metadata. Each audited against
  the repo's own rule docs (architecture.md, conventions.md, ui-ux-rules.md,
  CONTEXT.md, ADRs, AGENTS.md) and reported evidence-backed findings
  (file:line) plus explicit clean-check lists.
- Visual sweep by the driver: 19 dark-theme screenshots (8 pages × zh/en +
  three interaction states: the uninstall confirm dialog, settings `--all`,
  and the tools version-management region), on top of the fresh 16-shot
  light set captured the same day. Harness: the temporary seed
  (sync-XHR `shot.json` → localStorage + replaceState before i18next/router,
  click actions after mount), window temporarily 1280×861, debug binary
  rebuilt, Vite serving; single-window captures to /tmp (see HANDOFF for the
  screencapture traps learned here).

## Findings → issues → fixes

0 P1, 8 P2, 10 P3 across the four audits + visual sweep. All filed:
#316 (app P2 batch), #317 (docs P2 batch), #318 (P3 docs batch incl. the
wire-shape pins), #319 (zh plugins copy), #320 (frontend P3 batch), #321/#322
(site P2/P3 batches), #323 (AA contrast token pairs — owner-gated design
decision, OPEN).

Fixed in two app commits (`c86fe13` code, `059601f` docs) and one site
commit; the frontend gate (`npm run ci`, 21 steps), `cargo clippy
--all-targets --features fixtures -- -D warnings`, and the full Rust suite
(20 "ok" results, 0 failures) were green on the fixed tree before the
release commit.

Highlights (each with evidence on its issue):

- Settings `--all` rendered the literal text "undefined" for unset rows —
  `formatValue` had no `undefined` branch (screenshot-verified in dark zh).
- Windows cancel/timeout/quit flashed a console: `kill_group`'s `taskkill`
  spawn lacked `hide_console_window`, against the module's own #240 rule.
- `tests/runner.rs`'s three spawn tests predate the #278 serial sweep and
  were missed; now `#[serial]` (env-rewrite rule from conventions.md).
- The macOS CI leg failed twice on `open -a Terminal` despite the runner
  reporting a GUI session; the test now, under `GITHUB_ACTIONS`, asserts the
  keyed `COMMAND_FAILED` carries `app=Terminal.app` and the resolved path —
  the resolution claim holds in both branches on any host.
- The registry search rendered a failed `mise registry --json` read as
  "no matches"; it now renders the shared failure card with retry (the
  `{kind:"err"}` union is a resolved invoke, so no global notice fired).
- Home's timeout card kept neither the detail nor a retry; both siblings had
  them.
- AGENTS.md prescribed `gh issue view --json issueDependenciesSummary`
  (nonexistent field; `blockedBy` is real); the developer READMEs' ci list
  said 20 steps (21 real, `lint:i18n-zh-spacing` missing).
- Site: the lightbox caption failed contrast in light theme (1.29:1);
  Overview/Tasks feature cards under-listed the commands the pages run;
  screenshot metadata said 1292 (real: 1289); the panel mock wasn't
  localized; a zh alt typo (「首页页」).

Not fixed by decision: #323 — the computed AA deficits live in tokens shared
with the app (visual-language.md); changing them is a visual-design call.
Filed open-question with the numbers.

## Release 1.0.7

Version bumped in all six sites (+ README status lines and CONTEXT.md's
example), release commit `816aa44`, CI run 44389682489 green on all five
jobs, lightweight tag `v1.0.7` → release run **44390880216**: macOS leg
failed once on GitHub's hosted-runner shortage ("not acquired by Runner of
type hosted", 15m01s), rerun of the failed leg went green — six assets, the
dmg hash-checked against `SHA256SUMS` (`OK`), and the dmg was **launched on
this machine** (App Translocation path via LaunchServices): the sidebar
footer reads 1.0.7 and Home shows the real mise 2026.11.9.

Changelog regenerated; the site's version chip follows automatically.

## Round 2 (post-release re-audit)

Ran after 1.0.7 shipped, focusing on the delta (the round-7 fixes with fresh
eyes), the release artifacts, and the site's synced state — see the round-2
section appended below.
