# MiseDeck

> [简体中文](./zh-CN/AGENTS.md)

An open-source desktop GUI client for [mise](https://mise.jdx.dev). Tauri 2 + React/TypeScript, cross-platform (macOS polished first, Windows/Linux beta). Product principles:

1. **GUI edition of the CLI**: MiseDeck is the GUI counterpart of the mise CLI — using the GUI should gradually teach the CLI, not hide it.
2. **CLI-shaped interaction**: follow mise CLI's usage and interaction logic; do not invent foreign product or interaction patterns the CLI does not have.
3. **CLI vocabulary only**: no concepts or terms that mise does not have (ADR-0004); build the product from mise's own concepts and nouns.

## Before you code

- Read `CONTEXT.md` (domain glossary) and any ADR in `docs/adr/` touching your area. Use glossary vocabulary in code, issues, and UI copy.
- The v1 spec and implementation tickets live in GitHub Issues (`ready-for-agent` label); see `docs/agents/issue-tracker.md`.
- UI work derives color, type, layout, and motion from `docs/design/visual-language.md` (issue #33); never invent new tokens or effects.

## Working agreement (one ticket per session)

- Work on exactly ONE ticket per session. Tickets are GitHub issues labelled `ready-for-agent`; a ticket is startable only when every issue in its "Blocked by" list is closed. Check with `gh issue view <n> --json issueDependenciesSummary` or look at the issue page.
- Before writing code: read the ticket, this file, `docs/agents/architecture.md`, and `docs/agents/conventions.md`. Starting the scaffold ticket (#17)? Also read `docs/agents/getting-started.md`.
- Stay inside the ticket's acceptance criteria. Notice something the ticket does not cover? Comment on the issue instead of expanding scope.
- Autonomous mode: when the user asks you to drive tickets continuously, after closing one ticket move straight to the next startable one. Stop and ask only when: a decision needs human taste (visual design, naming), an outward-facing action is required (release, repo settings, secrets), the same ticket has failed three attempts, or requirements are ambiguous.

## Non-negotiables

- The maintainer is a product owner, not a code reviewer. Self-verify every change: build, run, and look at the running app before claiming done — screenshot it using whatever UI-automation or screenshot capability your harness provides. Leave no red tests and no broken build.
- Every mutating action goes through the execution panel: show the exact mise command and its live logs.
- All UI strings go through i18n (en + zh-CN); no hardcoded copy.
- Cross-platform from day one: paths and process spawning via Tauri/Rust APIs only.
- Read `docs/agents/architecture.md` before creating or modifying any Tauri command, and `docs/agents/conventions.md` before invoking mise, handling errors, or writing tests.

## Documentation languages

English is the canonical documentation language; the Chinese versions exist for Chinese-reading audiences. Every doc has both versions, bidirectionally linked at the top (`[简体中文]` / `[English]`). All Chinese docs live under `zh-CN/`, mirroring the English directory structure and file names exactly (e.g. `docs/adr/0001-x.md` ↔ `zh-CN/docs/adr/0001-x.md`). Editing either version without cascading the same change to the other is a bug.

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
