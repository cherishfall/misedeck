# MiseDeck

> [简体中文](./zh-CN/AGENTS.md)

An open-source desktop GUI client for [mise](https://mise.jdx.dev). Tauri 2 + React/TypeScript, cross-platform (macOS polished first, Windows/Linux beta). Product principles:

1. **GUI edition of the CLI**: MiseDeck is the GUI counterpart of the mise CLI — using the GUI should gradually teach the CLI, not hide it.
2. **CLI-shaped interaction**: follow mise CLI's usage and interaction logic. The ban is on inventing concepts, vocabulary, or features mise does not have — not on GUI-layer affordances. Presentation and interaction capabilities that make the GUI humane (column resizing, copy affordances, pre-install checks) are orthogonal to CLI functionality and are allowed and encouraged (ADR-0007).
3. **CLI vocabulary only**: no concepts or terms that mise does not have (ADR-0004); build the product from mise's own concepts and nouns.

## Before you code

- Read `CONTEXT.md` (domain glossary) and any ADR in `docs/adr/` touching your area. Use glossary vocabulary in code, issues, and UI copy.
- Per-beta feedback scratch/audit docs live in `docs/feedback/` (`betaN-feedback-scratch.md`, `betaN-audit-*.md`); new feedback cycles create their files there, never at the repo root. These are working scratch docs, exempt from the zh-CN mirroring rule.
- The v1 spec and implementation tickets live in GitHub Issues (`ready-for-agent` label); see `docs/agents/issue-tracker.md`.
- UI work derives color, type, layout, and motion from `docs/design/visual-language.md` (issue #33); never invent new tokens or effects.
- UI work (any page, component, style, or copy) also follows `docs/design/ui-ux-rules.md` — hard interaction and presentation rules distilled from beta review cycles. Violating them is a bug.

## Working agreement (one ticket per session)

- Work on exactly ONE ticket per session. Tickets are GitHub issues labelled `ready-for-agent`; a ticket is startable only when every issue in its "Blocked by" list is closed. Check with `gh issue view <n> --json issueDependenciesSummary` or look at the issue page.
- Before writing code: read the ticket, this file, `docs/agents/architecture.md`, and `docs/agents/conventions.md`.
- Stay inside the ticket's acceptance criteria. Notice something the ticket does not cover? Comment on the issue instead of expanding scope.
- Autonomous mode: when the user asks you to drive tickets continuously, after closing one ticket move straight to the next startable one. Stop and ask only when: a decision needs human taste (visual design, naming), an outward-facing action is required (release, repo settings, secrets), the same ticket has failed three attempts, or requirements are ambiguous.
- Feedback review ends with a proactive sweep. The product owner is not a professional UI/product reviewer — reported issues are a subset of what exists. When closing a feedback cycle, audit the whole app for same-class and adjacent issues; report what you found, **including the checks that came back clean**, and either flag a finding for a decision or ticket it on professional judgment. Staying silent about a known gap is not an option.
- Rule-introducing tickets sweep their own class. When a ticket fixes one instance of a pattern AND establishes a rule (i18n concatenation, hardcoded tokens, glyph misuse, button-variant vocabulary, …), the ticket's scope includes an app-wide sweep of that same pattern — fix every occurrence in the same commit, don't leave same-class residue for follow-up tickets. When the class is mechanically checkable, prefer a lint guard wired into `npm run ci` over a written rule alone (generation-time, not review-time).

## Non-negotiables

- The maintainer is a product owner, not a code reviewer; the Definition of done and verification loop live in `docs/agents/conventions.md` — verification is static-first, and agent-side visual verification (launching the app, screenshots, click-throughs) is off the table unless the owner asks (beta9). Unviewed UI is marked "not visually verified".
- Every mise invocation goes through the execution panel (ADR-0005); its behavior rules live in `docs/design/ui-ux-rules.md` → Execution panel.
- All UI strings go through i18n (en + zh-CN); no hardcoded copy. Behavior rules: `docs/design/ui-ux-rules.md` → Copy; engineering: `docs/agents/i18n.md`.
- One rule, one home: every rule has exactly one canonical doc; other docs — this file included — link instead of restating. New rules go into their home doc; a restated rule is drift waiting to happen (beta9).
- Cross-platform from day one: paths and process spawning via Tauri/Rust APIs only.
- Read `docs/agents/architecture.md` before creating or modifying any Tauri command, and `docs/agents/conventions.md` before invoking mise, handling errors, or writing tests.
- When the owner reports a visual or interaction error, evaluate whether it generalizes into a rule. If yes, fix the instance *and* codify the rule into `docs/design/ui-ux-rules.md` (and/or `visual-language.md`) in both locales as part of the same feedback cycle — the class of bug should be caught at generation time, not re-surface in later betas.

## Documentation languages

English is the canonical documentation language; the Chinese versions exist for Chinese-reading audiences. Every doc has both versions, bidirectionally linked at the top (`[简体中文]` / `[English]`). All Chinese docs live under `zh-CN/`, mirroring the English directory structure and file names exactly (e.g. `docs/adr/0001-x.md` ↔ `zh-CN/docs/adr/0001-x.md`). Editing either version without cascading the same change to the other is a bug.

Exemptions from the mirroring rule: `docs/feedback/` working docs (per-beta scratch/audits) and `HANDOFF.md` — the handoff is an ephemeral session-to-session marker, English-only by owner decision (2026-09-08).

## Session hygiene

Context is a budget, not an archive. Long contexts degrade (context rot, lost-in-middle) and burn tokens; the smart zone is smaller than the window.

- One ticket per context. When a ticket closes, the next one starts in a fresh session or a fresh subagent — never in the tail of the old context.
- Memory lives in artifacts — issues, docs, code — never in the conversation. Before ending any session, externalize what the next one needs (an issue comment, a closing note).
- Proactively suggest a fresh session when: a ticket just closed and another begins; the session has drifted across unrelated topics; or the context has grown long enough that a fresh read of the docs beats trusting compacted memory.
- Delegate isolated subtasks (exploration, bulk edits, verification passes) to subagents with their own context instead of growing the main one. When driving tickets autonomously, run each ticket as a subagent and keep the driver context thin.

## Git

Agents may commit and push as part of completing a ticket: commit to master once the Definition of done passes, message referencing the issue (`#N`). Use a `ticket/NN-*` branch + PR only when running parallel worktrees. master must always stay green. Never force-push, rewrite published history, or delete branches/tags.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
