# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.
Last updated: 2026-09-03 — **beta4 round COMPLETE and shipped as v1.0.0-beta.5** (tag pushed, release workflow building installers). All tickets #46–#60 done and merged to master (#46 73eb690, #47 366c079, #48 aa857fb, #49–#50/#54/#57 earlier, #51 b765193, #52 30c6afb, #53 b09708b, #55 18556c9, #56 f138901, #58 d8ede91, #59 0c7b3d8, #60 b9b1bc1). SPEC parent #45 left open intentionally — close it after the owner's in-person visual verification.

**Status:** v1 implementation (11 tickets, #34–#44) is complete and shipped as beta.4. The beta4 UI/UX feedback round (#46–#60) is now fully implemented. **Next step: owner does in-person visual verification (none of #46–#60 was visually verified, per driver instruction), then closes SPEC parent #45.** Note for verification: #56 changed the uninstall command to target `<tool>@<version>` (was `<tool>`) so the confirmation dialog's command is honest.

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

## Remaining open issues

- The beta4 round (#46–#60) is **done**; only SPEC parent **#45** remains open, awaiting owner visual verification before closing.
- Older, not in scope: #11–#15 (chore/roadmap, no `ready-for-agent` label).

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
