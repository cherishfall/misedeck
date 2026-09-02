# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.
Last updated: 2026-09-02 — beta4 round in progress; #49 (sidebar chrome) and #50 (Tools data honesty) done; #54, #55/#56/#57 unblocked.

**Status:** v1 implementation (11 tickets, #34–#44) is complete and shipped as beta.4. The beta4 UI/UX feedback round is fully recorded, audited, and published to GitHub — the next work is driving those tickets.

---

## What just happened (beta4 feedback round, 2026-09-02)

- 8 user feedback items + a two-track full-app audit (visual + product/UX) were aligned with the owner and published:
  - **SPEC parent: #45**. **Tickets: #46–#60**, labels `v1` + `ready-for-agent`, native blocking + sub-issue links set.
  - Startable now (no blockers): **#46** async Tauri commands, **#47** title bar follows theme, **#48** Preview/Global/vocab, **#51** Plugins page, **#52** Settings editing, **#53** a11y, **#54** footer controls (unblocked by #49, now closed), **#55/#56/#57** (unblocked by #50, now closed).
  - Blocked: #58/#59←#57; #60 (visual sweep, last) ←#54,#57,#59.
- Sources of truth for the round (all committed):
  - `beta4-feedback-scratch.md` — verbatim feedback + alignment + issue mapping.
  - `beta4-audit-visual.md` / `beta4-audit-product.md` — full audit reports; screenshots in `docs/screenshots/beta4-audit/`.
- New standing rule set: `docs/design/ui-ux-rules.md` (+ zh-CN mirror), pointed to from `AGENTS.md`. Verification is deliberately **economical**: build + run + static self-audit by default; screenshots only for layout restructures or on request; mark "not visually verified" when nothing was seen.
- `visual-language.md` (both locales) updated for two beta4 decisions: no `▸` eyebrow glyph; theme is two-state light/dark, default light, no system mode.
- Nav "double-click to switch" suspicion from the audit: **not reproduced on real hardware, dropped**.

## Remaining open issues

- The beta4 round above (#45–#60) is the active queue.
- Older, not in scope: #11–#15 (chore/roadmap, no `ready-for-agent` label).

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
