# UI/UX Rules

> [简体中文](../../zh-CN/docs/design/ui-ux-rules.md)

Binding interaction and presentation rules for every page, component, style, and piece of copy in MiseDeck. `visual-language.md` owns tokens (color, type, spacing, motion); this document owns *behavior*. Both were distilled from real beta review cycles — each rule below exists because its violation shipped and a human had to catch it.

## The one-question test

Before shipping any screen, ask: **could a mise CLI user predict what this screen does?** (ADR-0004.) If the answer needs product knowledge the CLI does not have, the design is wrong, not the user.

## Data honesty

- Render data exactly as mise reports it. Paths, versions, backend names, and identifiers keep their original case — `vfox:mise-plugins/vfox-1password` stays as-is. Uppercase + wide tracking is for section labels only, never for data.
- Missing data renders as `—` or the column is dropped. Never fill a column with a hardcoded or fabricated value — a wrong fact is worse than no fact.
- When the GUI mirrors a CLI default (e.g. `mise settings ls` shows only explicitly-set keys), keep the CLI behavior as the default; any wider view is an explicit opt-in control labeled with its flag (`--all`).

## Teaching

- Every mutating action shows the exact mise command — including confirmations. A confirmation is a teaching moment: "This will run `mise uninstall go@1.27.0`."
- Empty states guide inside the GUI: show the button or the resolved global data. An empty state that tells the user to go run a CLI command has failed its job.
- Long result lists (queries, logs, versions) are collapsible and clearable; past ~10 rows, fold behind an "show all N" affordance.

## Interaction integrity

- Destructive actions (uninstall, unset, overwrite) always confirm first.
- A control that would be a no-op right now renders disabled — an active-looking button that does nothing ("Upgrade all" when everything is current) reads as broken.
- Every feature stays reachable in every layout state. Collapsing the sidebar hides labels, not capabilities — language, theme, and every page keep an icon entry.
- No dead ends: anything the user can browse offers its natural next step (a Registry row offers "Install…").

## Layout & typography

- Long data never breaks mid-token. Use `nowrap` + ellipsis + tooltip, or scroll inside its container. Flex/grid cells carrying data get `min-width: 0`.
- Table headers sit exactly over their columns; every button and input lives under a labeled header.
- Status reads as `label: value badge` on one line, badge adjacent to the item it describes. No loose two-column grids where a badge's ownership is ambiguous.
- zh-CN copy: no orphan characters on a trailing line; inline code spans are `nowrap`.
- Both languages get the same visual treatment — if English is a styled banner, Chinese is the same banner, not a plain sentence.

## Chrome & themes

- Window chrome (title bar) follows the resolved theme; verify, because it is configured on the Rust side, not in CSS.
- Light and dark are designed counterparts. A screen is done when it has been *seen* in both.

## Copy

- All strings through i18n. Vocabulary comes from `CONTEXT.md` only. Retired from UI copy: "Context/上下文" and "project/项目" — say "current directory/当前目录".
- Outdated versions render as the upgrade path: `2026.8.14 ▹ 2026.9.0`, never as raw CLI prose, never as color alone.
- Popovers and menus render inside the app window; never as separate overlay windows.

## Verify economically

Default verification for a UI change is cheap: build, run the page you touched once, and self-audit the diff mechanically — data cells carry `nowrap`/`min-width: 0`, colors come from tokens, strings are i18n keys, retired vocabulary is absent, contrast is sound by token values. Reach for screenshots or a manual click-through only when the change restructures layout, or a human asks. If nobody saw the rendered result, mark the issue "not visually verified" and move on. Never claim visual verification you did not perform.

## Retired vocabulary (hard guardrails)

The hacker-HUD style is retired (visual-language guardrails). In practice this means: section labels carry no prompt glyphs (`▸`); labels may be uppercase-tracked mono, body text and data may not; emphasis comes from color and weight. Pair every removal with the positive form above — the goal is mise-family calm, not bareness.
